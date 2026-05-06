import { Router, type Request } from "express";
import { db } from "@workspace/db";
import {
  patientJourneyStepsTable,
  JOURNEY_STEP_DEFS,
  patientsTable,
  patientClinicsTable,
  anamnesisTable,
  evaluationsTable,
  treatmentPlansTable,
  treatmentPlanProceduresTable,
  appointmentsTable,
  dischargeSummariesTable,
  patientPackagesTable,
} from "@workspace/db";
import { eq, and, or, gt, count, isNull, sql, isNotNull } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../../../middleware/auth.js";
import { logAudit } from "../../../utils/auditLog.js";

const router = Router({ mergeParams: true });
router.use(authMiddleware);

type P = { patientId: string };
type PS = { patientId: string; stepId: string };

async function checkClinicAccess(req: AuthRequest, patientId: number): Promise<boolean> {
  if (!req.clinicId) return true;
  const [binding] = await db
    .select({ id: patientClinicsTable.id })
    .from(patientClinicsTable)
    .where(and(
      eq(patientClinicsTable.patientId, patientId),
      eq(patientClinicsTable.clinicId, req.clinicId),
      isNull(patientClinicsTable.deletedAt),
    ))
    .limit(1);
  return !!binding;
}

interface AutoStatus {
  cadastro: "completed";
  anamnese: "pending" | "completed";
  avaliacao: "pending" | "completed";
  plano_tratamento: "pending" | "completed";
  procedimentos: "pending" | "completed";
  aceite_plano: "pending" | "in_progress" | "completed";
  geracao_agenda: "pending" | "in_progress" | "completed";
  tratamento: "pending" | "in_progress" | "completed";
  alta: "pending" | "completed";
}

async function computeAutoStatus(patientId: number): Promise<AutoStatus> {
  const [
    [anamnesis],
    evaluationsRows,
    [treatmentPlan],
    packagesRows,
    planProceduresRows,
    completedRows,
    [discharge],
  ] = await Promise.all([
    db.select({ id: anamnesisTable.id })
      .from(anamnesisTable)
      .where(eq(anamnesisTable.patientId, patientId))
      .limit(1),
    db.select({ id: evaluationsTable.id })
      .from(evaluationsTable)
      .where(eq(evaluationsTable.patientId, patientId))
      .limit(1),
    db.select({
      id: treatmentPlansTable.id,
      acceptedAt: treatmentPlansTable.acceptedAt,
      materializedAt: treatmentPlansTable.materializedAt,
    })
      .from(treatmentPlansTable)
      .where(eq(treatmentPlansTable.patientId, patientId))
      .limit(1),
    db.select({ id: patientPackagesTable.id })
      .from(patientPackagesTable)
      .where(eq(patientPackagesTable.patientId, patientId))
      .limit(1),
    db.select({ id: treatmentPlanProceduresTable.id })
      .from(treatmentPlanProceduresTable)
      .innerJoin(treatmentPlansTable, eq(treatmentPlanProceduresTable.treatmentPlanId, treatmentPlansTable.id))
      .where(eq(treatmentPlansTable.patientId, patientId))
      .limit(1),
    db.select({ id: appointmentsTable.id })
      .from(appointmentsTable)
      .where(and(
        eq(appointmentsTable.patientId, patientId),
        or(eq(appointmentsTable.status, "concluido"), eq(appointmentsTable.status, "presenca")),
      ))
      .limit(1),
    db.select({ id: dischargeSummariesTable.id })
      .from(dischargeSummariesTable)
      .where(eq(dischargeSummariesTable.patientId, patientId))
      .limit(1),
  ]);

  const hasAnamnesis = !!anamnesis;
  const hasEvaluation = evaluationsRows.length > 0;
  const hasTreatmentPlan = !!treatmentPlan;
  const hasPlanProcedures = planProceduresRows.length > 0;
  const hasPackages = packagesRows.length > 0;
  const hasCompletedSession = completedRows.length > 0;
  const hasDischarge = !!discharge;
  const planAccepted = !!treatmentPlan?.acceptedAt;
  const planMaterialized = !!treatmentPlan?.materializedAt;

  return {
    cadastro: "completed",
    anamnese: hasAnamnesis ? "completed" : "pending",
    avaliacao: hasEvaluation ? "completed" : "pending",
    plano_tratamento: hasTreatmentPlan ? "completed" : "pending",
    // completed when plan has itemised procedures, a standalone package, or the plan exists
    procedimentos: (hasPlanProcedures || hasPackages || hasTreatmentPlan) ? "completed" : "pending",
    // in_progress = plan exists but not yet accepted; completed = patient signed
    aceite_plano: planAccepted ? "completed" : hasTreatmentPlan ? "in_progress" : "pending",
    // in_progress = accepted but appointments not yet generated; completed = materialised
    geracao_agenda: planMaterialized ? "completed" : planAccepted ? "in_progress" : "pending",
    tratamento: hasDischarge ? "completed" : hasCompletedSession ? "in_progress" : "pending",
    alta: hasDischarge ? "completed" : "pending",
  };
}

async function computeJourneyMeta(patientId: number, clinicId: number | null | undefined) {
  const clinicFilter = clinicId
    ? and(eq(appointmentsTable.patientId, patientId), eq(appointmentsTable.clinicId, clinicId))
    : eq(appointmentsTable.patientId, patientId);

  const [
    completedApptRows,
    activePlanRows,
    [discharge],
  ] = await Promise.all([
    // Count completed appointments
    db.select({ count: sql<number>`count(*)::int` })
      .from(appointmentsTable)
      .where(and(
        clinicFilter,
        sql`${appointmentsTable.status} IN ('concluido', 'presenca')`,
      )),
    // Get most recent active treatment plan
    db.select({
      id: treatmentPlansTable.id,
      estimatedSessions: treatmentPlansTable.estimatedSessions,
      status: treatmentPlansTable.status,
      startDate: treatmentPlansTable.startDate,
    })
      .from(treatmentPlansTable)
      .where(and(
        eq(treatmentPlansTable.patientId, patientId),
        sql`${treatmentPlansTable.status} IN ('ativo', 'vigente')`,
      ))
      .limit(1),
    // Check discharge
    db.select({ id: dischargeSummariesTable.id })
      .from(dischargeSummariesTable)
      .where(eq(dischargeSummariesTable.patientId, patientId))
      .limit(1),
  ]);

  const firstConsultationCompleted = Number(completedApptRows[0]?.count ?? 0) > 0;
  const plan = activePlanRows[0] ?? null;
  const hasDischarge = !!discharge;

  let treatmentPlanProgress = null;
  if (plan && plan.estimatedSessions && plan.estimatedSessions > 0) {
    const completedSessions = Number(completedApptRows[0]?.count ?? 0);
    const totalSessions = plan.estimatedSessions;
    const pct = Math.min(100, Math.round((completedSessions / totalSessions) * 100));
    treatmentPlanProgress = {
      planId: plan.id,
      estimatedSessions: totalSessions,
      completedSessions,
      pct,
      isNearingCompletion: pct >= 80,
      planStatus: plan.status ?? "ativo",
      startDate: plan.startDate,
    };
  }

  return {
    firstConsultationCompleted,
    hasDischarge,
    treatmentPlanProgress,
  };
}

function mergeStatus(
  dbStatus: string,
  autoStatus: string
): string {
  if (dbStatus === "cancelled") return "cancelled";
  const rank: Record<string, number> = { pending: 0, in_progress: 1, completed: 2 };
  const dbRank = rank[dbStatus] ?? 0;
  const autoRank = rank[autoStatus] ?? 0;
  return autoRank >= dbRank ? autoStatus : dbStatus;
}

async function getOrCreateSteps(patientId: number, clinicId: number | null | undefined) {
  let steps = await db
    .select()
    .from(patientJourneyStepsTable)
    .where(eq(patientJourneyStepsTable.patientId, patientId))
    .orderBy(patientJourneyStepsTable.stepOrder);

  if (steps.length === 0) {
    if (!clinicId) return [];

    const toInsert = JOURNEY_STEP_DEFS.map((def) => ({
      patientId,
      clinicId,
      stepKey: def.key,
      stepOrder: def.order,
      status: "pending",
      startedAt: null as Date | null,
      completedAt: null as Date | null,
      cancelledAt: null as Date | null,
      notes: null as string | null,
      responsibleName: null as string | null,
      updatedByUserId: null as number | null,
      updatedByUserName: null as string | null,
    }));
    await db.insert(patientJourneyStepsTable).values(toInsert);
  } else {
    // Self-heal: fix stale step keys left from pre-migration schema (e.g. agendamento → geracao_agenda).
    const RENAMES: Record<string, { newKey: string; newOrder: number }> = {
      agendamento: { newKey: "geracao_agenda", newOrder: 7 },
    };
    // Also correct step orders that are out of date.
    const CANONICAL_ORDER: Record<string, number> = Object.fromEntries(
      JOURNEY_STEP_DEFS.map((d) => [d.key, d.order]),
    );

    for (const step of steps) {
      const rename = RENAMES[step.stepKey];
      if (rename) {
        await db
          .update(patientJourneyStepsTable)
          .set({ stepKey: rename.newKey, stepOrder: rename.newOrder })
          .where(eq(patientJourneyStepsTable.id, step.id));
        step.stepKey = rename.newKey;
        step.stepOrder = rename.newOrder;
      } else {
        const canonical = CANONICAL_ORDER[step.stepKey];
        if (canonical !== undefined && step.stepOrder !== canonical) {
          await db
            .update(patientJourneyStepsTable)
            .set({ stepOrder: canonical })
            .where(eq(patientJourneyStepsTable.id, step.id));
          step.stepOrder = canonical;
        }
      }
    }

    // Insert any step keys defined in JOURNEY_STEP_DEFS that are still missing.
    const existingKeys = new Set(steps.map((s) => s.stepKey));
    const resolvedClinicId = clinicId ?? steps[0]?.clinicId;
    if (resolvedClinicId) {
      const missing = JOURNEY_STEP_DEFS.filter((def) => !existingKeys.has(def.key));
      if (missing.length > 0) {
        await db.insert(patientJourneyStepsTable).values(
          missing.map((def) => ({
            patientId,
            clinicId: resolvedClinicId,
            stepKey: def.key,
            stepOrder: def.order,
            status: "pending",
            startedAt: null as Date | null,
            completedAt: null as Date | null,
            cancelledAt: null as Date | null,
            notes: null as string | null,
            responsibleName: null as string | null,
            updatedByUserId: null as number | null,
            updatedByUserName: null as string | null,
          })),
        );
      }
    }
  }

  // Always re-fetch so the result is consistent (covers both branches above)
  steps = await db
    .select()
    .from(patientJourneyStepsTable)
    .where(eq(patientJourneyStepsTable.patientId, patientId))
    .orderBy(patientJourneyStepsTable.stepOrder);

  return steps;
}

// GET /api/patients/:patientId/journey
router.get("/journey", async (req: Request<P>, res) => {
  try {
    const authReq = req as AuthRequest;
    const patientId = parseInt(req.params.patientId);
    if (isNaN(patientId)) { res.status(400).json({ error: "patientId inválido" }); return; }

    if (!(await checkClinicAccess(authReq, patientId))) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const clinicId = authReq.clinicId ?? null;
    const [steps, auto, meta] = await Promise.all([
      getOrCreateSteps(patientId, clinicId),
      computeAutoStatus(patientId),
      computeJourneyMeta(patientId, clinicId),
    ]);

    const merged = steps.map((step) => {
      const autoForStep = auto[step.stepKey as keyof AutoStatus] ?? "pending";
      const effectiveStatus = mergeStatus(step.status, autoForStep);
      return { ...step, status: effectiveStatus, autoStatus: autoForStep };
    });

    res.json({ steps: merged, meta });
  } catch (err) {
    console.error("[journey] GET error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// PATCH /api/patients/:patientId/journey/:stepId
router.patch("/journey/:stepId", async (req: Request<PS>, res) => {
  try {
    const authReq = req as AuthRequest;
    const patientId = parseInt(req.params.patientId);
    const stepId = parseInt(req.params.stepId);
    if (isNaN(patientId) || isNaN(stepId)) { res.status(400).json({ error: "IDs inválidos" }); return; }

    if (!(await checkClinicAccess(authReq, patientId))) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const { notes, responsibleName, action } = req.body as {
      notes?: string;
      responsibleName?: string;
      action?: "cancel" | "edit";
    };

    if ((req.body as any).action === "advance") {
      res.status(403).json({
        error: "Forbidden",
        message: "O avanço manual de etapas não é permitido. O status é calculado automaticamente com base no preenchimento do cadastro do paciente.",
      });
      return;
    }

    const [currentStep] = await db
      .select()
      .from(patientJourneyStepsTable)
      .where(and(eq(patientJourneyStepsTable.id, stepId), eq(patientJourneyStepsTable.patientId, patientId)));

    if (!currentStep) { res.status(404).json({ error: "Etapa não encontrada" }); return; }

    const now = new Date();
    const updateData: Partial<typeof patientJourneyStepsTable.$inferInsert> = {
      updatedByUserId: authReq.userId ?? null,
      updatedByUserName: authReq.userName ?? null,
      updatedAt: now,
    };

    if (action === "cancel") {
      updateData.status = "cancelled";
      updateData.cancelledAt = now;
    }

    if (notes !== undefined) updateData.notes = notes;
    if (responsibleName !== undefined) updateData.responsibleName = responsibleName;

    await db
      .update(patientJourneyStepsTable)
      .set(updateData)
      .where(eq(patientJourneyStepsTable.id, stepId));

    await logAudit({
      userId: authReq.userId ?? null,
      patientId,
      action: "update",
      entityType: "patient_journey_step",
      entityId: stepId,
      summary: `Jornada: etapa "${currentStep.stepKey}" → ${updateData.status ?? "editada"} por ${authReq.userName ?? "sistema"}`,
    });

    const [updated] = await db
      .select()
      .from(patientJourneyStepsTable)
      .where(eq(patientJourneyStepsTable.id, stepId));

    res.json(updated);
  } catch (err) {
    console.error("[journey] PATCH error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /api/patients/:patientId/journey/reset  (admin only)
router.post("/journey/reset", async (req: Request<P>, res) => {
  try {
    const authReq = req as AuthRequest;
    const roles = (authReq.userRoles ?? []) as string[];
    if (!authReq.isSuperAdmin && !roles.includes("admin")) {
      res.status(403).json({ error: "Forbidden", message: "Apenas administradores podem reiniciar a jornada" });
      return;
    }

    const patientId = parseInt(req.params.patientId);
    if (isNaN(patientId)) { res.status(400).json({ error: "patientId inválido" }); return; }

    if (!(await checkClinicAccess(authReq, patientId))) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    await db
      .delete(patientJourneyStepsTable)
      .where(eq(patientJourneyStepsTable.patientId, patientId));

    const clinicId = authReq.clinicId ?? null;
    const [steps, auto, meta] = await Promise.all([
      getOrCreateSteps(patientId, clinicId),
      computeAutoStatus(patientId),
      computeJourneyMeta(patientId, clinicId),
    ]);

    await logAudit({
      userId: authReq.userId ?? null,
      patientId,
      action: "update",
      entityType: "patient_journey",
      summary: `Jornada do paciente reiniciada por ${authReq.userName ?? "admin"}`,
    });

    const merged = steps.map((step) => {
      const autoForStep = auto[step.stepKey as keyof AutoStatus] ?? "pending";
      return { ...step, status: mergeStatus(step.status, autoForStep), autoStatus: autoForStep };
    });

    res.json({ steps: merged, meta });
  } catch (err) {
    console.error("[journey] reset error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
