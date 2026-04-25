import { Router, type Request, type Response, type NextFunction } from "express";
import { db, patientsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../../../middleware/auth.js";
import { requirePermission } from "../../../middleware/rbac.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { HttpError } from "../../../utils/httpError.js";
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
import * as svc from "./medical-records.service.js";

const router = Router({ mergeParams: true });
router.use(authMiddleware);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCtx(req: AuthRequest): svc.AuthCtx {
  return { userId: req.userId };
}

function patientIdParam(req: Request<P>): number {
  const id = parseInt(req.params.patientId);
  if (isNaN(id) || id <= 0) throw HttpError.badRequest("patientId inválido");
  return id;
}

// ─── Tenant isolation: garante que o paciente pertence à clínica do usuário ──

router.use(asyncHandler(async (req: AuthRequest, _res, next: NextFunction) => {
  if (req.isSuperAdmin || !req.clinicId) return next();
  const patientId = parseInt(req.params.patientId as string);
  if (isNaN(patientId)) throw HttpError.badRequest("patientId inválido");
  const [patient] = await db
    .select({ id: patientsTable.id })
    .from(patientsTable)
    .where(and(eq(patientsTable.id, patientId), eq(patientsTable.clinicId, req.clinicId)));
  if (!patient) throw HttpError.forbidden("Acesso negado a este paciente");
  next();
}));

// ─── Anamnesis ────────────────────────────────────────────────────────────────

router.get("/anamnesis", requirePermission("anamnesis.read"), asyncHandler(async (req: Request<P>, res: Response) => {
  const patientId = patientIdParam(req);
  const { type, all } = req.query as { type?: string; all?: string };
  const data = await svc.getAnamnesisForPatient(patientId, { type, all: all === "true" });
  res.json(data);
}));

router.post("/anamnesis", requirePermission("anamnesis.write"), asyncHandler(async (req: Request<P>, res: Response) => {
  const patientId = patientIdParam(req);
  const body = validateBody(anamnesisSchema, req.body, res);
  if (!body) return;
  const record = await svc.upsertAnamnesisForPatient(patientId, body, getCtx(req as AuthRequest));
  res.json(record);
}));

// ─── Indicators ──────────────────────────────────────────────────────────────

router.get("/indicators", requirePermission("medical.read"), asyncHandler(async (req: Request<P>, res: Response) => {
  const patientId = patientIdParam(req);
  res.json(await svc.getPatientIndicators(patientId));
}));

// ─── Body Measurements ───────────────────────────────────────────────────────

router.get("/body-measurements", requirePermission("medical.read"), asyncHandler(async (req: Request<P>, res: Response) => {
  res.json(await svc.listPatientBodyMeasurements(patientIdParam(req)));
}));

router.post("/body-measurements", requirePermission("medical.write"), asyncHandler(async (req: Request<P>, res: Response) => {
  const patientId = patientIdParam(req);
  const data = validateBody(bodyMeasurementSchema, req.body, res);
  if (!data) return;
  const created = await svc.createPatientBodyMeasurement(patientId, data);
  res.status(201).json(created);
}));

router.delete("/body-measurements/:measurementId", requirePermission("medical.write"), asyncHandler(async (req: Request<PBodyMeasurement>, res: Response) => {
  const patientId = patientIdParam(req as Request<P>);
  const id = parseInt(req.params.measurementId);
  await svc.deletePatientBodyMeasurement(id, patientId);
  res.status(204).end();
}));

// ─── Evaluations ──────────────────────────────────────────────────────────────

router.get("/evaluations", requirePermission("medical.read"), asyncHandler(async (req: Request<P>, res: Response) => {
  res.json(await svc.listPatientEvaluations(patientIdParam(req)));
}));

router.post("/evaluations", requirePermission("medical.write"), asyncHandler(async (req: Request<P>, res: Response) => {
  const patientId = patientIdParam(req);
  const body = validateBody(evaluationSchema, req.body, res);
  if (!body) return;
  const evaluation = await svc.createPatientEvaluation(patientId, body, getCtx(req as AuthRequest));
  res.status(201).json(evaluation);
}));

router.put("/evaluations/:evaluationId", requirePermission("medical.write"), asyncHandler(async (req: Request<PEval>, res: Response) => {
  const patientId = patientIdParam(req as Request<P>);
  const evaluationId = parseInt(req.params.evaluationId);
  const body = validateBody(evaluationSchema.partial(), req.body, res);
  if (!body) return;
  const updated = await svc.updatePatientEvaluation(patientId, evaluationId, body, getCtx(req as AuthRequest));
  res.json(updated);
}));

router.delete("/evaluations/:evaluationId", requirePermission("medical.write"), asyncHandler(async (req: Request<PEval>, res: Response) => {
  const patientId = patientIdParam(req as Request<P>);
  const evaluationId = parseInt(req.params.evaluationId);
  await svc.deletePatientEvaluation(patientId, evaluationId, getCtx(req as AuthRequest));
  res.status(204).send();
}));

// ─── Treatment Plans (multi-plan) ─────────────────────────────────────────────

router.get("/treatment-plans", requirePermission("medical.read"), asyncHandler(async (req: Request<P>, res: Response) => {
  res.json(await svc.listPatientTreatmentPlans(patientIdParam(req)));
}));

router.post("/treatment-plans", requirePermission("medical.write"), asyncHandler(async (req: Request<P>, res: Response) => {
  const patientId = patientIdParam(req);
  const authReq = req as AuthRequest;
  const body = validateBody(createTreatmentPlanSchema, req.body, res);
  if (!body) return;
  const plan = await svc.createPatientTreatmentPlan(patientId, body, getCtx(authReq), authReq.clinicId ?? null);
  res.status(201).json(plan);
}));

router.get("/treatment-plans/:planId", requirePermission("medical.read"), asyncHandler(async (req: Request<{ patientId: string; planId: string }>, res: Response) => {
  const patientId = patientIdParam(req as Request<P>);
  const planId = parseInt(req.params.planId);
  res.json(await svc.getPatientTreatmentPlan(patientId, planId));
}));

router.put("/treatment-plans/:planId", requirePermission("medical.write"), asyncHandler(async (req: Request<{ patientId: string; planId: string }>, res: Response) => {
  const patientId = patientIdParam(req as Request<P>);
  const planId = parseInt(req.params.planId);
  const body = validateBody(updateTreatmentPlanSchema, req.body, res);
  if (!body) return;
  const plan = await svc.updatePatientTreatmentPlanById(patientId, planId, body, getCtx(req as AuthRequest));
  res.json(plan);
}));

router.delete("/treatment-plans/:planId", requirePermission("medical.write"), asyncHandler(async (req: Request<{ patientId: string; planId: string }>, res: Response) => {
  const patientId = patientIdParam(req as Request<P>);
  const planId = parseInt(req.params.planId);
  await svc.deletePatientTreatmentPlan(patientId, planId, getCtx(req as AuthRequest));
  res.status(204).send();
}));

// ─── Treatment Plan (compat, single ativo) ────────────────────────────────────

router.get("/treatment-plan", requirePermission("medical.read"), asyncHandler(async (req: Request<P>, res: Response) => {
  res.json(await svc.getActiveTreatmentPlan(patientIdParam(req)));
}));

router.post("/treatment-plan", requirePermission("medical.write"), asyncHandler(async (req: Request<P>, res: Response) => {
  const patientId = patientIdParam(req);
  const authReq = req as AuthRequest;
  const body = validateBody(createTreatmentPlanSchema, req.body, res);
  if (!body) return;
  const { plan, isUpdate } = await svc.upsertActiveTreatmentPlan(patientId, body, getCtx(authReq), authReq.clinicId ?? null);
  res.status(isUpdate ? 200 : 201).json(plan);
}));

// ─── Evolutions ───────────────────────────────────────────────────────────────

router.get("/evolutions", requirePermission("medical.read"), asyncHandler(async (req: Request<P>, res: Response) => {
  res.json(await svc.listPatientEvolutions(patientIdParam(req)));
}));

router.post("/evolutions", requirePermission("medical.write"), asyncHandler(async (req: Request<P>, res: Response) => {
  const patientId = patientIdParam(req);
  const body = validateBody(createEvolutionSchema, req.body, res);
  if (!body) return;
  const evolution = await svc.createPatientEvolution(patientId, body, getCtx(req as AuthRequest));
  res.status(201).json(evolution);
}));

router.put("/evolutions/:evolutionId", requirePermission("medical.write"), asyncHandler(async (req: Request<PEvol>, res: Response) => {
  const patientId = patientIdParam(req as Request<P>);
  const evolutionId = parseInt(req.params.evolutionId);
  const body = validateBody(updateEvolutionSchema, req.body, res);
  if (!body) return;
  const updated = await svc.updatePatientEvolution(patientId, evolutionId, body, getCtx(req as AuthRequest));
  res.json(updated);
}));

router.delete("/evolutions/:evolutionId", requirePermission("medical.write"), asyncHandler(async (req: Request<PEvol>, res: Response) => {
  const patientId = patientIdParam(req as Request<P>);
  const evolutionId = parseInt(req.params.evolutionId);
  await svc.deletePatientEvolution(patientId, evolutionId, getCtx(req as AuthRequest));
  res.status(204).send();
}));

// ─── Appointments (visão do paciente) ────────────────────────────────────────

router.get("/appointments", requirePermission("appointments.read"), asyncHandler(async (req: Request<P>, res: Response) => {
  res.json(await svc.listAppointmentsForPatient(patientIdParam(req)));
}));

// ─── Discharge Summary ────────────────────────────────────────────────────────

router.get("/discharge-summary", requirePermission("medical.read"), asyncHandler(async (req: Request<P>, res: Response) => {
  res.json(await svc.getPatientDischargeSummary(patientIdParam(req)));
}));

router.post("/discharge-summary", requirePermission("medical.write"), asyncHandler(async (req: Request<P>, res: Response) => {
  const patientId = patientIdParam(req);
  const body = validateBody(dischargeSummarySchema, req.body, res);
  if (!body) return;
  const summary = await svc.upsertPatientDischargeSummary(patientId, body, getCtx(req as AuthRequest));
  res.json(summary);
}));

// ─── Patient Financial Records ────────────────────────────────────────────────

router.get("/financial", requirePermission("financial.read"), asyncHandler(async (req: Request<P>, res: Response) => {
  res.json(await svc.listPatientFinancial(patientIdParam(req)));
}));

router.post("/financial", requirePermission("financial.write"), asyncHandler(async (req: Request<P>, res: Response) => {
  const patientId = patientIdParam(req);
  const body = validateBody(patientFinancialSchema, req.body, res);
  if (!body) return;
  const record = await svc.createPatientFinancial(patientId, body, getCtx(req as AuthRequest));
  res.status(201).json(record);
}));

// ─── Exam Attachments ─────────────────────────────────────────────────────────

router.get("/attachments", requirePermission("medical.read"), asyncHandler(async (req: Request<P>, res: Response) => {
  res.json(await svc.listPatientAttachments(patientIdParam(req)));
}));

router.post("/attachments", requirePermission("medical.write"), asyncHandler(async (req: Request<P>, res: Response) => {
  const patientId = patientIdParam(req);
  const attachment = await svc.createPatientAttachment(patientId, req.body, getCtx(req as AuthRequest));
  res.status(201).json(attachment);
}));

router.delete("/attachments/:attachmentId", requirePermission("medical.write"), asyncHandler(async (req: Request<PAttach>, res: Response) => {
  const patientId = patientIdParam(req as Request<P>);
  const attachmentId = parseInt(req.params.attachmentId);
  await svc.deletePatientAttachment(patientId, attachmentId, getCtx(req as AuthRequest));
  res.json({ success: true });
}));

// ─── Atestados ────────────────────────────────────────────────────────────────

router.get("/atestados", requirePermission("medical.read"), asyncHandler(async (req: Request<P>, res: Response) => {
  res.json(await svc.listPatientAtestados(patientIdParam(req)));
}));

router.post("/atestados", requirePermission("medical.write"), asyncHandler(async (req: Request<P>, res: Response) => {
  const patientId = patientIdParam(req);
  const atestado = await svc.createPatientAtestado(patientId, req.body, getCtx(req as AuthRequest));
  res.status(201).json(atestado);
}));

router.delete("/atestados/:atestadoId", requirePermission("medical.write"), asyncHandler(async (req: Request<PAtestado>, res: Response) => {
  const patientId = patientIdParam(req as Request<P>);
  const atestadoId = parseInt(req.params.atestadoId);
  await svc.deletePatientAtestado(patientId, atestadoId, getCtx(req as AuthRequest));
  res.json({ success: true });
}));

export default router;
