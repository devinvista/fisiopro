// ─── Medical Records Service ───────────────────────────────────────────────────
// Camada de casos de uso do prontuário: anamnese, indicadores, medidas
// corporais, avaliações, planos de tratamento, evoluções, alta, financeiro
// do paciente, anexos de exames e atestados.

import { HttpError } from "../../../utils/httpError.js";
import { logAudit } from "../../../utils/auditLog.js";
import { deleteCloudinaryAsset, extractPublicId } from "../../../utils/cloudinary.js";
import * as repo from "./medical-records.repository.js";

export type AuthCtx = { userId?: number };

// ─── Indicators (lógica de agregação já existente) ───────────────────────────

type AnamnesisRow = {
  templateType: string;
  painScale: number | null;
  updatedAt: Date;
  bodyWeight: string | null;
  bodyHeight: string | null;
  bodyMeasurements: string | null;
  celluliteGrade: string | null;
  cid10: string | null;
  painLocation: string | null;
  functionalImpact: string | null;
};

type EvaluationRow = { painScale: number | null; createdAt: Date };
type EvolutionRow = { painScale: number | null; createdAt: Date };

type BodyMeasurementRow = {
  id: number;
  measuredAt: Date;
  weight: string | null;
  height: string | null;
  waist: string | null;
  abdomen: string | null;
  hips: string | null;
  thighRight: string | null;
  thighLeft: string | null;
  armRight: string | null;
  armLeft: string | null;
  calfRight: string | null;
  calfLeft: string | null;
  bodyFat: string | null;
  celluliteGrade: string | null;
  notes: string | null;
};

const TEMPLATE_LABELS: Record<string, string> = {
  reabilitacao: "Reabilitação",
  esteticaFacial: "Estética Facial",
  esteticaCorporal: "Estética Corporal",
};

export function buildIndicators(
  allAnamnesis: AnamnesisRow[],
  evaluations: EvaluationRow[],
  evolutions: EvolutionRow[],
  bodyMeasurements: BodyMeasurementRow[],
) {
  const evaPoints: { date: string; value: number; source: string; label: string }[] = [];

  for (const a of allAnamnesis) {
    if (a.painScale != null) {
      evaPoints.push({
        date: a.updatedAt.toISOString(),
        value: a.painScale,
        source: "anamnesis",
        label: `Anamnese (${TEMPLATE_LABELS[a.templateType] ?? a.templateType})`,
      });
    }
  }

  for (const ev of evaluations) {
    if (ev.painScale != null) {
      evaPoints.push({
        date: ev.createdAt.toISOString(),
        value: ev.painScale,
        source: "evaluation",
        label: "Avaliação Física",
      });
    }
  }

  for (const evo of evolutions) {
    if (evo.painScale != null) {
      evaPoints.push({
        date: evo.createdAt.toISOString(),
        value: evo.painScale,
        source: "evolution",
        label: "Sessão",
      });
    }
  }

  evaPoints.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const corporalAnamnesis = allAnamnesis.find((a) => a.templateType === "esteticaCorporal");
  const bodyIndicators = corporalAnamnesis
    ? {
        weight: corporalAnamnesis.bodyWeight,
        height: corporalAnamnesis.bodyHeight,
        measurements: corporalAnamnesis.bodyMeasurements,
        celluliteGrade: corporalAnamnesis.celluliteGrade,
        updatedAt: corporalAnamnesis.updatedAt.toISOString(),
      }
    : null;

  const reabAnamnesis = allAnamnesis.find((a) => a.templateType === "reabilitacao");
  const reabIndicators = reabAnamnesis
    ? {
        cid10: reabAnamnesis.cid10,
        painLocation: reabAnamnesis.painLocation,
        functionalImpact: reabAnamnesis.functionalImpact,
        updatedAt: reabAnamnesis.updatedAt.toISOString(),
      }
    : null;

  const bodyMeasurementsSeries = bodyMeasurements.map((m) => ({
    id: m.id,
    date: m.measuredAt.toISOString(),
    weight: m.weight ? parseFloat(m.weight) : null,
    height: m.height ? parseFloat(m.height) : null,
    waist: m.waist ? parseFloat(m.waist) : null,
    abdomen: m.abdomen ? parseFloat(m.abdomen) : null,
    hips: m.hips ? parseFloat(m.hips) : null,
    thighRight: m.thighRight ? parseFloat(m.thighRight) : null,
    thighLeft: m.thighLeft ? parseFloat(m.thighLeft) : null,
    armRight: m.armRight ? parseFloat(m.armRight) : null,
    armLeft: m.armLeft ? parseFloat(m.armLeft) : null,
    calfRight: m.calfRight ? parseFloat(m.calfRight) : null,
    calfLeft: m.calfLeft ? parseFloat(m.calfLeft) : null,
    bodyFat: m.bodyFat ? parseFloat(m.bodyFat) : null,
    celluliteGrade: m.celluliteGrade,
    notes: m.notes,
  }));

  return {
    eva: evaPoints,
    body: bodyIndicators,
    reab: reabIndicators,
    bodyMeasurements: bodyMeasurementsSeries,
  };
}

export async function getPatientIndicators(patientId: number) {
  const [allAnamnesis, evaluations, evolutions, bodyMeasurements] =
    await repo.getIndicatorsData(patientId);
  return buildIndicators(
    allAnamnesis as AnamnesisRow[],
    evaluations as EvaluationRow[],
    evolutions as EvolutionRow[],
    bodyMeasurements as BodyMeasurementRow[],
  );
}

// ─── Anamnesis ────────────────────────────────────────────────────────────────

export async function getAnamnesisForPatient(
  patientId: number,
  opts: { type?: string; all?: boolean },
) {
  if (opts.all) {
    return repo.getAnamnesis(patientId, undefined, true);
  }
  const record = await repo.getAnamnesis(patientId, opts.type, false);
  if (!record) throw HttpError.notFound("Anamnese não encontrada");
  return record;
}

export async function upsertAnamnesisForPatient(
  patientId: number,
  body: Record<string, unknown>,
  ctx: AuthCtx,
) {
  const { templateType, ...rest } = body as { templateType?: string } & Record<string, unknown>;
  const resolvedType = templateType || "reabilitacao";
  const { record, isUpdate } = await repo.upsertAnamnesis(patientId, resolvedType, rest);
  await logAudit({
    userId: ctx.userId,
    patientId,
    action: isUpdate ? "update" : "create",
    entityType: "anamnesis",
    entityId: record?.id,
    summary: isUpdate
      ? `Anamnese (${resolvedType}) atualizada`
      : `Anamnese (${resolvedType}) criada`,
  });
  return record;
}

// ─── Body Measurements ────────────────────────────────────────────────────────

export function listPatientBodyMeasurements(patientId: number) {
  return repo.listBodyMeasurements(patientId);
}

export function createPatientBodyMeasurement(patientId: number, data: Record<string, unknown>) {
  return repo.createBodyMeasurement(patientId, data);
}

export async function deletePatientBodyMeasurement(measurementId: number, patientId: number) {
  await repo.deleteBodyMeasurement(measurementId, patientId);
}

// ─── Evaluations ──────────────────────────────────────────────────────────────

export function listPatientEvaluations(patientId: number) {
  return repo.listEvaluations(patientId);
}

export async function createPatientEvaluation(
  patientId: number,
  data: Record<string, unknown>,
  ctx: AuthCtx,
) {
  const evaluation = await repo.createEvaluation(patientId, data);
  await logAudit({
    userId: ctx.userId,
    patientId,
    action: "create",
    entityType: "evaluation",
    entityId: evaluation?.id,
    summary: "Avaliação física criada",
  });
  return evaluation;
}

export async function updatePatientEvaluation(
  patientId: number,
  evaluationId: number,
  data: Record<string, unknown>,
  ctx: AuthCtx,
) {
  const updated = await repo.updateEvaluation(evaluationId, patientId, {
    ...data,
    updatedAt: new Date(),
  });
  if (!updated) throw HttpError.notFound("Avaliação não encontrada");
  await logAudit({
    userId: ctx.userId,
    patientId,
    action: "update",
    entityType: "evaluation",
    entityId: evaluationId,
    summary: "Avaliação física editada",
  });
  return updated;
}

export async function deletePatientEvaluation(
  patientId: number,
  evaluationId: number,
  ctx: AuthCtx,
) {
  const deleted = await repo.deleteEvaluation(evaluationId, patientId);
  if (!deleted) throw HttpError.notFound("Avaliação não encontrada");
  await logAudit({
    userId: ctx.userId,
    patientId,
    action: "delete",
    entityType: "evaluation",
    entityId: evaluationId,
    summary: "Avaliação física excluída",
  });
}

// ─── Treatment Plans (multi-plan) ─────────────────────────────────────────────

export function listPatientTreatmentPlans(patientId: number) {
  return repo.listTreatmentPlans(patientId);
}

export async function createPatientTreatmentPlan(
  patientId: number,
  data: Record<string, unknown>,
  ctx: AuthCtx,
  fallbackClinicId: number | null,
) {
  const clinicId = (await repo.getPatientClinicId(patientId)) ?? fallbackClinicId;
  const plan = await repo.createTreatmentPlan(patientId, clinicId, normalizeTreatmentPlan(data));
  await logAudit({
    userId: ctx.userId,
    patientId,
    action: "create",
    entityType: "treatment_plan",
    entityId: plan?.id,
    summary: "Plano de tratamento criado",
  });
  return plan;
}

export async function getPatientTreatmentPlan(patientId: number, planId: number) {
  const plan = await repo.getTreatmentPlan(planId, patientId);
  if (!plan) throw HttpError.notFound("Plano de tratamento não encontrado");
  return plan;
}

export async function updatePatientTreatmentPlanById(
  patientId: number,
  planId: number,
  data: Record<string, unknown>,
  ctx: AuthCtx,
) {
  const update: Record<string, unknown> = {};
  for (const key of [
    "objectives",
    "techniques",
    "frequency",
    "estimatedSessions",
    "status",
    "responsibleProfessional",
  ] as const) {
    if (data[key] !== undefined) update[key] = data[key] || null;
  }
  if (data.startDate !== undefined) update.startDate = (data.startDate as string) || null;

  const plan = await repo.updateTreatmentPlan(planId, patientId, update);
  if (!plan) throw HttpError.notFound("Plano de tratamento não encontrado");
  await logAudit({
    userId: ctx.userId,
    patientId,
    action: "update",
    entityType: "treatment_plan",
    entityId: planId,
    summary: "Plano de tratamento atualizado",
  });
  return plan;
}

export async function deletePatientTreatmentPlan(
  patientId: number,
  planId: number,
  ctx: AuthCtx,
) {
  const ok = await repo.deleteTreatmentPlan(planId, patientId);
  if (!ok) throw HttpError.notFound("Plano de tratamento não encontrado");
  await logAudit({
    userId: ctx.userId,
    patientId,
    action: "delete",
    entityType: "treatment_plan",
    entityId: planId,
    summary: "Plano de tratamento excluído",
  });
}

// ─── Treatment Plan (compat, single ativo) ────────────────────────────────────

export async function getActiveTreatmentPlan(patientId: number) {
  const plans = await repo.listTreatmentPlans(patientId);
  const active = plans.find((p) => p.status === "ativo") ?? plans[0];
  if (!active) throw HttpError.notFound("Plano de tratamento não encontrado");
  return active;
}

export async function upsertActiveTreatmentPlan(
  patientId: number,
  data: Record<string, unknown>,
  ctx: AuthCtx,
  fallbackClinicId: number | null,
) {
  const plans = await repo.listTreatmentPlans(patientId);
  const existing = plans.find((p) => p.status === "ativo") ?? plans[0];
  const normalized = normalizeTreatmentPlan(data);

  let plan;
  if (existing) {
    plan = await repo.updateTreatmentPlan(existing.id, patientId, normalized);
  } else {
    const clinicId = (await repo.getPatientClinicId(patientId)) ?? fallbackClinicId;
    plan = await repo.createTreatmentPlan(patientId, clinicId, normalized);
  }
  await logAudit({
    userId: ctx.userId,
    patientId,
    action: existing ? "update" : "create",
    entityType: "treatment_plan",
    entityId: plan?.id,
    summary: existing ? "Plano de tratamento atualizado" : "Plano de tratamento criado",
  });
  return { plan, isUpdate: !!existing };
}

function normalizeTreatmentPlan(data: Record<string, unknown>) {
  const {
    objectives,
    techniques,
    frequency,
    estimatedSessions,
    status = "ativo",
    startDate,
    responsibleProfessional,
  } = data as {
    objectives?: unknown;
    techniques?: unknown;
    frequency?: unknown;
    estimatedSessions?: unknown;
    status?: string;
    startDate?: string;
    responsibleProfessional?: string;
  };
  return {
    objectives,
    techniques,
    frequency,
    estimatedSessions,
    status,
    startDate: startDate || null,
    responsibleProfessional: responsibleProfessional || null,
  };
}

// ─── Evolutions ───────────────────────────────────────────────────────────────

export function listPatientEvolutions(patientId: number) {
  return repo.listEvolutions(patientId);
}

export async function createPatientEvolution(
  patientId: number,
  data: Record<string, unknown>,
  ctx: AuthCtx,
) {
  const evolution = await repo.createEvolution(patientId, normalizeEvolution(data));
  await logAudit({
    userId: ctx.userId,
    patientId,
    action: "create",
    entityType: "evolution",
    entityId: evolution?.id,
    summary: "Evolução de sessão criada",
  });
  return evolution;
}

export async function updatePatientEvolution(
  patientId: number,
  evolutionId: number,
  data: Record<string, unknown>,
  ctx: AuthCtx,
) {
  const updated = await repo.updateEvolution(evolutionId, patientId, normalizeEvolution(data));
  if (!updated) throw HttpError.notFound("Evolução não encontrada");
  await logAudit({
    userId: ctx.userId,
    patientId,
    action: "update",
    entityType: "evolution",
    entityId: evolutionId,
    summary: "Evolução de sessão editada",
  });
  return updated;
}

export async function deletePatientEvolution(
  patientId: number,
  evolutionId: number,
  ctx: AuthCtx,
) {
  const deleted = await repo.deleteEvolution(evolutionId, patientId);
  if (!deleted) throw HttpError.notFound("Evolução não encontrada");
  await logAudit({
    userId: ctx.userId,
    patientId,
    action: "delete",
    entityType: "evolution",
    entityId: evolutionId,
    summary: "Evolução de sessão excluída",
  });
}

function normalizeEvolution(data: Record<string, unknown>) {
  const {
    appointmentId,
    description,
    patientResponse,
    clinicalNotes,
    complications,
    painScale,
    sessionDuration,
    techniquesUsed,
    homeExercises,
    nextSessionGoals,
  } = data as Record<string, unknown>;
  return {
    appointmentId: appointmentId || null,
    description,
    patientResponse,
    clinicalNotes,
    complications,
    painScale: (painScale as number | null | undefined) ?? null,
    sessionDuration: (sessionDuration as number | null | undefined) ?? null,
    techniquesUsed: (techniquesUsed as string | null | undefined) ?? null,
    homeExercises: (homeExercises as string | null | undefined) ?? null,
    nextSessionGoals: (nextSessionGoals as string | null | undefined) ?? null,
  };
}

// ─── Appointments (visão do paciente) ────────────────────────────────────────

export function listAppointmentsForPatient(patientId: number) {
  return repo.listPatientAppointments(patientId);
}

// ─── Discharge Summary ────────────────────────────────────────────────────────

export async function getPatientDischargeSummary(patientId: number) {
  const summary = await repo.getDischargeSummary(patientId);
  if (!summary) throw HttpError.notFound("Alta fisioterapêutica não encontrada");
  return summary;
}

export async function upsertPatientDischargeSummary(
  patientId: number,
  body: Record<string, unknown>,
  ctx: AuthCtx,
) {
  const { dischargeDate, dischargeReason, achievedResults, recommendations } = body as {
    dischargeDate?: string;
    dischargeReason?: string;
    achievedResults?: string;
    recommendations?: string;
  };
  const data: Record<string, unknown> = {
    dischargeDate: dischargeDate ?? "",
    dischargeReason: dischargeReason ?? "",
    achievedResults,
    recommendations,
  };
  const { record, isUpdate } = await repo.upsertDischargeSummary(patientId, null, data);
  await logAudit({
    userId: ctx.userId,
    patientId,
    action: isUpdate ? "update" : "create",
    entityType: "discharge",
    entityId: record?.id,
    summary: isUpdate
      ? "Alta fisioterapêutica atualizada"
      : "Alta fisioterapêutica registrada",
  });
  return record;
}

// ─── Patient Financial Records ────────────────────────────────────────────────

export function listPatientFinancial(patientId: number) {
  return repo.listPatientFinancialRecords(patientId);
}

export async function createPatientFinancial(
  patientId: number,
  body: { type: string; amount: number; description: string; category?: string | null },
  ctx: AuthCtx,
) {
  try {
    const record = await repo.createPatientFinancialRecord(patientId, {
      type: body.type,
      amount: String(body.amount),
      description: body.description,
      category: body.category ?? null,
    });
    await logAudit({
      userId: ctx.userId,
      patientId,
      action: "create",
      entityType: "financial",
      entityId: record?.id,
      summary: `Lançamento financeiro: ${body.type === "receita" ? "receita" : "despesa"} — ${body.description}`,
    });
    return record;
  } catch (err: unknown) {
    const code = (err as { cause?: { code?: string }; code?: string })?.cause?.code
      ?? (err as { code?: string })?.code;
    if (code === "23503") {
      throw HttpError.notFound("Paciente não encontrado");
    }
    throw err;
  }
}

// ─── Exam Attachments ─────────────────────────────────────────────────────────

export function listPatientAttachments(patientId: number) {
  return repo.listAttachments(patientId);
}

export async function createPatientAttachment(
  patientId: number,
  body: {
    originalFilename?: string | null;
    contentType?: string | null;
    fileSize?: number | null;
    objectPath?: string | null;
    description?: string | null;
    resultText?: string | null;
    examTitle?: string | null;
  },
  ctx: AuthCtx,
) {
  const hasFile = body.objectPath && body.originalFilename;
  const hasText = body.resultText && body.resultText.trim().length > 0;
  if (!hasFile && !hasText) {
    throw HttpError.badRequest("Informe um arquivo ou um resultado em texto.");
  }

  const attachment = await repo.createAttachment(patientId, {
    examTitle: body.examTitle || null,
    originalFilename: body.originalFilename || null,
    contentType: body.contentType || null,
    fileSize: body.fileSize || null,
    objectPath: body.objectPath || null,
    description: body.description || null,
    resultText: body.resultText || null,
  });
  await logAudit({
    userId: ctx.userId,
    patientId,
    action: "create",
    entityType: "attachment",
    entityId: attachment?.id,
    summary: `Anexo adicionado: ${body.examTitle || body.originalFilename || "resultado de exame"}`,
  });
  return attachment;
}

export async function deletePatientAttachment(
  patientId: number,
  attachmentId: number,
  ctx: AuthCtx,
) {
  const existing = await repo.getAttachment(attachmentId);
  if (!existing || existing.patientId !== patientId) {
    throw HttpError.notFound("Anexo não encontrado");
  }
  if (existing.objectPath) {
    try {
      const publicId = extractPublicId(existing.objectPath);
      if (publicId) await deleteCloudinaryAsset(publicId);
    } catch (storageErr) {
      console.error(
        "Falha ao excluir arquivo do Cloudinary (continuando com remoção do banco):",
        storageErr,
      );
    }
  }
  await repo.deleteAttachment(attachmentId);
  await logAudit({
    userId: ctx.userId,
    patientId,
    action: "delete",
    entityType: "attachment",
    entityId: attachmentId,
    summary: `Anexo excluído: ${existing.examTitle || existing.originalFilename || "resultado de exame"}`,
  });
}

// ─── Atestados ─────────────────────────────────────────────────────────────────

const ATESTADO_TYPE_LABELS: Record<string, string> = {
  atestado: "Atestado médico",
  declaracao: "Declaração de comparecimento",
  encaminhamento: "Encaminhamento",
};

export function listPatientAtestados(patientId: number) {
  return repo.listAtestados(patientId);
}

export async function createPatientAtestado(
  patientId: number,
  body: {
    type?: string;
    professionalName?: string;
    professionalSpecialty?: string;
    professionalCouncil?: string;
    content?: string;
    cid?: string;
    daysOff?: string | number;
  },
  ctx: AuthCtx,
) {
  const { type, professionalName, professionalSpecialty, professionalCouncil, content, cid, daysOff } = body;
  if (!type || !professionalName || !content) {
    throw HttpError.badRequest("Campos obrigatórios: type, professionalName, content");
  }

  const atestado = await repo.createAtestado(patientId, {
    type,
    professionalName,
    professionalSpecialty: professionalSpecialty || null,
    professionalCouncil: professionalCouncil || null,
    content,
    cid: cid || null,
    daysOff: daysOff != null && daysOff !== "" ? parseInt(String(daysOff)) : null,
  });
  await logAudit({
    userId: ctx.userId,
    patientId,
    action: "create",
    entityType: "atestado",
    entityId: atestado?.id,
    summary: `${ATESTADO_TYPE_LABELS[type] || "Atestado"} emitido por ${professionalName}`,
  });
  return atestado;
}

export async function deletePatientAtestado(
  patientId: number,
  atestadoId: number,
  ctx: AuthCtx,
) {
  const existing = await repo.getAtestado(atestadoId);
  if (!existing || existing.patientId !== patientId) {
    throw HttpError.notFound("Atestado não encontrado");
  }
  await repo.deleteAtestado(atestadoId);
  await logAudit({
    userId: ctx.userId,
    patientId,
    action: "delete",
    entityType: "atestado",
    entityId: atestadoId,
    summary: `Atestado excluído (tipo: ${existing.type})`,
  });
}
