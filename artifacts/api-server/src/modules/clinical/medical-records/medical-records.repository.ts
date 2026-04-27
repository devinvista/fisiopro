import { db } from "@workspace/db";
import {
  anamnesisTable,
  evaluationsTable,
  treatmentPlansTable,
  treatmentPlanProceduresTable,
  evolutionsTable,
  dischargeSummariesTable,
  financialRecordsTable,
  appointmentsTable,
  proceduresTable,
  examAttachmentsTable,
  atestadosTable,
  patientsTable,
  bodyMeasurementsTable,
} from "@workspace/db";
import { eq, desc, or, and } from "drizzle-orm";

// ─── Anamnesis ─────────────────────────────────────────────────────────────────

export async function getAnamnesis(patientId: number, type?: string, all?: boolean) {
  if (all) {
    return db.select().from(anamnesisTable).where(eq(anamnesisTable.patientId, patientId)).orderBy(anamnesisTable.updatedAt);
  }
  const whereClause = type
    ? and(eq(anamnesisTable.patientId, patientId), eq(anamnesisTable.templateType, type))
    : eq(anamnesisTable.patientId, patientId);
  const [record] = await db.select().from(anamnesisTable).where(whereClause).orderBy(desc(anamnesisTable.updatedAt)).limit(1);
  return record ?? null;
}

export async function upsertAnamnesis(patientId: number, templateType: string, fields: Record<string, unknown>) {
  const [existing] = await db.select({ id: anamnesisTable.id }).from(anamnesisTable)
    .where(and(eq(anamnesisTable.patientId, patientId), eq(anamnesisTable.templateType, templateType)));
  if (existing) {
    const [updated] = await db.update(anamnesisTable).set({ ...fields, updatedAt: new Date() })
      .where(and(eq(anamnesisTable.patientId, patientId), eq(anamnesisTable.templateType, templateType)))
      .returning();
    return { record: updated, isUpdate: true };
  }
  const [created] = await db.insert(anamnesisTable).values({ patientId, templateType, ...fields }).returning();
  return { record: created, isUpdate: false };
}

// ─── Indicators data (parallel fetch) ─────────────────────────────────────────

export async function getIndicatorsData(patientId: number) {
  return Promise.all([
    db.select().from(anamnesisTable).where(eq(anamnesisTable.patientId, patientId)).orderBy(anamnesisTable.updatedAt),
    db.select().from(evaluationsTable).where(eq(evaluationsTable.patientId, patientId)).orderBy(evaluationsTable.createdAt),
    db.select().from(evolutionsTable).where(eq(evolutionsTable.patientId, patientId)).orderBy(evolutionsTable.createdAt),
    db.select().from(bodyMeasurementsTable).where(eq(bodyMeasurementsTable.patientId, patientId)).orderBy(bodyMeasurementsTable.measuredAt),
  ]);
}

// ─── Body Measurements ─────────────────────────────────────────────────────────

export async function listBodyMeasurements(patientId: number) {
  return db.select().from(bodyMeasurementsTable).where(eq(bodyMeasurementsTable.patientId, patientId)).orderBy(desc(bodyMeasurementsTable.measuredAt));
}

export async function createBodyMeasurement(patientId: number, data: Record<string, unknown>) {
  const measuredAt = data.measuredAt ? new Date(data.measuredAt as string) : new Date();
  const [created] = await db.insert(bodyMeasurementsTable).values({
    patientId,
    measuredAt,
    weight: (data.weight as number | null)?.toString() ?? null,
    height: (data.height as number | null)?.toString() ?? null,
    waist: (data.waist as number | null)?.toString() ?? null,
    abdomen: (data.abdomen as number | null)?.toString() ?? null,
    hips: (data.hips as number | null)?.toString() ?? null,
    thighRight: (data.thighRight as number | null)?.toString() ?? null,
    thighLeft: (data.thighLeft as number | null)?.toString() ?? null,
    armRight: (data.armRight as number | null)?.toString() ?? null,
    armLeft: (data.armLeft as number | null)?.toString() ?? null,
    calfRight: (data.calfRight as number | null)?.toString() ?? null,
    calfLeft: (data.calfLeft as number | null)?.toString() ?? null,
    bodyFat: (data.bodyFat as number | null)?.toString() ?? null,
    celluliteGrade: (data.celluliteGrade as string | null) ?? null,
    notes: (data.notes as string | null) ?? null,
  }).returning();
  return created;
}

export async function deleteBodyMeasurement(measurementId: number, patientId: number) {
  const [existing] = await db.select().from(bodyMeasurementsTable).where(eq(bodyMeasurementsTable.id, measurementId));
  if (!existing || existing.patientId !== patientId) return null;
  await db.delete(bodyMeasurementsTable).where(eq(bodyMeasurementsTable.id, measurementId));
  return existing;
}

// ─── Evaluations ──────────────────────────────────────────────────────────────

export async function listEvaluations(patientId: number) {
  return db.select().from(evaluationsTable).where(eq(evaluationsTable.patientId, patientId)).orderBy(desc(evaluationsTable.createdAt));
}

export async function createEvaluation(patientId: number, data: Record<string, unknown>) {
  const [created] = await db.insert(evaluationsTable).values({ patientId, ...data } as any).returning();
  return created;
}

export async function updateEvaluation(evaluationId: number, patientId: number, data: Record<string, unknown>) {
  const [existing] = await db.select().from(evaluationsTable).where(eq(evaluationsTable.id, evaluationId));
  if (!existing || existing.patientId !== patientId) return null;
  const [updated] = await db.update(evaluationsTable).set(data as any).where(eq(evaluationsTable.id, evaluationId)).returning();
  return updated;
}

export async function deleteEvaluation(evaluationId: number, patientId: number) {
  const [existing] = await db.select().from(evaluationsTable).where(eq(evaluationsTable.id, evaluationId));
  if (!existing || existing.patientId !== patientId) return null;
  await db.delete(evaluationsTable).where(eq(evaluationsTable.id, evaluationId));
  return existing;
}

// ─── Treatment Plans ──────────────────────────────────────────────────────────

export async function listTreatmentPlans(patientId: number) {
  return db.select().from(treatmentPlansTable).where(eq(treatmentPlansTable.patientId, patientId)).orderBy(desc(treatmentPlansTable.createdAt));
}

export async function getTreatmentPlan(planId: number, patientId: number) {
  const [plan] = await db.select().from(treatmentPlansTable)
    .where(and(eq(treatmentPlansTable.id, planId), eq(treatmentPlansTable.patientId, patientId)));
  return plan ?? null;
}

export async function createTreatmentPlan(patientId: number, clinicId: number | null, data: Record<string, unknown>) {
  const [created] = await db.insert(treatmentPlansTable).values({ patientId, clinicId, ...data } as any).returning();
  return created;
}

export async function updateTreatmentPlan(planId: number, patientId: number, data: Record<string, unknown>) {
  const [existing] = await db.select({ id: treatmentPlansTable.id }).from(treatmentPlansTable)
    .where(and(eq(treatmentPlansTable.id, planId), eq(treatmentPlansTable.patientId, patientId)));
  if (!existing) return null;
  const [updated] = await db.update(treatmentPlansTable).set({ ...data, updatedAt: new Date() } as any)
    .where(eq(treatmentPlansTable.id, planId)).returning();
  return updated;
}

export async function deleteTreatmentPlan(planId: number, patientId: number) {
  const [existing] = await db.select({ id: treatmentPlansTable.id }).from(treatmentPlansTable)
    .where(and(eq(treatmentPlansTable.id, planId), eq(treatmentPlansTable.patientId, patientId)));
  if (!existing) return false;
  await db.delete(treatmentPlansTable).where(eq(treatmentPlansTable.id, planId));
  return true;
}

// ─── Treatment Plan: aceitação (Sprint 2) ─────────────────────────────────────

/**
 * Lê os procedimentos do plano para gerar o snapshot de preços no aceite.
 * Resolve `tablePrice` (preço de catálogo vigente) por procedimento via JOIN.
 */
export async function listTreatmentPlanProceduresWithCatalog(planId: number) {
  return db
    .select({
      id: treatmentPlanProceduresTable.id,
      procedureId: treatmentPlanProceduresTable.procedureId,
      packageId: treatmentPlanProceduresTable.packageId,
      unitPrice: treatmentPlanProceduresTable.unitPrice,
      discount: treatmentPlanProceduresTable.discount,
      totalSessions: treatmentPlanProceduresTable.totalSessions,
      sessionsPerWeek: treatmentPlanProceduresTable.sessionsPerWeek,
      tablePrice: proceduresTable.price,
      procedureName: proceduresTable.name,
    })
    .from(treatmentPlanProceduresTable)
    .leftJoin(proceduresTable, eq(treatmentPlanProceduresTable.procedureId, proceduresTable.id))
    .where(eq(treatmentPlanProceduresTable.treatmentPlanId, planId));
}

/**
 * Marca o plano como aceito, gravando snapshot e auditoria.
 * Idempotente: se já aceito, retorna o plano existente sem sobrescrever o snapshot.
 */
export async function acceptTreatmentPlan(
  planId: number,
  patientId: number,
  acceptedBy: number,
  frozenPricesJson: string,
) {
  const [existing] = await db
    .select()
    .from(treatmentPlansTable)
    .where(and(eq(treatmentPlansTable.id, planId), eq(treatmentPlansTable.patientId, patientId)));
  if (!existing) return null;
  if (existing.acceptedAt) return existing;
  const [updated] = await db
    .update(treatmentPlansTable)
    .set({
      acceptedAt: new Date(),
      acceptedBy,
      frozenPricesJson,
      updatedAt: new Date(),
    })
    .where(eq(treatmentPlansTable.id, planId))
    .returning();
  return updated;
}

export async function getPatientClinicId(patientId: number) {
  const [patient] = await db.select({ clinicId: patientsTable.clinicId }).from(patientsTable).where(eq(patientsTable.id, patientId)).limit(1);
  return patient?.clinicId ?? null;
}

// ─── Evolutions ───────────────────────────────────────────────────────────────

export async function listEvolutions(patientId: number) {
  return db.select().from(evolutionsTable).where(eq(evolutionsTable.patientId, patientId)).orderBy(desc(evolutionsTable.createdAt));
}

export async function createEvolution(patientId: number, data: Record<string, unknown>) {
  const [created] = await db.insert(evolutionsTable).values({ patientId, ...data } as any).returning();
  return created;
}

/**
 * Idempotent: cria um stub de evolução quando uma sessão é concluída,
 * caso ainda não exista evolução para este atendimento. Retorna a evolução
 * criada, ou `null` se já havia uma associada ao mesmo `appointmentId`.
 */
export async function ensureAutoEvolutionForAppointment(
  patientId: number,
  appointmentId: number,
  sessionDuration?: number | null,
) {
  const existing = await db
    .select({ id: evolutionsTable.id })
    .from(evolutionsTable)
    .where(eq(evolutionsTable.appointmentId, appointmentId))
    .limit(1);
  if (existing.length > 0) return null;

  const [created] = await db
    .insert(evolutionsTable)
    .values({
      patientId,
      appointmentId,
      description: "Sessão concluída automaticamente — registre a evolução clínica.",
      sessionDuration: sessionDuration ?? null,
    } as any)
    .returning();
  return created;
}

export async function updateEvolution(evolutionId: number, patientId: number, data: Record<string, unknown>) {
  const [existing] = await db.select().from(evolutionsTable).where(eq(evolutionsTable.id, evolutionId));
  if (!existing || existing.patientId !== patientId) return null;
  const [updated] = await db.update(evolutionsTable).set(data as any).where(eq(evolutionsTable.id, evolutionId)).returning();
  return updated;
}

export async function deleteEvolution(evolutionId: number, patientId: number) {
  const [existing] = await db.select().from(evolutionsTable).where(eq(evolutionsTable.id, evolutionId));
  if (!existing || existing.patientId !== patientId) return null;
  await db.delete(evolutionsTable).where(eq(evolutionsTable.id, evolutionId));
  return existing;
}

// ─── Appointments ─────────────────────────────────────────────────────────────

export async function listPatientAppointments(patientId: number) {
  const rows = await db.select({ appointment: appointmentsTable, procedure: proceduresTable })
    .from(appointmentsTable)
    .leftJoin(proceduresTable, eq(appointmentsTable.procedureId, proceduresTable.id))
    .where(eq(appointmentsTable.patientId, patientId))
    .orderBy(desc(appointmentsTable.date));
  return rows.map((r) => ({ ...r.appointment, procedure: r.procedure }));
}

// ─── Discharge Summary ────────────────────────────────────────────────────────

export async function getDischargeSummary(patientId: number) {
  const [summary] = await db.select().from(dischargeSummariesTable).where(eq(dischargeSummariesTable.patientId, patientId));
  return summary ?? null;
}

export async function upsertDischargeSummary(patientId: number, clinicId: number | null, data: Record<string, unknown>) {
  const existing = await db.select().from(dischargeSummariesTable).where(eq(dischargeSummariesTable.patientId, patientId));
  if (existing.length > 0) {
    const [updated] = await db.update(dischargeSummariesTable)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(dischargeSummariesTable.patientId, patientId))
      .returning();
    return { record: updated, isUpdate: true };
  }
  const [created] = await db.insert(dischargeSummariesTable).values({ patientId, ...data } as any).returning();
  return { record: created, isUpdate: false };
}

// ─── Patient Financial Records ────────────────────────────────────────────────

export async function listPatientFinancialRecords(patientId: number) {
  const rows = await db.select({ record: financialRecordsTable, appointment: appointmentsTable, procedure: proceduresTable })
    .from(financialRecordsTable)
    .leftJoin(appointmentsTable, eq(financialRecordsTable.appointmentId, appointmentsTable.id))
    .leftJoin(proceduresTable, eq(appointmentsTable.procedureId, proceduresTable.id))
    .where(or(eq(financialRecordsTable.patientId, patientId), eq(appointmentsTable.patientId, patientId)))
    .orderBy(desc(financialRecordsTable.createdAt));
  return rows.map((r) => ({ ...r.record, appointment: r.appointment, procedure: r.procedure }));
}

export async function createPatientFinancialRecord(patientId: number, data: Record<string, unknown>) {
  const [created] = await db.insert(financialRecordsTable).values({ patientId, ...data } as any).returning();
  return created;
}

// ─── Exam Attachments ─────────────────────────────────────────────────────────

export async function listAttachments(patientId: number) {
  return db.select().from(examAttachmentsTable).where(eq(examAttachmentsTable.patientId, patientId)).orderBy(desc(examAttachmentsTable.uploadedAt));
}

export async function createAttachment(patientId: number, data: Record<string, unknown>) {
  const [created] = await db.insert(examAttachmentsTable).values({ patientId, ...data } as any).returning();
  return created;
}

export async function getAttachment(attachmentId: number) {
  const [existing] = await db.select().from(examAttachmentsTable).where(eq(examAttachmentsTable.id, attachmentId));
  return existing ?? null;
}

export async function deleteAttachment(attachmentId: number) {
  await db.delete(examAttachmentsTable).where(eq(examAttachmentsTable.id, attachmentId));
}

// ─── Atestados ─────────────────────────────────────────────────────────────────

export async function listAtestados(patientId: number) {
  return db.select().from(atestadosTable).where(eq(atestadosTable.patientId, patientId)).orderBy(desc(atestadosTable.issuedAt));
}

export async function createAtestado(patientId: number, data: Record<string, unknown>) {
  const [created] = await db.insert(atestadosTable).values({ patientId, ...data } as any).returning();
  return created;
}

export async function getAtestado(atestadoId: number) {
  const [existing] = await db.select().from(atestadosTable).where(eq(atestadosTable.id, atestadoId));
  return existing ?? null;
}

export async function deleteAtestado(atestadoId: number) {
  await db.delete(atestadosTable).where(eq(atestadosTable.id, atestadoId));
}
