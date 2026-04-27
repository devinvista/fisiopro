import { db } from "@workspace/db";
import {
  appointmentsTable, patientsTable, proceduresTable, blockedSlotsTable,
  schedulesTable, clinicsTable, financialRecordsTable,
  appointmentReschedulesTable,
} from "@workspace/db";
import { eq, and, gte, lte, sql, lt, or } from "drizzle-orm";
import { buildPage, clampLimit, decodeCursor, type PaginatedResponse } from "../../../utils/pagination.js";
import { resolvePermissions, type Role } from "@workspace/db";
import type { AppointmentStatus } from "@workspace/shared-constants";
import { addMinutes, timeToMinutes, minutesToTime } from "./appointments.helpers.js";
import { getWithDetails, checkConflict } from "./appointments.repository.js";
import { isValidTransition } from "./appointments.schemas.js";
import { applyBillingRules } from "./appointments.billing.js";
import { logAudit } from "../../../utils/auditLog.js";
import {
  notFound, conflict as conflictErr, unprocessable, badRequest,
} from "./appointments.errors.js";

export type AuthCtx = {
  userId?: number;
  userName?: string | null;
  userRoles: Role[];
  isSuperAdmin?: boolean;
  clinicId?: number | null;
};

function isAdminOrSecretary(ctx: AuthCtx): boolean {
  const perms = resolvePermissions(ctx.userRoles ?? [], ctx.isSuperAdmin);
  return !!ctx.isSuperAdmin || perms.has("users.manage") || ctx.userRoles.includes("secretaria");
}

function describeConflict(reason: string | undefined, currentCount: number, maxCapacity: number, procedureName: string | undefined, startTime: string, endTime: string): string {
  if (reason === "duplicate_patient") {
    return `Este paciente já possui um agendamento ativo entre ${startTime} e ${endTime}. Não é permitido agendar o mesmo paciente em horários sobrepostos, mesmo que existam vagas.`;
  }
  if (maxCapacity > 1) {
    return reason === "full"
      ? `Horário lotado: ${currentCount}/${maxCapacity} vagas ocupadas${procedureName ? ` para "${procedureName}"` : ""} neste horário.`
      : `Conflito de horário: já existe uma sessão${procedureName ? ` de "${procedureName}"` : ""} que se sobrepõe a este horário.`;
  }
  return `Conflito de horário: já existe um agendamento entre ${startTime} e ${endTime}.`;
}

// ─── List ────────────────────────────────────────────────────────────────────
export async function listAppointments(filters: {
  date?: string; startDate?: string; endDate?: string;
  patientId?: string | number; status?: string;
  limit?: number; cursor?: string;
}, ctx: AuthCtx): Promise<PaginatedResponse<any>> {
  const limit = clampLimit(filters.limit);
  const cursor = decodeCursor(filters.cursor);

  const conditions: any[] = [];
  if (!ctx.isSuperAdmin && ctx.clinicId) {
    conditions.push(eq(appointmentsTable.clinicId, ctx.clinicId));
  }
  if (!isAdminOrSecretary(ctx) && ctx.userRoles.includes("profissional") && ctx.userId) {
    conditions.push(eq(appointmentsTable.professionalId, ctx.userId));
  }
  if (filters.date) conditions.push(eq(appointmentsTable.date, String(filters.date)));
  if (filters.startDate) conditions.push(gte(appointmentsTable.date, String(filters.startDate)));
  if (filters.endDate) conditions.push(lte(appointmentsTable.date, String(filters.endDate)));
  if (filters.patientId !== undefined) conditions.push(eq(appointmentsTable.patientId, parseInt(String(filters.patientId))));
  if (filters.status) conditions.push(eq(appointmentsTable.status, String(filters.status)));

  // Cursor: chave composta (date asc, id asc). `v` carrega `YYYY-MM-DD`.
  if (cursor) {
    conditions.push(
      or(
        sql`${appointmentsTable.date} > ${String(cursor.v)}`,
        and(
          eq(appointmentsTable.date, String(cursor.v)),
          sql`${appointmentsTable.id} > ${cursor.id}`,
        ),
      )!,
    );
  }

  let query = db
    .select({ appointment: appointmentsTable, patient: patientsTable, procedure: proceduresTable })
    .from(appointmentsTable)
    .leftJoin(patientsTable, eq(appointmentsTable.patientId, patientsTable.id))
    .leftJoin(proceduresTable, eq(appointmentsTable.procedureId, proceduresTable.id));

  if (conditions.length > 0) query = query.where(and(...conditions)) as any;

  const results = await query
    .orderBy(appointmentsTable.date, appointmentsTable.startTime, appointmentsTable.id)
    .limit(limit + 1);

  const flat = results.map(({ appointment, patient, procedure }) => ({ ...appointment, patient, procedure }));
  return buildPage(flat, limit, (row) => ({ v: String(row.date), id: row.id }));
}

// ─── Available slots ─────────────────────────────────────────────────────────
export async function getAvailableSlots(params: {
  date?: string; procedureId?: string | number; scheduleId?: string | number;
  clinicStart?: string; clinicEnd?: string;
}, ctx: AuthCtx) {
  if (!params.date || params.procedureId === undefined) {
    throw badRequest("date e procedureId são obrigatórios");
  }
  const date = String(params.date);
  let clinicStart = params.clinicStart ?? "08:00";
  let clinicEnd = params.clinicEnd ?? "18:00";
  let slotStep = 30;

  let resolvedScheduleId: number | null = null;
  if (params.scheduleId !== undefined) {
    resolvedScheduleId = parseInt(String(params.scheduleId));
    const [schedule] = await db.select().from(schedulesTable).where(eq(schedulesTable.id, resolvedScheduleId));
    if (schedule) {
      clinicStart = schedule.startTime;
      clinicEnd = schedule.endTime;
      slotStep = schedule.slotDurationMinutes ?? 30;
      if (schedule.workingDays) {
        const workingDayNums = schedule.workingDays.split(",").map(Number);
        const dateDow = new Date(date + "T12:00:00Z").getUTCDay();
        if (!workingDayNums.includes(dateDow)) {
          return {
            date,
            procedure: { id: 0, name: "", durationMinutes: 0, maxCapacity: 1 },
            slots: [],
            notWorkingDay: true,
          };
        }
      }
    }
  }

  const [procedure] = await db.select().from(proceduresTable).where(eq(proceduresTable.id, parseInt(String(params.procedureId))));
  if (!procedure) throw notFound("Procedimento não encontrado");

  const openMin = timeToMinutes(clinicStart);
  const closeMin = timeToMinutes(clinicEnd);
  const duration = procedure.durationMinutes;
  const maxCap = procedure.maxCapacity ?? 1;

  const apptConditions: any[] = [
    eq(appointmentsTable.date, date),
    sql`status NOT IN ('cancelado', 'faltou', 'remarcado')`,
  ];
  if (resolvedScheduleId) apptConditions.push(eq(appointmentsTable.scheduleId, resolvedScheduleId));

  const existingAppts = await db
    .select({ id: appointmentsTable.id, procedureId: appointmentsTable.procedureId, startTime: appointmentsTable.startTime, endTime: appointmentsTable.endTime })
    .from(appointmentsTable)
    .where(and(...apptConditions));

  const blockedConditions: any[] = [eq(blockedSlotsTable.date, date)];
  if (!ctx.isSuperAdmin && ctx.clinicId) blockedConditions.push(eq(blockedSlotsTable.clinicId, ctx.clinicId));
  if (resolvedScheduleId) blockedConditions.push(eq(blockedSlotsTable.scheduleId, resolvedScheduleId));

  const blockedSlots = await db
    .select({ startTime: blockedSlotsTable.startTime, endTime: blockedSlotsTable.endTime })
    .from(blockedSlotsTable)
    .where(and(...blockedConditions));

  const slots: { time: string; available: boolean; spotsLeft: number }[] = [];
  const effectiveStep = Math.min(slotStep, duration > 0 ? duration : slotStep);

  for (let start = openMin; start + duration <= closeMin; start += effectiveStep) {
    const startTime = minutesToTime(start);
    const slotEnd = start + duration;

    const isBlocked = blockedSlots.some(
      (b) => timeToMinutes(b.startTime) < slotEnd && timeToMinutes(b.endTime) > start
    );
    if (isBlocked) {
      slots.push({ time: startTime, available: false, spotsLeft: 0 });
      continue;
    }

    let spotsLeft: number;
    if (maxCap > 1) {
      const sameSessionCount = existingAppts.filter(
        (a) => a.procedureId === procedure.id && a.startTime === startTime
      ).length;
      const hasConflictingSession = existingAppts.some(
        (a) =>
          a.procedureId === procedure.id &&
          a.startTime !== startTime &&
          timeToMinutes(a.startTime) < slotEnd &&
          timeToMinutes(a.endTime) > start
      );
      spotsLeft = hasConflictingSession ? 0 : Math.max(0, maxCap - sameSessionCount);
    } else {
      const occupiedCount = existingAppts.filter(
        (a) => timeToMinutes(a.startTime) < slotEnd && timeToMinutes(a.endTime) > start
      ).length;
      spotsLeft = Math.max(0, maxCap - occupiedCount);
    }
    slots.push({ time: startTime, available: spotsLeft > 0, spotsLeft });
  }

  return {
    date,
    procedure: { id: procedure.id, name: procedure.name, durationMinutes: procedure.durationMinutes, maxCapacity: maxCap },
    slots,
  };
}

// ─── Create ──────────────────────────────────────────────────────────────────
export async function createAppointment(body: {
  patientId: number; procedureId: number; date: string; startTime: string;
  notes?: string | null; scheduleId: number | string; professionalId?: number | null;
}, ctx: AuthCtx) {
  const { patientId, procedureId, date, startTime, notes, scheduleId } = body;

  const [procedure] = await db.select().from(proceduresTable).where(eq(proceduresTable.id, procedureId));
  if (!procedure) throw notFound("Procedimento não encontrado");

  const endTime = addMinutes(startTime, procedure.durationMinutes);
  const maxCapacity = procedure.maxCapacity ?? 1;
  const resolvedScheduleId = parseInt(String(scheduleId));
  if (!Number.isFinite(resolvedScheduleId) || resolvedScheduleId <= 0) {
    throw badRequest("scheduleId é obrigatório");
  }

  const [schedule] = await db
    .select({ startTime: schedulesTable.startTime, endTime: schedulesTable.endTime })
    .from(schedulesTable)
    .where(eq(schedulesTable.id, resolvedScheduleId));
  if (schedule) {
    if (
      timeToMinutes(startTime) < timeToMinutes(schedule.startTime) ||
      timeToMinutes(endTime) > timeToMinutes(schedule.endTime)
    ) {
      throw unprocessable(
        "OutOfHours",
        `O procedimento extrapola o horário de atendimento da agenda (${schedule.startTime}–${schedule.endTime}). Escolha um horário em que o procedimento termine até às ${schedule.endTime}.`
      );
    }
  }

  const { conflict, currentCount, reason } = await checkConflict(
    date, startTime, endTime, procedure.id, maxCapacity, undefined, resolvedScheduleId, ctx.clinicId, patientId
  );
  if (conflict) {
    throw conflictErr(describeConflict(reason, currentCount, maxCapacity, procedure.name, startTime, endTime));
  }

  const resolvedProfessionalId = isAdminOrSecretary(ctx)
    ? (body.professionalId ?? ctx.userId)
    : ctx.userId;

  const [appointment] = await db
    .insert(appointmentsTable)
    .values({
      patientId, procedureId, date, startTime, endTime,
      status: "agendado", notes,
      professionalId: resolvedProfessionalId,
      clinicId: ctx.clinicId ?? null,
      scheduleId: resolvedScheduleId,
    })
    .returning();

  const actor = ctx.userName ?? `usuário #${ctx.userId}`;
  await logAudit({
    userId: ctx.userId, userName: ctx.userName ?? undefined,
    patientId, action: "create", entityType: "appointment", entityId: appointment.id,
    summary: `Agendamento criado: ${procedure.name} em ${date} às ${startTime} (por ${actor})`,
  });

  return await getWithDetails(appointment.id);
}

// ─── Get one ─────────────────────────────────────────────────────────────────
export async function getAppointment(id: number, ctx: AuthCtx) {
  const details = await getWithDetails(id, ctx.clinicId);
  if (!details) throw notFound();
  return details;
}

// ─── Update ──────────────────────────────────────────────────────────────────
export async function updateAppointment(id: number, body: {
  patientId?: number; procedureId?: number; date?: string; startTime?: string;
  status?: string; notes?: string | null;
}, ctx: AuthCtx) {
  const { patientId, procedureId, date, startTime, status, notes } = body;

  const currentAppt = await getWithDetails(id);
  if (!currentAppt) throw notFound();
  const oldStatus = currentAppt.status;

  if (status && status !== oldStatus) {
    if (!isValidTransition(oldStatus, status, isAdminOrSecretary(ctx))) {
      throw unprocessable("InvalidTransition", `Não é possível alterar de "${oldStatus}" para "${status}".`);
    }
  }

  // Cancellation policy
  if (status === "cancelado" && oldStatus !== "cancelado") {
    if (!isAdminOrSecretary(ctx) && ctx.clinicId) {
      const [clinic] = await db
        .select({ cancellationPolicyHours: clinicsTable.cancellationPolicyHours })
        .from(clinicsTable)
        .where(eq(clinicsTable.id, ctx.clinicId))
        .limit(1);
      if (clinic?.cancellationPolicyHours && clinic.cancellationPolicyHours > 0) {
        const apptDatetime = new Date(`${currentAppt.date}T${currentAppt.startTime}:00`);
        const nowBRT = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
        const diffHours = (apptDatetime.getTime() - nowBRT.getTime()) / (1000 * 60 * 60);
        if (diffHours < clinic.cancellationPolicyHours && diffHours > 0) {
          throw unprocessable(
            "CancellationPolicyViolation",
            `Cancelamento não permitido: a política da clínica exige aviso com ${clinic.cancellationPolicyHours}h de antecedência. Contate a secretaria.`
          );
        }
      }
    }
  }

  let endTime: string | undefined;
  let maxCapacity = 1;
  let effectiveProcedureId = procedureId;
  let effectiveScheduleId: number | null = null;

  const needsEndTimeRecalc = !!(startTime || procedureId);
  if (needsEndTimeRecalc) {
    const targetProcedureId = procedureId ?? currentAppt.procedureId;
    const targetStartTime = startTime ?? currentAppt.startTime;
    const [proc] = await db.select().from(proceduresTable).where(eq(proceduresTable.id, targetProcedureId));
    if (proc) {
      endTime = addMinutes(targetStartTime, proc.durationMinutes);
      maxCapacity = proc.maxCapacity ?? 1;
      effectiveProcedureId = targetProcedureId;
      effectiveScheduleId = currentAppt.scheduleId ?? null;
    }
  }

  const targetDate = date ?? currentAppt.date;
  const targetStart = startTime ?? currentAppt.startTime;
  if (endTime && effectiveProcedureId != null) {
    const targetPatientId = patientId ?? currentAppt.patientId;
    const { conflict, currentCount, reason } = await checkConflict(
      targetDate, targetStart, endTime, effectiveProcedureId, maxCapacity, id, effectiveScheduleId, ctx.clinicId, targetPatientId
    );
    if (conflict) {
      throw conflictErr(describeConflict(reason, currentCount, maxCapacity, undefined, targetStart, endTime));
    }
  }

  const updateFields: Record<string, any> = {};
  if (patientId !== undefined) updateFields.patientId = patientId;
  if (procedureId !== undefined) updateFields.procedureId = procedureId;
  if (date !== undefined) updateFields.date = date;
  if (startTime !== undefined) updateFields.startTime = startTime;
  if (endTime !== undefined) updateFields.endTime = endTime;
  if (status !== undefined) updateFields.status = status;
  if (notes !== undefined) updateFields.notes = notes;

  if (status === "confirmado" && oldStatus !== "confirmado") {
    updateFields.confirmedBy = isAdminOrSecretary(ctx) ? "secretaria" : "paciente";
    updateFields.confirmedAt = new Date();
  }

  const updateWhere = (!ctx.isSuperAdmin && ctx.clinicId)
    ? and(eq(appointmentsTable.id, id), eq(appointmentsTable.clinicId, ctx.clinicId))
    : eq(appointmentsTable.id, id);

  const [appointment] = await db.update(appointmentsTable).set(updateFields).where(updateWhere).returning();
  if (!appointment) throw notFound();

  if (status && status !== oldStatus) {
    await applyBillingRules(appointment.id, status, oldStatus, ctx.clinicId);
  }

  const auditActor = ctx.userName ?? `usuário #${ctx.userId}`;
  if (status && status !== oldStatus) {
    await logAudit({
      userId: ctx.userId, userName: ctx.userName ?? undefined,
      patientId: currentAppt.patientId, action: "update", entityType: "appointment", entityId: id,
      summary: `Status: ${oldStatus} → ${status} (por ${auditActor})`,
    });
  } else if (Object.keys(updateFields).length > 0) {
    await logAudit({
      userId: ctx.userId, userName: ctx.userName ?? undefined,
      patientId: currentAppt.patientId, action: "update", entityType: "appointment", entityId: id,
      summary: `Agendamento atualizado (por ${auditActor})`,
    });
  }

  return await getWithDetails(appointment.id);
}

// ─── Delete ──────────────────────────────────────────────────────────────────
export async function deleteAppointment(id: number, ctx: AuthCtx) {
  const whereClause = (!ctx.isSuperAdmin && ctx.clinicId)
    ? and(eq(appointmentsTable.id, id), eq(appointmentsTable.clinicId, ctx.clinicId))
    : eq(appointmentsTable.id, id);
  const [deleted] = await db.delete(appointmentsTable).where(whereClause).returning({ id: appointmentsTable.id });
  if (!deleted) throw notFound();
  await logAudit({
    userId: ctx.userId, action: "delete", entityType: "appointment", entityId: id,
    summary: `Agendamento excluído`,
  });
}

// ─── Reschedule ──────────────────────────────────────────────────────────────
export async function rescheduleAppointment(id: number, body: {
  date: string; startTime: string; notes?: string | null;
}, ctx: AuthCtx) {
  const { date, startTime, notes } = body;

  const original = await getWithDetails(id, ctx.clinicId);
  if (!original) throw notFound();

  const blockableStatuses: string[] = ["agendado", "confirmado", "faltou"] satisfies AppointmentStatus[];
  if (!blockableStatuses.includes(original.status)) {
    throw unprocessable("InvalidOperation", `Não é possível remarcar um agendamento com status "${original.status}".`);
  }
  if (!original.procedure) {
    throw unprocessable("InvalidOperation", "Procedimento do agendamento não encontrado.");
  }

  const endTime = addMinutes(startTime, original.procedure.durationMinutes);
  const maxCapacity = original.procedure.maxCapacity ?? 1;

  if (original.scheduleId) {
    const [schedule] = await db
      .select({ startTime: schedulesTable.startTime, endTime: schedulesTable.endTime })
      .from(schedulesTable)
      .where(eq(schedulesTable.id, original.scheduleId));
    if (schedule) {
      if (
        timeToMinutes(startTime) < timeToMinutes(schedule.startTime) ||
        timeToMinutes(endTime) > timeToMinutes(schedule.endTime)
      ) {
        throw unprocessable(
          "OutOfHours",
          `O procedimento extrapola o horário de atendimento da agenda (${schedule.startTime}–${schedule.endTime}). Escolha um horário em que o procedimento termine até às ${schedule.endTime}.`
        );
      }
    }
  }

  const { conflict, currentCount, reason } = await checkConflict(
    date, startTime, endTime, original.procedureId, maxCapacity, id, original.scheduleId, ctx.clinicId, original.patientId
  );
  if (conflict) {
    throw conflictErr(describeConflict(reason, currentCount, maxCapacity, undefined, startTime, endTime));
  }

  const previousRescheduleCount = (original as any).rescheduleCount ?? 0;
  const isFirstReschedule = previousRescheduleCount === 0;

  const updated = await db.transaction(async (tx) => {
    await tx.insert(appointmentReschedulesTable).values({
      appointmentId: id,
      fromDate: original.date,
      fromStartTime: original.startTime,
      fromEndTime: original.endTime,
      toDate: date,
      toStartTime: startTime,
      toEndTime: endTime,
      reason: notes ?? null,
      rescheduledByUserId: ctx.userId,
      rescheduledByUserName: ctx.userName ?? null,
    });

    const setFields: Record<string, unknown> = {
      date,
      startTime,
      endTime,
      status: "agendado",
      rescheduleCount: previousRescheduleCount + 1,
      lastRescheduledAt: new Date(),
    };
    if (isFirstReschedule) {
      setFields.originalDate = original.date;
      setFields.originalStartTime = original.startTime;
    }
    if (notes !== undefined) setFields.notes = notes;

    const [row] = await tx.update(appointmentsTable)
      .set(setFields)
      .where(eq(appointmentsTable.id, id))
      .returning();
    return row;
  });

  await db.update(financialRecordsTable)
    .set({ status: "cancelado" })
    .where(and(
      eq(financialRecordsTable.appointmentId, id),
      eq(financialRecordsTable.transactionType, "taxaNoShow"),
      eq(financialRecordsTable.status, "pendente")
    ));

  const actor = ctx.userName ?? `usuário #${ctx.userId}`;
  await logAudit({
    userId: ctx.userId, userName: ctx.userName ?? undefined,
    patientId: original.patientId, action: "update", entityType: "appointment", entityId: id,
    summary: `Remarcado de ${original.date} ${original.startTime} para ${date} ${startTime} (por ${actor})`,
  });

  const details = await getWithDetails(id);
  return { appointment: details };
}

// ─── Reschedule history ───────────────────────────────────────────────────────
export async function getAppointmentReschedules(appointmentId: number, ctx: AuthCtx) {
  const appt = await getWithDetails(appointmentId, ctx.clinicId);
  if (!appt) throw notFound();
  const rows = await db
    .select()
    .from(appointmentReschedulesTable)
    .where(eq(appointmentReschedulesTable.appointmentId, appointmentId))
    .orderBy(appointmentReschedulesTable.rescheduledAt);
  return rows;
}

export async function getPatientReschedules(patientId: number, ctx: AuthCtx) {
  const rows = await db
    .select({
      reschedule: appointmentReschedulesTable,
      appointment: appointmentsTable,
    })
    .from(appointmentReschedulesTable)
    .innerJoin(appointmentsTable, eq(appointmentReschedulesTable.appointmentId, appointmentsTable.id))
    .where(and(
      eq(appointmentsTable.patientId, patientId),
      ctx.clinicId ? eq(appointmentsTable.clinicId, ctx.clinicId) : undefined,
    ))
    .orderBy(appointmentReschedulesTable.rescheduledAt);
  return rows;
}

// ─── Complete ────────────────────────────────────────────────────────────────
export async function completeAppointment(id: number, ctx: AuthCtx) {
  const details = await getWithDetails(id, ctx.clinicId);
  if (!details) throw notFound();

  const oldStatus = details.status;
  if (!isValidTransition(oldStatus, "concluido", isAdminOrSecretary(ctx))) {
    throw unprocessable("InvalidTransition", `Não é possível concluir um agendamento com status "${oldStatus}".`);
  }

  const [appointment] = await db
    .update(appointmentsTable)
    .set({ status: "concluido" })
    .where(eq(appointmentsTable.id, id))
    .returning();

  await applyBillingRules(id, "concluido", oldStatus, ctx.clinicId);

  const actor = ctx.userName ?? `usuário #${ctx.userId}`;
  await logAudit({
    userId: ctx.userId, userName: ctx.userName ?? undefined,
    patientId: details.patientId, action: "update", entityType: "appointment", entityId: id,
    summary: `Status: ${oldStatus} → concluido (por ${actor})`,
  });

  return await getWithDetails(appointment.id, ctx.clinicId);
}

// ─── Recurring ───────────────────────────────────────────────────────────────
export async function createRecurringAppointments(body: {
  patientId: number; procedureId: number; date: string; startTime: string;
  notes?: string | null; scheduleId: number | string; professionalId?: number | null;
  recurrence: { daysOfWeek: number[]; totalSessions: number };
}, ctx: AuthCtx) {
  const { patientId, procedureId, date, startTime, notes, recurrence, scheduleId } = body;
  const { daysOfWeek, totalSessions } = recurrence;

  const [procedure] = await db.select().from(proceduresTable).where(eq(proceduresTable.id, procedureId));
  if (!procedure) throw notFound("Procedimento não encontrado");

  const resolvedScheduleId = parseInt(String(scheduleId));
  if (!Number.isFinite(resolvedScheduleId) || resolvedScheduleId <= 0) {
    throw badRequest("scheduleId é obrigatório");
  }
  const resolvedProfessionalId = isAdminOrSecretary(ctx)
    ? (body.professionalId ?? ctx.userId)
    : ctx.userId;

  const endTimeFn = (st: string) => addMinutes(st, procedure.durationMinutes);
  const maxCapacity = procedure.maxCapacity ?? 1;
  const recurrenceGroupId = `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const created: any[] = [];
  const skipped: any[] = [];

  let sessionCount = 0;
  let cursor = new Date(date + "T12:00:00Z");
  let safetyLimit = 0;

  while (sessionCount < totalSessions && safetyLimit < 500) {
    safetyLimit++;
    const dow = cursor.getUTCDay();
    if (daysOfWeek.includes(dow)) {
      const sessionDate = cursor.toISOString().slice(0, 10);
      const et = endTimeFn(startTime);
      const { conflict, reason, currentCount } = await checkConflict(
        sessionDate, startTime, et, procedure.id, maxCapacity, undefined, resolvedScheduleId, ctx.clinicId, patientId
      );
      if (conflict) {
        skipped.push({ date: sessionDate, reason: reason || "conflict", currentCount });
      } else {
        const [apt] = await db.insert(appointmentsTable).values({
          patientId, procedureId,
          date: sessionDate, startTime, endTime: et,
          status: "agendado",
          notes: notes || undefined,
          professionalId: resolvedProfessionalId,
          clinicId: ctx.clinicId ?? null,
          scheduleId: resolvedScheduleId,
          recurrenceGroupId,
          recurrenceIndex: sessionCount,
        }).returning();
        created.push(apt);
        sessionCount++;
      }
    }
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }

  return { created: created.length, skipped: skipped.length, recurrenceGroupId, skippedDetails: skipped };
}

// ─── Billing rules ───────────────────────────────────────────────────────────
// Re-exported from the billing module (kept separate due to its size and focus).
export { applyBillingRules } from "./appointments.billing.js";
