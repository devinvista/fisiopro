import { db } from "@workspace/db";
import {
  appointmentsTable,
  treatmentPlansTable,
  treatmentPlanProceduresTable,
  proceduresTable,
  patientsTable,
} from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import type { AuthRequest } from "../../../middleware/auth.js";
import { HttpError } from "../../../utils/httpError.js";

function addMinutesToTime(time: string, mins: number): string {
  const [hStr, mStr] = time.split(":");
  const total = parseInt(hStr, 10) * 60 + parseInt(mStr, 10) + mins;
  const h = Math.floor((total + 24 * 60) % (24 * 60) / 60);
  const m = (total + 24 * 60) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export type RecalcDurationsResult = {
  planId: number;
  totalAppointments: number;
  updated: number;
  alreadyCorrect: number;
  skippedFinalized: number;
  skippedNoTime: number;
  skippedNoDuration: number;
  changes: Array<{
    id: number;
    date: string;
    startTime: string;
    fromEndTime: string | null;
    toEndTime: string;
    fromDuration: number | null;
    toDuration: number;
  }>;
};

const FINALIZED_STATUSES = new Set([
  "concluido",
  "presenca",
  "faltou",
  "cancelado",
  "remarcado",
]);

export async function recalcPlanAppointmentDurations(
  planId: number,
  req: AuthRequest,
): Promise<RecalcDurationsResult> {
  // ── Verifica posse do plano (mesma regra dos demais endpoints) ────────────
  const [planRow] = await db
    .select({
      id: treatmentPlansTable.id,
      patientClinicId: patientsTable.clinicId,
    })
    .from(treatmentPlansTable)
    .innerJoin(patientsTable, eq(treatmentPlansTable.patientId, patientsTable.id))
    .where(eq(treatmentPlansTable.id, planId))
    .limit(1);

  if (!planRow) {
    throw new HttpError(404, "Plano não encontrado");
  }
  if (!req.isSuperAdmin && req.clinicId && planRow.patientClinicId !== req.clinicId) {
    throw new HttpError(403, "Sem permissão para este plano");
  }

  // ── Mapa { itemId → durationMinutes correta } ──────────────────────────────
  // duration = SEMPRE a duração cadastrada do procedimento (preferindo o do
  // pacote, se houver) > 60. Não existe mais override por item do plano.
  const items = await db
    .select({
      itemId: treatmentPlanProceduresTable.id,
      procedureId: treatmentPlanProceduresTable.procedureId,
      packageProcedureId: sql<number | null>`(
        SELECT pkg_proc.procedure_id
        FROM packages pkg
        LEFT JOIN procedures pkg_proc ON pkg_proc.id = pkg.procedure_id
        WHERE pkg.id = ${treatmentPlanProceduresTable.packageId}
        LIMIT 1
      )`,
    })
    .from(treatmentPlanProceduresTable)
    .where(eq(treatmentPlanProceduresTable.treatmentPlanId, planId));

  if (items.length === 0) {
    return {
      planId,
      totalAppointments: 0,
      updated: 0,
      alreadyCorrect: 0,
      skippedFinalized: 0,
      skippedNoTime: 0,
      skippedNoDuration: 0,
      changes: [],
    };
  }

  // Carrega `durationMinutes` de todos os procedimentos referenciados.
  const procIds = Array.from(
    new Set(
      items
        .flatMap((it) => [it.procedureId, it.packageProcedureId])
        .filter((v): v is number => typeof v === "number"),
    ),
  );
  const procRows = procIds.length > 0
    ? await db
        .select({ id: proceduresTable.id, durationMinutes: proceduresTable.durationMinutes })
        .from(proceduresTable)
        .where(inArray(proceduresTable.id, procIds))
    : [];
  const durationByProc = new Map<number, number>();
  for (const r of procRows) durationByProc.set(r.id, r.durationMinutes ?? 60);

  const correctDurationByItem = new Map<number, number>();
  for (const it of items) {
    const procDur =
      (it.packageProcedureId != null ? durationByProc.get(it.packageProcedureId) : undefined) ??
      (it.procedureId != null ? durationByProc.get(it.procedureId) : undefined);
    const dur = procDur ?? 60;
    correctDurationByItem.set(it.itemId, dur);
  }

  // ── Carrega agendamentos vinculados ao plano ───────────────────────────────
  const itemIds = items.map((it) => it.itemId);
  const appts = await db
    .select({
      id: appointmentsTable.id,
      date: appointmentsTable.date,
      startTime: appointmentsTable.startTime,
      endTime: appointmentsTable.endTime,
      status: appointmentsTable.status,
      treatmentPlanProcedureId: appointmentsTable.treatmentPlanProcedureId,
    })
    .from(appointmentsTable)
    .where(
      and(
        inArray(appointmentsTable.treatmentPlanProcedureId, itemIds),
      ),
    );

  let updated = 0;
  let alreadyCorrect = 0;
  let skippedFinalized = 0;
  let skippedNoTime = 0;
  let skippedNoDuration = 0;
  const changes: RecalcDurationsResult["changes"] = [];

  for (const a of appts) {
    if (FINALIZED_STATUSES.has(a.status as string)) {
      skippedFinalized += 1;
      continue;
    }
    if (!a.startTime) {
      skippedNoTime += 1;
      continue;
    }
    const targetDur = a.treatmentPlanProcedureId != null
      ? correctDurationByItem.get(a.treatmentPlanProcedureId)
      : undefined;
    if (!targetDur || targetDur <= 0) {
      skippedNoDuration += 1;
      continue;
    }
    const desiredEnd = addMinutesToTime(a.startTime, targetDur);
    if (a.endTime === desiredEnd) {
      alreadyCorrect += 1;
      continue;
    }
    // Calcula duração atual em minutos para o relatório.
    let currentDur: number | null = null;
    if (a.endTime) {
      const [sh, sm] = a.startTime.split(":").map((s) => parseInt(s, 10));
      const [eh, em] = a.endTime.split(":").map((s) => parseInt(s, 10));
      currentDur = (eh * 60 + em) - (sh * 60 + sm);
    }
    await db
      .update(appointmentsTable)
      .set({ endTime: desiredEnd })
      .where(eq(appointmentsTable.id, a.id));
    changes.push({
      id: a.id,
      date: a.date,
      startTime: a.startTime,
      fromEndTime: a.endTime ?? null,
      toEndTime: desiredEnd,
      fromDuration: currentDur,
      toDuration: targetDur,
    });
    updated += 1;
  }

  return {
    planId,
    totalAppointments: appts.length,
    updated,
    alreadyCorrect,
    skippedFinalized,
    skippedNoTime,
    skippedNoDuration,
    changes,
  };
}
