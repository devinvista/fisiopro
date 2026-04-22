import { Router } from "express";
import { db } from "@workspace/db";
import {
  appointmentsTable,
  patientsTable,
  proceduresTable,
  blockedSlotsTable,
  treatmentPlansTable,
  clinicsTable,
  patientPackagesTable,
  schedulesTable,
  subscriptionPlansTable,
} from "@workspace/db";
import { todayBRT } from "../../utils/dateUtils.js";
import { eq, and, sql, desc, or, isNull, gt, asc } from "drizzle-orm";
import { randomUUID } from "crypto";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const totalMinutes = h * 60 + m + minutes;
  const newH = Math.floor(totalMinutes / 60) % 24;
  const newM = totalMinutes % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ── GET /api/public/plans ─────────────────────────────────────────────────────
// Lista planos de assinatura ativos (sem autenticação)
router.get("/plans", async (_req, res) => {
  try {
    const plans = await db
      .select()
      .from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.isActive, true))
      .orderBy(asc(subscriptionPlansTable.price));
    res.json(plans);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── GET /api/public/patient-lookup ───────────────────────────────────────────
// Busca paciente por CPF ou telefone (sem autenticação)
router.get("/patient-lookup", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== "string" || q.trim().length < 4) {
      res.json({ found: false });
      return;
    }

    const cleaned = q.replace(/\D/g, "");
    let patient: typeof patientsTable.$inferSelect | undefined;

    // Try CPF — search by formatted AND raw digits to handle both storage formats
    if (cleaned.length === 11) {
      const cpfFormatted = cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
      const rows = await db
        .select()
        .from(patientsTable)
        .where(
          sql`regexp_replace(${patientsTable.cpf}, '[^0-9]', '', 'g') = ${cleaned}`
        )
        .limit(1);
      patient = rows[0];
      // Fallback: exact match on formatted string
      if (!patient) {
        const rows2 = await db
          .select()
          .from(patientsTable)
          .where(eq(patientsTable.cpf, cpfFormatted))
          .limit(1);
        patient = rows2[0];
      }
    }

    // Try phone (exact match on cleaned digits, last 9 or 10 chars)
    if (!patient && cleaned.length >= 8) {
      const allByPhone = await db
        .select()
        .from(patientsTable)
        .where(sql`regexp_replace(phone, '[^0-9]', '', 'g') LIKE ${"%" + cleaned.slice(-9)}`)
        .limit(1);
      patient = allByPhone[0];
    }

    // Try phone (original string)
    if (!patient) {
      const rows = await db
        .select()
        .from(patientsTable)
        .where(eq(patientsTable.phone, q.trim()))
        .limit(1);
      patient = rows[0];
    }

    if (!patient) {
      res.json({ found: false });
      return;
    }

    // Active treatment plan
    const plans = await db
      .select()
      .from(treatmentPlansTable)
      .where(
        and(
          eq(treatmentPlansTable.patientId, patient.id),
          eq(treatmentPlansTable.status, "ativo")
        )
      )
      .limit(1);
    const activePlan = plans[0] ?? null;

    // Determine active clinic: from treatment plan first, then from active patient package
    let activeClinicId: number | null = activePlan?.clinicId ?? null;

    if (!activeClinicId) {
      const today = todayBRT();
      const activePackages = await db
        .select({ clinicId: patientPackagesTable.clinicId })
        .from(patientPackagesTable)
        .where(
          and(
            eq(patientPackagesTable.patientId, patient.id),
            sql`${patientPackagesTable.usedSessions} < ${patientPackagesTable.totalSessions}`,
            or(
              isNull(patientPackagesTable.expiryDate),
              gt(patientPackagesTable.expiryDate, today)
            )
          )
        )
        .limit(1);
      activeClinicId = activePackages[0]?.clinicId ?? null;
    }

    // Fetch clinic name if we have a clinic
    let activeClinicName: string | null = null;
    if (activeClinicId) {
      const clinicRows = await db
        .select({ name: clinicsTable.name })
        .from(clinicsTable)
        .where(eq(clinicsTable.id, activeClinicId))
        .limit(1);
      activeClinicName = clinicRows[0]?.name ?? null;
    }

    // Most frequently used procedure IDs (from appointment history)
    const recentAppts = await db
      .select({ procedureId: appointmentsTable.procedureId })
      .from(appointmentsTable)
      .where(
        and(
          eq(appointmentsTable.patientId, patient.id),
          sql`${appointmentsTable.status} NOT IN ('cancelado', 'faltou')`
        )
      )
      .orderBy(desc(appointmentsTable.createdAt))
      .limit(20);

    const freq: Record<number, number> = {};
    recentAppts.forEach((a) => {
      if (a.procedureId) freq[a.procedureId] = (freq[a.procedureId] ?? 0) + 1;
    });
    const recommendedProcedureIds = Object.entries(freq)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .map(([id]) => Number(id));

    res.json({
      found: true,
      patient: {
        id: patient.id,
        name: patient.name,
        phone: patient.phone,
        email: patient.email ?? null,
        cpf: patient.cpf,
      },
      activeTreatmentPlan: activePlan
        ? {
            id: activePlan.id,
            objectives: activePlan.objectives,
            techniques: activePlan.techniques,
            frequency: activePlan.frequency,
            estimatedSessions: activePlan.estimatedSessions,
            status: activePlan.status,
          }
        : null,
      activeClinicId,
      activeClinicName,
      recommendedProcedureIds,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── GET /api/public/procedures ────────────────────────────────────────────────
// Lista procedimentos disponíveis para agendamento online
// Se clinicId for fornecido, retorna procedimentos globais + específicos daquela clínica
router.get("/procedures", async (req, res) => {
  try {
    const clinicId = req.query.clinicId ? parseInt(req.query.clinicId as string) : null;

    const whereClause = clinicId
      ? and(
          eq(proceduresTable.onlineBookingEnabled, true),
          eq(proceduresTable.isActive, true),
          or(isNull(proceduresTable.clinicId), eq(proceduresTable.clinicId, clinicId))
        )
      : and(
          eq(proceduresTable.onlineBookingEnabled, true),
          eq(proceduresTable.isActive, true)
        );

    const procedures = await db
      .select({
        id: proceduresTable.id,
        name: proceduresTable.name,
        category: proceduresTable.category,
        durationMinutes: proceduresTable.durationMinutes,
        price: proceduresTable.price,
        description: proceduresTable.description,
        maxCapacity: proceduresTable.maxCapacity,
      })
      .from(proceduresTable)
      .where(whereClause)
      .orderBy(proceduresTable.category, proceduresTable.name);

    res.json(procedures);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── GET /api/public/schedules ─────────────────────────────────────────────────
// Retorna agendas ativas de uma clínica para o agendamento online
router.get("/schedules", async (req, res) => {
  try {
    const { clinicId } = req.query;
    if (!clinicId) {
      res.status(400).json({ error: "clinicId é obrigatório" });
      return;
    }

    const schedules = await db
      .select({
        id: schedulesTable.id,
        name: schedulesTable.name,
        description: schedulesTable.description,
        type: schedulesTable.type,
        workingDays: schedulesTable.workingDays,
        startTime: schedulesTable.startTime,
        endTime: schedulesTable.endTime,
        slotDurationMinutes: schedulesTable.slotDurationMinutes,
        color: schedulesTable.color,
      })
      .from(schedulesTable)
      .where(
        and(
          eq(schedulesTable.clinicId, parseInt(clinicId as string)),
          eq(schedulesTable.isActive, true)
        )
      )
      .orderBy(schedulesTable.name);

    res.json(schedules);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── GET /api/public/available-slots ──────────────────────────────────────────
// Retorna horários disponíveis para um procedimento e data
router.get("/available-slots", async (req, res) => {
  try {
    const { date, procedureId } = req.query;

    if (!date || !procedureId) {
      res.status(400).json({ error: "date e procedureId são obrigatórios" });
      return;
    }

    const [procedure] = await db
      .select()
      .from(proceduresTable)
      .where(
        and(
          eq(proceduresTable.id, parseInt(procedureId as string)),
          eq(proceduresTable.onlineBookingEnabled, true)
        )
      );

    if (!procedure) {
      res.status(404).json({ error: "Procedimento não encontrado ou não disponível para agendamento online" });
      return;
    }

    const duration = procedure.durationMinutes;
    const maxCap = procedure.maxCapacity ?? 1;

    const clinicId = req.query.clinicId ? parseInt(req.query.clinicId as string) : null;
    const scheduleId = req.query.scheduleId ? parseInt(req.query.scheduleId as string) : null;

    // Use schedule's working hours and slot duration if scheduleId provided
    let openMin = timeToMinutes("08:00");
    let closeMin = timeToMinutes("18:00");
    let stepMinutes = 30;

    if (scheduleId) {
      const [schedule] = await db
        .select()
        .from(schedulesTable)
        .where(eq(schedulesTable.id, scheduleId));

      if (schedule) {
        openMin = timeToMinutes(schedule.startTime);
        closeMin = timeToMinutes(schedule.endTime);
        stepMinutes = schedule.slotDurationMinutes;

        // Check if the selected date is a working day for this schedule
        const dateObj = new Date(date as string + "T12:00:00Z");
        const dayOfWeek = dateObj.getUTCDay(); // 0=Sun,1=Mon,...,6=Sat
        const workingDays = schedule.workingDays.split(",").map(Number);
        if (!workingDays.includes(dayOfWeek)) {
          res.json({ date, procedure: { id: procedure.id, name: procedure.name, durationMinutes: procedure.durationMinutes, price: procedure.price, maxCapacity: maxCap }, slots: [] });
          return;
        }
      }
    }

    // Filter appointments by scheduleId (if provided) or clinicId
    const apptWhereClause = scheduleId
      ? and(
          eq(appointmentsTable.date, date as string),
          sql`status NOT IN ('cancelado', 'faltou')`,
          eq(appointmentsTable.scheduleId, scheduleId)
        )
      : clinicId
      ? and(
          eq(appointmentsTable.date, date as string),
          sql`status NOT IN ('cancelado', 'faltou')`,
          eq(appointmentsTable.clinicId, clinicId)
        )
      : and(
          eq(appointmentsTable.date, date as string),
          sql`status NOT IN ('cancelado', 'faltou')`
        );

    const existingAppts = await db
      .select({
        id: appointmentsTable.id,
        procedureId: appointmentsTable.procedureId,
        startTime: appointmentsTable.startTime,
        endTime: appointmentsTable.endTime,
      })
      .from(appointmentsTable)
      .where(apptWhereClause);

    // Filter blocked slots by scheduleId if provided
    const blockedWhereClause = scheduleId
      ? and(
          eq(blockedSlotsTable.date, date as string),
          eq(blockedSlotsTable.scheduleId, scheduleId)
        )
      : eq(blockedSlotsTable.date, date as string);

    const blockedSlots = await db
      .select({ startTime: blockedSlotsTable.startTime, endTime: blockedSlotsTable.endTime })
      .from(blockedSlotsTable)
      .where(blockedWhereClause);

    const slots: { time: string; available: boolean; spotsLeft: number }[] = [];

    for (let start = openMin; start + duration <= closeMin; start += stepMinutes) {
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
          (a) =>
            timeToMinutes(a.startTime) < slotEnd &&
            timeToMinutes(a.endTime) > start
        ).length;
        spotsLeft = Math.max(0, maxCap - occupiedCount);
      }

      slots.push({ time: startTime, available: spotsLeft > 0, spotsLeft });
    }

    res.json({
      date,
      procedure: {
        id: procedure.id,
        name: procedure.name,
        durationMinutes: procedure.durationMinutes,
        price: procedure.price,
        maxCapacity: maxCap,
      },
      slots: slots.filter((s) => s.available),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── POST /api/public/book ─────────────────────────────────────────────────────
// Cria um agendamento público (sem autenticação)
router.post("/book", async (req, res) => {
  try {
    const { procedureId, date, startTime, patientName, patientPhone, patientEmail, patientCpf, notes, clinicId, scheduleId } = req.body;

    if (!procedureId || !date || !startTime || !patientName || !patientPhone) {
      res.status(400).json({
        error: "Bad Request",
        message: "procedureId, date, startTime, patientName e patientPhone são obrigatórios",
      });
      return;
    }

    // Verificar procedimento disponível para agendamento online
    const [procedure] = await db
      .select()
      .from(proceduresTable)
      .where(
        and(
          eq(proceduresTable.id, parseInt(procedureId)),
          eq(proceduresTable.onlineBookingEnabled, true)
        )
      );

    if (!procedure) {
      res.status(404).json({ error: "Procedimento não disponível para agendamento online" });
      return;
    }

    const endTime = addMinutes(startTime, procedure.durationMinutes);
    const maxCapacity = procedure.maxCapacity ?? 1;

    // Verificar conflito de horário
    const conditions = [
      eq(appointmentsTable.date, date),
      sql`status NOT IN ('cancelado', 'faltou')`,
    ];

    if (maxCapacity > 1) {
      const sameSession = await db
        .select({ id: appointmentsTable.id })
        .from(appointmentsTable)
        .where(
          and(
            eq(appointmentsTable.date, date),
            eq(appointmentsTable.procedureId, procedure.id),
            eq(appointmentsTable.startTime, startTime),
            sql`status NOT IN ('cancelado', 'faltou')`
          )
        );

      if (sameSession.length >= maxCapacity) {
        res.status(409).json({
          error: "Conflict",
          message: `Horário lotado: ${sameSession.length}/${maxCapacity} vagas ocupadas.`,
        });
        return;
      }
    } else {
      const existing = await db
        .select({ id: appointmentsTable.id })
        .from(appointmentsTable)
        .where(
          and(
            ...conditions,
            sql`start_time < ${endTime} AND end_time > ${startTime}`
          )
        );

      if (existing.length > 0) {
        res.status(409).json({
          error: "Conflict",
          message: `Horário indisponível: já existe um agendamento entre ${startTime} e ${endTime}.`,
        });
        return;
      }
    }

    // Buscar ou criar paciente pelo CPF (se fornecido) ou telefone
    let patientId: number;

    if (patientCpf) {
      const normalizedCpf = patientCpf.replace(/\D/g, "");
      const existingPatient = await db
        .select({ id: patientsTable.id })
        .from(patientsTable)
        .where(sql`regexp_replace(${patientsTable.cpf}, '[^0-9]', '', 'g') = ${normalizedCpf}`)
        .limit(1);

      if (existingPatient.length > 0) {
        patientId = existingPatient[0].id;
        // Atualizar telefone e email se necessário
        await db
          .update(patientsTable)
          .set({ phone: patientPhone, ...(patientEmail ? { email: patientEmail } : {}) })
          .where(eq(patientsTable.id, patientId));
      } else {
        const [newPatient] = await db
          .insert(patientsTable)
          .values({
            name: patientName,
            cpf: normalizedCpf,
            phone: patientPhone,
            email: patientEmail || null,
          })
          .returning({ id: patientsTable.id });
        patientId = newPatient.id;
      }
    } else {
      // Sem CPF: criar paciente com telefone como identificador único tentativo
      const existingByPhone = await db
        .select({ id: patientsTable.id })
        .from(patientsTable)
        .where(eq(patientsTable.phone, patientPhone))
        .limit(1);

      if (existingByPhone.length > 0) {
        patientId = existingByPhone[0].id;
      } else {
        // Gerar CPF placeholder único para não violar constraint UNIQUE
        const phonePlaceholder = `000.${patientPhone.replace(/\D/g, "").slice(-6, -3)}.${patientPhone.replace(/\D/g, "").slice(-3)}-00`;
        const [newPatient] = await db
          .insert(patientsTable)
          .values({
            name: patientName,
            cpf: phonePlaceholder,
            phone: patientPhone,
            email: patientEmail || null,
          })
          .returning({ id: patientsTable.id });
        patientId = newPatient.id;
      }
    }

    // Gerar token único para o agendamento
    const bookingToken = randomUUID();

    // Criar agendamento
    const [appointment] = await db
      .insert(appointmentsTable)
      .values({
        patientId,
        procedureId: procedure.id,
        date,
        startTime,
        endTime,
        status: "agendado",
        notes: notes || null,
        bookingToken,
        source: "online",
        clinicId: clinicId ? parseInt(clinicId) : null,
        scheduleId: scheduleId ? parseInt(scheduleId) : null,
      })
      .returning();

    res.status(201).json({
      success: true,
      bookingToken,
      appointment: {
        id: appointment.id,
        date: appointment.date,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        status: appointment.status,
        procedure: {
          name: procedure.name,
          durationMinutes: procedure.durationMinutes,
          price: procedure.price,
        },
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── GET /api/public/booking/:token ────────────────────────────────────────────
// Consulta os detalhes de um agendamento pelo token
router.get("/booking/:token", async (req, res) => {
  try {
    const { token } = req.params;

    const result = await db
      .select({
        appointment: appointmentsTable,
        patient: patientsTable,
        procedure: proceduresTable,
      })
      .from(appointmentsTable)
      .leftJoin(patientsTable, eq(appointmentsTable.patientId, patientsTable.id))
      .leftJoin(proceduresTable, eq(appointmentsTable.procedureId, proceduresTable.id))
      .where(eq(appointmentsTable.bookingToken, token))
      .limit(1);

    if (!result[0]) {
      res.status(404).json({ error: "Agendamento não encontrado" });
      return;
    }

    const { appointment, patient, procedure } = result[0];
    res.json({
      id: appointment.id,
      date: appointment.date,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      status: appointment.status,
      notes: appointment.notes,
      bookingToken: appointment.bookingToken,
      patient: patient
        ? { name: patient.name, phone: patient.phone, email: patient.email }
        : null,
      procedure: procedure
        ? { id: procedure.id, name: procedure.name, durationMinutes: procedure.durationMinutes, price: procedure.price }
        : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── DELETE /api/public/booking/:token ─────────────────────────────────────────
// Cancela um agendamento pelo token (paciente cancela o próprio agendamento)
router.delete("/booking/:token", async (req, res) => {
  try {
    const { token } = req.params;

    const [appointment] = await db
      .select({ id: appointmentsTable.id, status: appointmentsTable.status, date: appointmentsTable.date })
      .from(appointmentsTable)
      .where(eq(appointmentsTable.bookingToken, token));

    if (!appointment) {
      res.status(404).json({ error: "Agendamento não encontrado" });
      return;
    }

    if (appointment.status === "cancelado") {
      res.status(400).json({ error: "Agendamento já está cancelado" });
      return;
    }

    if (appointment.status === "concluido") {
      res.status(400).json({ error: "Não é possível cancelar uma consulta já concluída" });
      return;
    }

    // Verificar se a data já passou (usando horário de Brasília)
    const today = todayBRT();
    if (appointment.date < today) {
      res.status(400).json({ error: "Não é possível cancelar uma consulta passada" });
      return;
    }

    await db
      .update(appointmentsTable)
      .set({ status: "cancelado" })
      .where(eq(appointmentsTable.id, appointment.id));

    res.json({ success: true, message: "Agendamento cancelado com sucesso" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── GET /api/public/clinic-info ───────────────────────────────────────────────
// Retorna informações básicas da clínica (sem dados sensíveis) — sem autenticação
router.get("/clinic-info", async (_req, res) => {
  try {
    const [clinic] = await db
      .select({
        name: clinicsTable.name,
        type: clinicsTable.type,
        responsibleTechnical: clinicsTable.responsibleTechnical,
        phone: clinicsTable.phone,
        email: clinicsTable.email,
        address: clinicsTable.address,
        website: clinicsTable.website,
        logoUrl: clinicsTable.logoUrl,
      })
      .from(clinicsTable)
      .where(eq(clinicsTable.isActive, true))
      .limit(1);

    if (!clinic) {
      res.json({ name: "FisioGest Pro", type: "clinica", phone: null, email: null, address: null, website: null, logoUrl: null });
      return;
    }
    res.json(clinic);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
