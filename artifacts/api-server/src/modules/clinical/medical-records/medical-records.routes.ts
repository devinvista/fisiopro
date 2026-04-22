import { Router, type Request } from "express";
import { db } from "@workspace/db";
import {
  anamnesisTable,
  evaluationsTable,
  treatmentPlansTable,
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
import { authMiddleware, type AuthRequest } from "../../../middleware/auth.js";
import { requirePermission } from "../../../middleware/rbac.js";
import { deleteCloudinaryAsset, extractPublicId } from "../../../utils/cloudinary.js";
import { logAudit } from "../../../utils/auditLog.js";
import { validateBody } from "../../../utils/validate.js";
import {
  anamnesisSchema,
  evaluationSchema,
  createTreatmentPlanSchema,
  updateTreatmentPlanSchema,
  createEvolutionSchema,
  updateEvolutionSchema,
  dischargeSummarySchema,
  patientFinancialSchema,
  bodyMeasurementSchema,
  type P,
  type PBodyMeasurement,
  type PEval,
  type PEvol,
  type PAttach,
  type PAtestado,
} from "./medical-records.schemas.js";
import { buildIndicators } from "./medical-records.service.js";

const router = Router({ mergeParams: true });
router.use(authMiddleware);

router.use(async (req: AuthRequest, res, next) => {
  if (req.isSuperAdmin || !req.clinicId) return next();
  const patientId = parseInt(req.params.patientId as string);
  if (isNaN(patientId)) {
    res.status(400).json({ error: "Bad Request", message: "patientId inválido" });
    return;
  }
  const [patient] = await db
    .select({ id: patientsTable.id })
    .from(patientsTable)
    .where(and(eq(patientsTable.id, patientId), eq(patientsTable.clinicId, req.clinicId)));
  if (!patient) {
    res.status(403).json({ error: "Forbidden", message: "Acesso negado a este paciente" });
    return;
  }
  next();
});

// GET /anamnesis?type=reabilitacao → single record for that type
// GET /anamnesis?all=true → array of all anamnesis for patient
// GET /anamnesis → most recent record (backwards compat)
router.get("/anamnesis", requirePermission("medical.read"), async (req: Request<P>, res) => {
  try {
    const patientId = parseInt(req.params.patientId);
    const { type, all } = req.query as { type?: string; all?: string };

    if (all === "true") {
      const records = await db
        .select()
        .from(anamnesisTable)
        .where(eq(anamnesisTable.patientId, patientId))
        .orderBy(anamnesisTable.updatedAt);
      res.json(records);
      return;
    }

    const whereClause = type
      ? and(eq(anamnesisTable.patientId, patientId), eq(anamnesisTable.templateType, type))
      : eq(anamnesisTable.patientId, patientId);

    const [anamnesis] = await db
      .select()
      .from(anamnesisTable)
      .where(whereClause)
      .orderBy(desc(anamnesisTable.updatedAt))
      .limit(1);

    if (!anamnesis) {
      res.status(404).json({ error: "Not Found", message: "Anamnese não encontrada" });
      return;
    }
    res.json(anamnesis);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/anamnesis", requirePermission("medical.write"), async (req: Request<P>, res) => {
  try {
    const patientId = parseInt(req.params.patientId);
    const body = validateBody(anamnesisSchema, req.body, res);
    if (!body) return;
    const {
      templateType,
      mainComplaint, diseaseHistory, medicalHistory, medications, allergies, familyHistory, lifestyle, painScale,
      occupation, laterality, cid10, painLocation, painAggravatingFactors, painRelievingFactors,
      functionalImpact, patientGoals, previousTreatments, tobaccoAlcohol,
      phototype, skinType, skinConditions, sunExposure, sunProtector, currentSkincareRoutine,
      previousAestheticTreatments, aestheticReactions, facialSurgeries, sensitizingMedications,
      skinContraindications, aestheticGoalDetails,
      mainBodyConcern, bodyConcernRegions, celluliteGrade, bodyWeight, bodyHeight, bodyMeasurements,
      physicalActivityLevel, physicalActivityType, waterIntake, dietHabits,
      bodyMedicalConditions, bodyContraindications, previousBodyTreatments,
    } = body;

    const resolvedType = templateType || "reabilitacao";

    const anamnesisFields = {
      mainComplaint, diseaseHistory, medicalHistory, medications, allergies, familyHistory, lifestyle, painScale,
      occupation, laterality, cid10, painLocation, painAggravatingFactors, painRelievingFactors,
      functionalImpact, patientGoals, previousTreatments, tobaccoAlcohol,
      phototype, skinType, skinConditions, sunExposure, sunProtector, currentSkincareRoutine,
      previousAestheticTreatments, aestheticReactions, facialSurgeries, sensitizingMedications,
      skinContraindications, aestheticGoalDetails,
      mainBodyConcern, bodyConcernRegions, celluliteGrade, bodyWeight, bodyHeight, bodyMeasurements,
      physicalActivityLevel, physicalActivityType, waterIntake, dietHabits,
      bodyMedicalConditions, bodyContraindications, previousBodyTreatments,
    };

    // Upsert by (patientId, templateType)
    const [existing] = await db
      .select({ id: anamnesisTable.id })
      .from(anamnesisTable)
      .where(and(eq(anamnesisTable.patientId, patientId), eq(anamnesisTable.templateType, resolvedType)));

    let anamnesis;
    const isUpdate = !!existing;
    if (isUpdate) {
      [anamnesis] = await db
        .update(anamnesisTable)
        .set({ ...anamnesisFields, updatedAt: new Date() })
        .where(and(eq(anamnesisTable.patientId, patientId), eq(anamnesisTable.templateType, resolvedType)))
        .returning();
    } else {
      [anamnesis] = await db
        .insert(anamnesisTable)
        .values({ patientId, templateType: resolvedType, ...anamnesisFields })
        .returning();
    }
    await logAudit({
      userId: (req as AuthRequest).userId,
      patientId,
      action: isUpdate ? "update" : "create",
      entityType: "anamnesis",
      entityId: anamnesis?.id,
      summary: isUpdate ? `Anamnese (${resolvedType}) atualizada` : `Anamnese (${resolvedType}) criada`,
    });
    res.json(anamnesis);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Indicators: aggregate key clinical indicators with history ─────────────
router.get("/indicators", requirePermission("medical.read"), async (req: Request<P>, res) => {
  try {
    const patientId = parseInt(req.params.patientId);

    const [allAnamnesis, evaluations, evolutions, bodyMeasurements] = await Promise.all([
      db.select().from(anamnesisTable).where(eq(anamnesisTable.patientId, patientId)).orderBy(anamnesisTable.updatedAt),
      db.select().from(evaluationsTable).where(eq(evaluationsTable.patientId, patientId)).orderBy(evaluationsTable.createdAt),
      db.select().from(evolutionsTable).where(eq(evolutionsTable.patientId, patientId)).orderBy(evolutionsTable.createdAt),
      db.select().from(bodyMeasurementsTable).where(eq(bodyMeasurementsTable.patientId, patientId)).orderBy(bodyMeasurementsTable.measuredAt),
    ]);

    res.json(buildIndicators(allAnamnesis, evaluations, evolutions, bodyMeasurements));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Body Measurements CRUD ──────────────────────────────────────────────────

router.get("/body-measurements", requirePermission("medical.read"), async (req: Request<P>, res) => {
  try {
    const patientId = parseInt(req.params.patientId);
    const rows = await db
      .select()
      .from(bodyMeasurementsTable)
      .where(eq(bodyMeasurementsTable.patientId, patientId))
      .orderBy(desc(bodyMeasurementsTable.measuredAt));
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/body-measurements", requirePermission("medical.write"), async (req: Request<P>, res) => {
  try {
    const patientId = parseInt(req.params.patientId);
    const data = validateBody(bodyMeasurementSchema, req.body, res);
    if (!data) return;
    const measuredAt = data.measuredAt ? new Date(data.measuredAt) : new Date();
    const [created] = await db.insert(bodyMeasurementsTable).values({
      patientId,
      measuredAt,
      weight: data.weight?.toString() ?? null,
      height: data.height?.toString() ?? null,
      waist: data.waist?.toString() ?? null,
      abdomen: data.abdomen?.toString() ?? null,
      hips: data.hips?.toString() ?? null,
      thighRight: data.thighRight?.toString() ?? null,
      thighLeft: data.thighLeft?.toString() ?? null,
      armRight: data.armRight?.toString() ?? null,
      armLeft: data.armLeft?.toString() ?? null,
      calfRight: data.calfRight?.toString() ?? null,
      calfLeft: data.calfLeft?.toString() ?? null,
      bodyFat: data.bodyFat?.toString() ?? null,
      celluliteGrade: data.celluliteGrade ?? null,
      notes: data.notes ?? null,
    }).returning();
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/body-measurements/:measurementId", requirePermission("medical.write"), async (req: Request<PBodyMeasurement>, res) => {
  try {
    const id = parseInt(req.params.measurementId);
    await db.delete(bodyMeasurementsTable).where(eq(bodyMeasurementsTable.id, id));
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/evaluations", requirePermission("medical.read"), async (req: Request<P>, res) => {
  try {
    const patientId = parseInt(req.params.patientId);
    const evaluations = await db
      .select()
      .from(evaluationsTable)
      .where(eq(evaluationsTable.patientId, patientId))
      .orderBy(desc(evaluationsTable.createdAt));
    res.json(evaluations);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/evaluations", requirePermission("medical.write"), async (req: Request<P>, res) => {
  try {
    const patientId = parseInt(req.params.patientId);
    const body = validateBody(evaluationSchema, req.body, res);
    if (!body) return;
    const { inspection, posture, rangeOfMotion, muscleStrength, orthopedicTests, functionalDiagnosis, painScale, palpation, gait, functionalTests } = body;
    const [evaluation] = await db
      .insert(evaluationsTable)
      .values({ patientId, inspection, posture, rangeOfMotion, muscleStrength, orthopedicTests, functionalDiagnosis, painScale, palpation, gait, functionalTests })
      .returning();
    await logAudit({ userId: (req as AuthRequest).userId, patientId, action: "create", entityType: "evaluation", entityId: evaluation?.id, summary: "Avaliação física criada" });
    res.status(201).json(evaluation);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/evaluations/:evaluationId", requirePermission("medical.write"), async (req: Request<PEval>, res) => {
  try {
    const patientId = parseInt(req.params.patientId);
    const evaluationId = parseInt(req.params.evaluationId);
    const body = validateBody(evaluationSchema.partial(), req.body, res);
    if (!body) return;
    const { inspection, posture, rangeOfMotion, muscleStrength, orthopedicTests, functionalDiagnosis, painScale, palpation, gait, functionalTests } = body;

    const [existing] = await db
      .select()
      .from(evaluationsTable)
      .where(eq(evaluationsTable.id, evaluationId));
    if (!existing || existing.patientId !== patientId) {
      res.status(404).json({ error: "Not Found" });
      return;
    }

    const [updated] = await db
      .update(evaluationsTable)
      .set({ inspection, posture, rangeOfMotion, muscleStrength, orthopedicTests, functionalDiagnosis, painScale, palpation, gait, functionalTests, updatedAt: new Date() })
      .where(eq(evaluationsTable.id, evaluationId))
      .returning();
    await logAudit({ userId: (req as AuthRequest).userId, patientId, action: "update", entityType: "evaluation", entityId: evaluationId, summary: "Avaliação física editada" });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/evaluations/:evaluationId", requirePermission("medical.write"), async (req: Request<PEval>, res) => {
  try {
    const patientId = parseInt(req.params.patientId);
    const evaluationId = parseInt(req.params.evaluationId);

    const [existing] = await db
      .select()
      .from(evaluationsTable)
      .where(eq(evaluationsTable.id, evaluationId));
    if (!existing || existing.patientId !== patientId) {
      res.status(404).json({ error: "Not Found" });
      return;
    }

    await db.delete(evaluationsTable).where(eq(evaluationsTable.id, evaluationId));
    await logAudit({ userId: (req as AuthRequest).userId, patientId, action: "delete", entityType: "evaluation", entityId: evaluationId, summary: "Avaliação física excluída" });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Multi-plan: list all plans for patient ────────────────────────────────
router.get("/treatment-plans", requirePermission("medical.read"), async (req: Request<P>, res) => {
  try {
    const patientId = parseInt(req.params.patientId);
    const plans = await db
      .select()
      .from(treatmentPlansTable)
      .where(eq(treatmentPlansTable.patientId, patientId))
      .orderBy(desc(treatmentPlansTable.createdAt));
    res.json(plans);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Multi-plan: create a new plan ─────────────────────────────────────────
router.post("/treatment-plans", requirePermission("medical.write"), async (req: Request<P>, res) => {
  try {
    const patientId = parseInt(req.params.patientId);
    const authReq = req as AuthRequest;
    const body = validateBody(createTreatmentPlanSchema, req.body, res);
    if (!body) return;
    const { objectives, techniques, frequency, estimatedSessions, status = "ativo", startDate, responsibleProfessional } = body;

    const [patient] = await db.select({ clinicId: patientsTable.clinicId }).from(patientsTable).where(eq(patientsTable.id, patientId)).limit(1);
    const clinicId = patient?.clinicId ?? authReq.clinicId ?? null;

    const [plan] = await db
      .insert(treatmentPlansTable)
      .values({ patientId, clinicId, objectives, techniques, frequency, estimatedSessions, status, startDate: startDate || null, responsibleProfessional: responsibleProfessional || null })
      .returning();

    await logAudit({
      userId: authReq.userId,
      patientId,
      action: "create",
      entityType: "treatment_plan",
      entityId: plan?.id,
      summary: "Plano de tratamento criado",
    });
    res.status(201).json(plan);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Multi-plan: get specific plan ─────────────────────────────────────────
router.get("/treatment-plans/:planId", requirePermission("medical.read"), async (req: Request<{ patientId: string; planId: string }>, res) => {
  try {
    const patientId = parseInt(req.params.patientId);
    const planId = parseInt(req.params.planId);
    const [plan] = await db
      .select()
      .from(treatmentPlansTable)
      .where(and(eq(treatmentPlansTable.id, planId), eq(treatmentPlansTable.patientId, patientId)));
    if (!plan) { res.status(404).json({ error: "Not Found" }); return; }
    res.json(plan);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Multi-plan: update specific plan ──────────────────────────────────────
router.put("/treatment-plans/:planId", requirePermission("medical.write"), async (req: Request<{ patientId: string; planId: string }>, res) => {
  try {
    const patientId = parseInt(req.params.patientId);
    const planId = parseInt(req.params.planId);
    const body = validateBody(updateTreatmentPlanSchema, req.body, res);
    if (!body) return;
    const { objectives, techniques, frequency, estimatedSessions, status, startDate, responsibleProfessional } = body;

    const [existing] = await db.select({ id: treatmentPlansTable.id }).from(treatmentPlansTable)
      .where(and(eq(treatmentPlansTable.id, planId), eq(treatmentPlansTable.patientId, patientId)));
    if (!existing) { res.status(404).json({ error: "Not Found" }); return; }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (objectives !== undefined) updateData.objectives = objectives;
    if (techniques !== undefined) updateData.techniques = techniques;
    if (frequency !== undefined) updateData.frequency = frequency;
    if (estimatedSessions !== undefined) updateData.estimatedSessions = estimatedSessions;
    if (status !== undefined) updateData.status = status;
    if (startDate !== undefined) updateData.startDate = startDate || null;
    if (responsibleProfessional !== undefined) updateData.responsibleProfessional = responsibleProfessional || null;

    const [plan] = await db
      .update(treatmentPlansTable)
      .set(updateData as any)
      .where(eq(treatmentPlansTable.id, planId))
      .returning();

    await logAudit({
      userId: (req as AuthRequest).userId,
      patientId,
      action: "update",
      entityType: "treatment_plan",
      entityId: planId,
      summary: "Plano de tratamento atualizado",
    });
    res.json(plan);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Multi-plan: delete specific plan ──────────────────────────────────────
router.delete("/treatment-plans/:planId", requirePermission("medical.write"), async (req: Request<{ patientId: string; planId: string }>, res) => {
  try {
    const patientId = parseInt(req.params.patientId);
    const planId = parseInt(req.params.planId);
    const [existing] = await db.select({ id: treatmentPlansTable.id }).from(treatmentPlansTable)
      .where(and(eq(treatmentPlansTable.id, planId), eq(treatmentPlansTable.patientId, patientId)));
    if (!existing) { res.status(404).json({ error: "Not Found" }); return; }
    await db.delete(treatmentPlansTable).where(eq(treatmentPlansTable.id, planId));
    await logAudit({
      userId: (req as AuthRequest).userId,
      patientId,
      action: "delete",
      entityType: "treatment_plan",
      entityId: planId,
      summary: "Plano de tratamento excluído",
    });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Compat: single-plan GET (returns most recent active plan) ──────────────
router.get("/treatment-plan", requirePermission("medical.read"), async (req: Request<P>, res) => {
  try {
    const patientId = parseInt(req.params.patientId);
    const plans = await db
      .select()
      .from(treatmentPlansTable)
      .where(eq(treatmentPlansTable.patientId, patientId))
      .orderBy(desc(treatmentPlansTable.createdAt));
    const active = plans.find(p => p.status === "ativo") ?? plans[0];
    if (!active) { res.status(404).json({ error: "Not Found", message: "Plano de tratamento não encontrado" }); return; }
    res.json(active);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Compat: single-plan POST (updates most recent or creates) ─────────────
router.post("/treatment-plan", requirePermission("medical.write"), async (req: Request<P>, res) => {
  try {
    const patientId = parseInt(req.params.patientId);
    const authReq = req as AuthRequest;
    const body = validateBody(createTreatmentPlanSchema, req.body, res);
    if (!body) return;
    const { objectives, techniques, frequency, estimatedSessions, status = "ativo", startDate, responsibleProfessional } = body;

    const plans = await db.select().from(treatmentPlansTable).where(eq(treatmentPlansTable.patientId, patientId)).orderBy(desc(treatmentPlansTable.createdAt));
    const existing = plans.find(p => p.status === "ativo") ?? plans[0];

    let plan;
    if (existing) {
      [plan] = await db
        .update(treatmentPlansTable)
        .set({ objectives, techniques, frequency, estimatedSessions, status, startDate: startDate || null, responsibleProfessional: responsibleProfessional || null, updatedAt: new Date() })
        .where(eq(treatmentPlansTable.id, existing.id))
        .returning();
    } else {
      const [patient] = await db.select({ clinicId: patientsTable.clinicId }).from(patientsTable).where(eq(patientsTable.id, patientId)).limit(1);
      const clinicId = patient?.clinicId ?? authReq.clinicId ?? null;
      [plan] = await db
        .insert(treatmentPlansTable)
        .values({ patientId, clinicId, objectives, techniques, frequency, estimatedSessions, status, startDate: startDate || null, responsibleProfessional: responsibleProfessional || null })
        .returning();
    }
    await logAudit({
      userId: authReq.userId,
      patientId,
      action: existing ? "update" : "create",
      entityType: "treatment_plan",
      entityId: plan?.id,
      summary: existing ? "Plano de tratamento atualizado" : "Plano de tratamento criado",
    });
    const httpStatus = existing ? 200 : 201;
    res.status(httpStatus).json(plan);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/evolutions", requirePermission("medical.read"), async (req: Request<P>, res) => {
  try {
    const patientId = parseInt(req.params.patientId);
    const evolutions = await db
      .select()
      .from(evolutionsTable)
      .where(eq(evolutionsTable.patientId, patientId))
      .orderBy(desc(evolutionsTable.createdAt));
    res.json(evolutions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/evolutions", requirePermission("medical.write"), async (req: Request<P>, res) => {
  try {
    const patientId = parseInt(req.params.patientId);
    const body = validateBody(createEvolutionSchema, req.body, res);
    if (!body) return;
    const { appointmentId, description, patientResponse, clinicalNotes, complications, painScale, sessionDuration, techniquesUsed, homeExercises, nextSessionGoals } = body;
    const [evolution] = await db
      .insert(evolutionsTable)
      .values({ patientId, appointmentId, description, patientResponse, clinicalNotes, complications, painScale: painScale ?? null, sessionDuration: sessionDuration ?? null, techniquesUsed: techniquesUsed ?? null, homeExercises: homeExercises ?? null, nextSessionGoals: nextSessionGoals ?? null })
      .returning();
    await logAudit({ userId: (req as AuthRequest).userId, patientId, action: "create", entityType: "evolution", entityId: evolution?.id, summary: "Evolução de sessão criada" });
    res.status(201).json(evolution);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/evolutions/:evolutionId", requirePermission("medical.write"), async (req: Request<PEvol>, res) => {
  try {
    const patientId = parseInt(req.params.patientId);
    const evolutionId = parseInt(req.params.evolutionId);
    const body = validateBody(updateEvolutionSchema, req.body, res);
    if (!body) return;
    const { appointmentId, description, patientResponse, clinicalNotes, complications, painScale, sessionDuration, techniquesUsed, homeExercises, nextSessionGoals } = body;

    const [existing] = await db
      .select()
      .from(evolutionsTable)
      .where(eq(evolutionsTable.id, evolutionId));
    if (!existing || existing.patientId !== patientId) {
      res.status(404).json({ error: "Not Found" });
      return;
    }

    const [updated] = await db
      .update(evolutionsTable)
      .set({ appointmentId: appointmentId || null, description, patientResponse, clinicalNotes, complications, painScale: painScale ?? null, sessionDuration: sessionDuration ?? null, techniquesUsed: techniquesUsed ?? null, homeExercises: homeExercises ?? null, nextSessionGoals: nextSessionGoals ?? null })
      .where(eq(evolutionsTable.id, evolutionId))
      .returning();
    await logAudit({ userId: (req as AuthRequest).userId, patientId, action: "update", entityType: "evolution", entityId: evolutionId, summary: "Evolução de sessão editada" });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/evolutions/:evolutionId", requirePermission("medical.write"), async (req: Request<PEvol>, res) => {
  try {
    const patientId = parseInt(req.params.patientId);
    const evolutionId = parseInt(req.params.evolutionId);

    const [existing] = await db
      .select()
      .from(evolutionsTable)
      .where(eq(evolutionsTable.id, evolutionId));
    if (!existing || existing.patientId !== patientId) {
      res.status(404).json({ error: "Not Found" });
      return;
    }

    await db.delete(evolutionsTable).where(eq(evolutionsTable.id, evolutionId));
    await logAudit({ userId: (req as AuthRequest).userId, patientId, action: "delete", entityType: "evolution", entityId: evolutionId, summary: "Evolução de sessão excluída" });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/appointments", requirePermission("appointments.read"), async (req: Request<P>, res) => {
  try {
    const patientId = parseInt(req.params.patientId);
    const rows = await db
      .select({ appointment: appointmentsTable, procedure: proceduresTable })
      .from(appointmentsTable)
      .leftJoin(proceduresTable, eq(appointmentsTable.procedureId, proceduresTable.id))
      .where(eq(appointmentsTable.patientId, patientId))
      .orderBy(desc(appointmentsTable.date));

    res.json(rows.map((r) => ({ ...r.appointment, procedure: r.procedure })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/discharge-summary", requirePermission("medical.read"), async (req: Request<P>, res) => {
  try {
    const patientId = parseInt(req.params.patientId);
    const [summary] = await db
      .select()
      .from(dischargeSummariesTable)
      .where(eq(dischargeSummariesTable.patientId, patientId));
    if (!summary) {
      res.status(404).json({ error: "Not Found", message: "Alta fisioterapêutica não encontrada" });
      return;
    }
    res.json(summary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/discharge-summary", requirePermission("medical.write"), async (req: Request<P>, res) => {
  try {
    const patientId = parseInt(req.params.patientId);
    const body = validateBody(dischargeSummarySchema, req.body, res);
    if (!body) return;
    const { dischargeDate, dischargeReason, achievedResults, recommendations } = body;

    const existing = await db
      .select()
      .from(dischargeSummariesTable)
      .where(eq(dischargeSummariesTable.patientId, patientId));

    let summary;
    const isDischargeUpdate = existing.length > 0;
    if (isDischargeUpdate) {
      [summary] = await db
        .update(dischargeSummariesTable)
        .set({
          dischargeDate: dischargeDate ?? undefined,
          dischargeReason: dischargeReason ?? undefined,
          achievedResults: achievedResults ?? undefined,
          recommendations: recommendations ?? undefined,
          updatedAt: new Date(),
        })
        .where(eq(dischargeSummariesTable.patientId, patientId))
        .returning();
    } else {
      [summary] = await db
        .insert(dischargeSummariesTable)
        .values({
          patientId,
          dischargeDate: (dischargeDate ?? "") as string,
          dischargeReason: (dischargeReason ?? "") as string,
          achievedResults: achievedResults ?? undefined,
          recommendations: recommendations ?? undefined,
        })
        .returning();
    }
    await logAudit({
      userId: (req as AuthRequest).userId,
      patientId,
      action: isDischargeUpdate ? "update" : "create",
      entityType: "discharge",
      entityId: summary?.id,
      summary: isDischargeUpdate ? "Alta fisioterapêutica atualizada" : "Alta fisioterapêutica registrada",
    });
    res.json(summary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/financial", requirePermission("financial.read"), async (req: Request<P>, res) => {
  try {
    const patientId = parseInt(req.params.patientId);
    const rows = await db
      .select({
        record: financialRecordsTable,
        appointment: appointmentsTable,
        procedure: proceduresTable,
      })
      .from(financialRecordsTable)
      .leftJoin(appointmentsTable, eq(financialRecordsTable.appointmentId, appointmentsTable.id))
      .leftJoin(proceduresTable, eq(appointmentsTable.procedureId, proceduresTable.id))
      .where(
        or(
          eq(financialRecordsTable.patientId, patientId),
          eq(appointmentsTable.patientId, patientId)
        )
      )
      .orderBy(desc(financialRecordsTable.createdAt));

    res.json(rows.map((r) => ({ ...r.record, appointment: r.appointment, procedure: r.procedure })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/financial", requirePermission("financial.write"), async (req: Request<P>, res) => {
  try {
    const patientId = parseInt(req.params.patientId);
    const body = validateBody(patientFinancialSchema, req.body, res);
    if (!body) return;
    const { type, amount, description, category } = body;

    const [record] = await db
      .insert(financialRecordsTable)
      .values({ type, amount: String(amount), description, category: category ?? null, patientId })
      .returning();

    await logAudit({
      userId: (req as AuthRequest).userId,
      patientId,
      action: "create",
      entityType: "financial",
      entityId: record?.id,
      summary: `Lançamento financeiro: ${type === "receita" ? "receita" : "despesa"} — ${description}`,
    });
    res.status(201).json(record);
  } catch (err: any) {
    if (err?.cause?.code === "23503" || err?.code === "23503") {
      res.status(404).json({ error: "Not Found", message: "Paciente não encontrado" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Exam Attachments ─────────────────────────────────────────────────────────

router.get("/attachments", requirePermission("medical.read"), async (req: Request<P>, res) => {
  try {
    const patientId = parseInt(req.params.patientId);
    const attachments = await db
      .select()
      .from(examAttachmentsTable)
      .where(eq(examAttachmentsTable.patientId, patientId))
      .orderBy(desc(examAttachmentsTable.uploadedAt));
    res.json(attachments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/attachments", requirePermission("medical.write"), async (req: Request<P>, res) => {
  try {
    const patientId = parseInt(req.params.patientId);
    const { originalFilename, contentType, fileSize, objectPath, description, resultText, examTitle } = req.body;

    const hasFile = objectPath && originalFilename;
    const hasText = resultText && resultText.trim().length > 0;

    if (!hasFile && !hasText) {
      res.status(400).json({ error: "Informe um arquivo ou um resultado em texto." });
      return;
    }

    const [attachment] = await db
      .insert(examAttachmentsTable)
      .values({
        patientId,
        examTitle: examTitle || null,
        originalFilename: originalFilename || null,
        contentType: contentType || null,
        fileSize: fileSize || null,
        objectPath: objectPath || null,
        description: description || null,
        resultText: resultText || null,
      })
      .returning();

    await logAudit({
      userId: (req as AuthRequest).userId,
      patientId,
      action: "create",
      entityType: "attachment",
      entityId: attachment?.id,
      summary: `Anexo adicionado: ${examTitle || originalFilename || "resultado de exame"}`,
    });
    res.status(201).json(attachment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/attachments/:attachmentId", requirePermission("medical.write"), async (req: Request<PAttach>, res) => {
  try {
    const patientId = parseInt(req.params.patientId);
    const attachmentId = parseInt(req.params.attachmentId);

    const [existing] = await db
      .select()
      .from(examAttachmentsTable)
      .where(eq(examAttachmentsTable.id, attachmentId));

    if (!existing || existing.patientId !== patientId) {
      res.status(404).json({ error: "Anexo não encontrado" });
      return;
    }

    try {
      if (existing.objectPath) {
        const publicId = extractPublicId(existing.objectPath);
        if (publicId) await deleteCloudinaryAsset(publicId);
      }
    } catch (storageErr) {
      console.error("Falha ao excluir arquivo do Cloudinary (continuando com remoção do banco):", storageErr);
    }

    await db.delete(examAttachmentsTable).where(eq(examAttachmentsTable.id, attachmentId));
    await logAudit({
      userId: (req as AuthRequest).userId,
      patientId,
      action: "delete",
      entityType: "attachment",
      entityId: attachmentId,
      summary: `Anexo excluído: ${existing.examTitle || existing.originalFilename || "resultado de exame"}`,
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Atestados ────────────────────────────────────────────────────────────────

router.get("/atestados", requirePermission("medical.read"), async (req: Request<P>, res) => {
  try {
    const patientId = parseInt(req.params.patientId);
    const atestados = await db
      .select()
      .from(atestadosTable)
      .where(eq(atestadosTable.patientId, patientId))
      .orderBy(desc(atestadosTable.issuedAt));
    res.json(atestados);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/atestados", requirePermission("medical.write"), async (req: Request<P>, res) => {
  try {
    const patientId = parseInt(req.params.patientId);
    const { type, professionalName, professionalSpecialty, professionalCouncil, content, cid, daysOff } = req.body;

    if (!type || !professionalName || !content) {
      res.status(400).json({ error: "Campos obrigatórios: type, professionalName, content" });
      return;
    }

    const [atestado] = await db
      .insert(atestadosTable)
      .values({
        patientId,
        type,
        professionalName,
        professionalSpecialty: professionalSpecialty || null,
        professionalCouncil: professionalCouncil || null,
        content,
        cid: cid || null,
        daysOff: daysOff ? parseInt(daysOff) : null,
      })
      .returning();

    const typeLabel: Record<string, string> = {
      atestado: "Atestado médico",
      declaracao: "Declaração de comparecimento",
      encaminhamento: "Encaminhamento",
    };
    await logAudit({
      userId: (req as AuthRequest).userId,
      patientId,
      action: "create",
      entityType: "atestado",
      entityId: atestado?.id,
      summary: `${typeLabel[type] || "Atestado"} emitido por ${professionalName}`,
    });
    res.status(201).json(atestado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/atestados/:atestadoId", requirePermission("medical.write"), async (req: Request<PAtestado>, res) => {
  try {
    const patientId = parseInt(req.params.patientId);
    const atestadoId = parseInt(req.params.atestadoId);

    const [existing] = await db
      .select()
      .from(atestadosTable)
      .where(eq(atestadosTable.id, atestadoId));

    if (!existing || existing.patientId !== patientId) {
      res.status(404).json({ error: "Atestado não encontrado" });
      return;
    }

    await db.delete(atestadosTable).where(eq(atestadosTable.id, atestadoId));
    logAudit({
      userId: (req as AuthRequest).userId,
      patientId,
      action: "delete",
      entityType: "atestado",
      entityId: atestadoId,
      summary: `Atestado excluído (tipo: ${existing.type})`,
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
