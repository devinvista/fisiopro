import { Router, type Request } from "express";
import { db } from "@workspace/db";
import {
  patientJourneyStepsTable,
  JOURNEY_STEP_DEFS,
  patientsTable,
  anamnesisTable,
  evaluationsTable,
  treatmentPlansTable,
  appointmentsTable,
  dischargeSummariesTable,
  patientPackagesTable,
} from "@workspace/db";
import { eq, and, or, gt, count } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../../../middleware/auth.js";
import { logAudit } from "../../../utils/auditLog.js";

const router = Router({ mergeParams: true });
router.use(authMiddleware);

type P = { patientId: string };
type PS = { patientId: string; stepId: string };

async function checkClinicAccess(req: AuthRequest, patientId: number): Promise<boolean> {
  if (req.isSuperAdmin || !req.clinicId) return true;
  const [patient] = await db
    .select({ id: patientsTable.id })
    .from(patientsTable)
    .where(and(eq(patientsTable.id, patientId), eq(patientsTable.clinicId, req.clinicId)));
  return !!patient;
}

interface AutoStatus {
  cadastro: "completed";
  anamnese: "pending" | "completed";
  avaliacao: "pending" | "completed";
  plano_tratamento: "pending" | "completed";
  procedimentos: "pending" | "completed";
  agendamento: "pending" | "completed";
  tratamento: "pending" | "in_progress" | "completed";
  alta: "pending" | "completed";
}

async function computeAutoStatus(patientId: number): Promise<AutoStatus> {
  const [
    [anamnesis],
    evaluationsRows,
    [treatmentPlan],
    packagesRows,
    appointmentsRows,
    completedRows,
    [discharge],
  ] = await Promise.all([
    db.select({ id: anamnesisTable.id }).from(anamnesisTable).where(eq(anamnesisTable.patientId, patientId)).limit(1),
    db.select({ id: evaluationsTable.id }).from(evaluationsTable).where(eq(evaluationsTable.patientId, patientId)).limit(1),
    db.select({ id: treatmentPlansTable.id }).from(treatmentPlansTable).where(eq(treatmentPlansTable.patientId, patientId)).limit(1),
    db.select({ id: patientPackagesTable.id }).from(patientPackagesTable).where(eq(patientPackagesTable.patientId, patientId)).limit(1),
    db.select({ id: appointmentsTable.id }).from(appointmentsTable).where(eq(appointmentsTable.patientId, patientId)).limit(1),
    db.select({ id: appointmentsTable.id }).from(appointmentsTable).where(
      and(eq(appointmentsTable.patientId, patientId), or(eq(appointmentsTable.status, "concluido"), eq(appointmentsTable.status, "presenca")))
    ).limit(1),
    db.select({ id: dischargeSummariesTable.id }).from(dischargeSummariesTable).where(eq(dischargeSummariesTable.patientId, patientId)).limit(1),
  ]);

  const hasAnamnesis = !!anamnesis;
  const hasEvaluation = evaluationsRows.length > 0;
  const hasTreatmentPlan = !!treatmentPlan;
  const hasPackages = packagesRows.length > 0;
  const hasAppointment = appointmentsRows.length > 0;
  const hasCompletedSession = completedRows.length > 0;
  const hasDischarge = !!discharge;

  return {
    cadastro: "completed",
    anamnese: hasAnamnesis ? "completed" : "pending",
    avaliacao: hasEvaluation ? "completed" : "pending",
    plano_tratamento: hasTreatmentPlan ? "completed" : "pending",
    procedimentos: hasPackages ? "completed" : "pending",
    agendamento: hasAppointment ? "completed" : "pending",
    tratamento: hasDischarge ? "completed" : hasCompletedSession ? "in_progress" : "pending",
    alta: hasDischarge ? "completed" : "pending",
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
    const now = new Date();
    const toInsert = JOURNEY_STEP_DEFS.map((def) => ({
      patientId,
      clinicId: clinicId ?? null,
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
    steps = await db
      .select()
      .from(patientJourneyStepsTable)
      .where(eq(patientJourneyStepsTable.patientId, patientId))
      .orderBy(patientJourneyStepsTable.stepOrder);
  }

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
    const steps = await getOrCreateSteps(patientId, clinicId);
    const auto = await computeAutoStatus(patientId);

    const merged = steps.map((step) => {
      const autoForStep = auto[step.stepKey as keyof AutoStatus] ?? "pending";
      const effectiveStatus = mergeStatus(step.status, autoForStep);
      return { ...step, status: effectiveStatus, autoStatus: autoForStep };
    });

    res.json(merged);
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
    const steps = await getOrCreateSteps(patientId, clinicId);
    const auto = await computeAutoStatus(patientId);

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

    res.json(merged);
  } catch (err) {
    console.error("[journey] reset error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
