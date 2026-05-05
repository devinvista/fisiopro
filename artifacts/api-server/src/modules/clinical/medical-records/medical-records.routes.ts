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
  if (!req.clinicId) return next();
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

// Aceite + materialização atômica (único fluxo suportado).
//
// O paciente configura agenda + cobrança ANTES de assinar. Este endpoint
// substitui o par (POST /accept + POST /materialize) por uma única operação
// com rollback explícito em caso de falha.
//
// Body: { signature, acceptedClauseCodes[], materializeOpts? }
// 400 → validação prévia falhou (faltam horários/agenda em algum item).
// 409 → plano já aceito E materializado (idempotente: devolve estado atual).
router.post(
  "/treatment-plans/:planId/accept-and-materialize",
  requirePermission("medical.write"),
  asyncHandler(async (req: Request<{ patientId: string; planId: string }>, res: Response) => {
    const patientId = patientIdParam(req as Request<P>);
    const planId = parseInt(req.params.planId);
    const body = (req.body ?? {}) as {
      signature?: string;
      acceptedClauseCodes?: unknown;
      materializeOpts?: { force?: boolean; durationMonths?: number; startDate?: string };
    };
    const signature = typeof body.signature === "string" ? body.signature.trim() : "";
    if (!signature) {
      res.status(400).json({
        error: "signature_required",
        message: "Assinatura (nome completo) é obrigatória.",
      });
      return;
    }
    const acceptedClauseCodes = Array.isArray(body.acceptedClauseCodes)
      ? body.acceptedClauseCodes.filter((c): c is string => typeof c === "string")
      : [];
    const ipHeader = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
    const ip = ipHeader || req.ip || null;
    const ua = (req.headers["user-agent"] as string | undefined) ?? null;

    const { acceptAndMaterializePlan } = await import("./treatment-plans.atomic.js");
    const result = await acceptAndMaterializePlan({
      patientId,
      planId,
      ctx: getCtx(req as AuthRequest),
      trail: { signature, ip, device: ua, via: "presencial", acceptedClauseCodes },
      materializeOpts: body.materializeOpts,
    });
    res.json(result);
  }),
);

// Validação pré-aceite: retorna checklist do que falta configurar (agenda,
// horário, cobrança) e as cláusulas ativas da clínica para renderização
// dos checkboxes obrigatórios antes do aceite.
router.get(
  "/treatment-plans/:planId/atomic-validation",
  requirePermission("medical.read"),
  asyncHandler(async (req: Request<{ patientId: string; planId: string }>, res: Response) => {
    const patientId = patientIdParam(req as Request<P>);
    const planId = parseInt(req.params.planId);
    const { validatePlanForAtomicAccept } = await import("./treatment-plans.atomic.js");
    const [validation, clinicId] = await Promise.all([
      validatePlanForAtomicAccept(planId),
      // Cláusulas dependem da clínica do paciente; resolvemos em paralelo.
      (await import("./medical-records.repository.js")).getPatientClinicId(patientId),
    ]);
    let clauses: Array<{
      code: string;
      version: number;
      title: string;
      body: string;
      isRequired: boolean;
    }> = [];
    if (clinicId) {
      const { listClauses } = await import("../contract-clauses/contract-clauses.service.js");
      const active = await listClauses(clinicId, { activeOnly: true });
      clauses = active.map((c) => ({
        code: c.code,
        version: c.version,
        title: c.title,
        body: c.body,
        isRequired: c.isRequired,
      }));
    }
    res.json({ ...validation, clauses });
  }),
);

// Preview da agenda do plano antes do aceite.
// Read-only: enumera as consultas que seriam criadas pela materialização
// sem persistir nada. Usado pelo editor para mostrar o calendário em tempo real.
router.get(
  "/treatment-plans/:planId/preview-appointments",
  requirePermission("medical.read"),
  asyncHandler(async (req: Request<{ patientId: string; planId: string }>, res: Response) => {
    const planId = parseInt(req.params.planId);
    const { enumeratePlanAppointments } = await import("./treatment-plans.preview.js");
    const result = await enumeratePlanAppointments(planId);
    res.json(result);
  }),
);

// Slot holds (TTL padrão 30min). Reserva os horários escolhidos no editor
// de agenda enquanto o paciente caminha para o aceite, impedindo que outro
// plano roube o slot.
//
// POST: cria/renova hold. Body `{ slots: [{itemId,date,startTime,endTime,scheduleId,procedureId}], ttlMinutes? }`.
//   - 200 com `{ ok, planId, slots, expiresAt, ttlSecondsRemaining }`.
//   - 409 com `{ issues: { code:"slot_conflict", conflicts:[...] } }` se
//     algum slot já está ocupado por appointment ou hold de outro plano.
//   - 400 se algum slot é mal-formado ou item não pertence ao plano.
//   - 404 se planId não pertence ao patientId da rota.
//
// DELETE: libera o hold. Idempotente (204 mesmo sem hold ativo).
//   - 404 se planId não pertence ao patientId da rota.
//
// GET: status atual `{ slots, expiresAt, ttlSecondsRemaining }`. Slots
//   vazios quando inexistente OU expirado.
//   - 404 se planId não pertence ao patientId da rota.
router.post(
  "/treatment-plans/:planId/holds",
  requirePermission("medical.write"),
  asyncHandler(async (req: Request<{ patientId: string; planId: string }>, res: Response) => {
    const patientId = patientIdParam(req as Request<P>);
    const planId = parseInt(req.params.planId);
    if (!Number.isFinite(planId) || planId <= 0) throw HttpError.badRequest("planId inválido");
    // Garante que o plano pertence ao paciente (throws 404 se não for).
    await svc.getPatientTreatmentPlan(patientId, planId);
    const body = (req.body ?? {}) as { slots?: unknown; ttlMinutes?: unknown };
    const { createOrRenewHolds } = await import("./slot-holds.service.js");
    const result = await createOrRenewHolds(
      planId,
      Array.isArray(body.slots) ? body.slots : [],
      Number(body.ttlMinutes) || undefined,
    );
    res.json(result);
  }),
);

router.delete(
  "/treatment-plans/:planId/holds",
  requirePermission("medical.write"),
  asyncHandler(async (req: Request<{ patientId: string; planId: string }>, res: Response) => {
    const patientId = patientIdParam(req as Request<P>);
    const planId = parseInt(req.params.planId);
    if (!Number.isFinite(planId) || planId <= 0) throw HttpError.badRequest("planId inválido");
    // Garante que o plano pertence ao paciente (throws 404 se não for).
    await svc.getPatientTreatmentPlan(patientId, planId);
    const { releaseHolds } = await import("./slot-holds.service.js");
    await releaseHolds(planId);
    res.status(204).end();
  }),
);

router.get(
  "/treatment-plans/:planId/holds",
  requirePermission("medical.read"),
  asyncHandler(async (req: Request<{ patientId: string; planId: string }>, res: Response) => {
    const patientId = patientIdParam(req as Request<P>);
    const planId = parseInt(req.params.planId);
    if (!Number.isFinite(planId) || planId <= 0) throw HttpError.badRequest("planId inválido");
    // Garante que o plano pertence ao paciente (throws 404 se não for).
    await svc.getPatientTreatmentPlan(patientId, planId);
    const { getHolds } = await import("./slot-holds.service.js");
    res.json(await getHolds(planId));
  }),
);

// Gera (ou reaproveita) um link público de aceite, válido por 7 dias.
// Retorna a URL absoluta (montada com APP_PUBLIC_URL ou Origin do request).
router.post(
  "/treatment-plans/:planId/public-link",
  requirePermission("medical.write"),
  asyncHandler(async (req: Request<{ patientId: string; planId: string }>, res: Response) => {
    const patientId = patientIdParam(req as Request<P>);
    const planId = parseInt(req.params.planId);
    const ctx = getCtx(req as AuthRequest);
    const { generatePublicAcceptanceLink } = await import("./treatment-plans.tokens.js");
    const baseUrl =
      (process.env.APP_PUBLIC_URL as string | undefined) ||
      (req.headers.origin as string | undefined) ||
      "";
    const result = await generatePublicAcceptanceLink({
      planId,
      patientId,
      createdBy: ctx.userId ?? null,
      baseUrl,
    });
    res.json(result);
  }),
);

// Renegociação de plano aceito: cria nova versão (parent_plan_id), clona
// procedimentos, encerra o anterior.
// Body opcional: campos top-level a sobrescrever (frequency, estimatedSessions, startDate, etc).
router.post(
  "/treatment-plans/:planId/renegotiate",
  requirePermission("medical.write"),
  asyncHandler(async (req: Request<{ patientId: string; planId: string }>, res: Response) => {
    const patientId = patientIdParam(req as Request<P>);
    const planId = parseInt(req.params.planId);
    const body = validateBody(updateTreatmentPlanSchema, req.body ?? {}, res);
    if (!body) return;
    const result = await svc.renegotiatePatientTreatmentPlan(
      patientId,
      planId,
      body,
      getCtx(req as AuthRequest),
    );
    res.status(201).json(result);
  }),
);

// ─── Materialização do plano ─────────────────────────────────────────────────
// Os endpoints POST/DELETE `/treatment-plans/:planId/materialize` agora vivem
// em `treatment-plans-materialize.routes.ts`, montados em
// `/api/treatment-plans/:planId/materialize` (sem o prefixo `/patients/:id`),
// alinhando com o caminho usado pelo frontend e pelos demais endpoints de
// `/treatment-plans/:planId`.

// Recalcula `endTime` dos agendamentos futuros materializados pelo plano,
// usando a duração correta (override do item > duração do procedimento > 60).
// Pula agendamentos finalizados (concluido/presenca/faltou/cancelado/remarcado)
// para não reescrever histórico.
router.post(
  "/treatment-plans/:planId/recalc-appointment-durations",
  requirePermission("medical.write"),
  asyncHandler(async (req: Request<{ patientId: string; planId: string }>, res: Response) => {
    const planId = parseInt(req.params.planId);
    if (!planId || isNaN(planId)) {
      throw new HttpError(400, "planId inválido");
    }
    const { recalcPlanAppointmentDurations } = await import("./treatment-plans.recalc-durations.js");
    const result = await recalcPlanAppointmentDurations(planId, req);
    res.json(result);
  }),
);

// Fechamento mensal de itens avulsos do plano.
// Body opcional `{ ref: 'YYYY-MM' }`; querystring `?ref=YYYY-MM`; padrão: mês atual.
router.post(
  "/treatment-plans/:planId/close-month",
  requirePermission("medical.write"),
  asyncHandler(async (req: Request<{ patientId: string; planId: string }>, res: Response) => {
    const planId = parseInt(req.params.planId);
    const ref =
      (req.query.ref as string | undefined) ??
      ((req.body ?? {}) as { ref?: string }).ref ??
      new Date().toISOString().slice(0, 7);
    const { closeAvulsoMonth } = await import("./treatment-plans.close-month.js");
    const result = await closeAvulsoMonth(planId, ref);
    res.status(result.alreadyClosed ? 200 : 201).json(result);
  }),
);

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
