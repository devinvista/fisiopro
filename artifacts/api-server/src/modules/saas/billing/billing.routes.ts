import { Router, type Response } from "express";
import { authMiddleware, type AuthRequest } from "../../../middleware/auth.js";
import { requireSuperAdmin } from "../../../middleware/rbac.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { validateBody } from "../../../utils/validate.js";
import { HttpError } from "../../../utils/httpError.js";
import * as svc from "./billing.service.js";
import { subscribeSchema } from "./billing.schemas.js";

const router = Router();
router.use(authMiddleware);

// ─── Mine (clinic admin) ─────────────────────────────────────────────────────

router.get(
  "/saas-billing/mine",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.clinicId) throw HttpError.badRequest("Clínica não associada ao usuário");
    res.json(await svc.getBillingStatus(req.clinicId));
  }),
);

router.post(
  "/saas-billing/subscribe",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.clinicId) throw HttpError.badRequest("Clínica não associada ao usuário");
    const body = validateBody(subscribeSchema, req.body, res);
    if (!body) return;
    const result = await svc.subscribeWithAsaas(req.clinicId, body.planId);
    res.status(201).json(result);
  }),
);

router.post(
  "/saas-billing/cancel",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.clinicId) throw HttpError.badRequest("Clínica não associada ao usuário");
    await svc.cancelAsaasSubscription(req.clinicId);
    res.status(204).send();
  }),
);

// ─── Superadmin: delinquency + Asaas-managed ─────────────────────────────────

router.get(
  "/saas-billing/delinquent",
  requireSuperAdmin(),
  asyncHandler(async (_req, res: Response) => {
    res.json(await svc.listDelinquent());
  }),
);

router.get(
  "/saas-billing/managed",
  requireSuperAdmin(),
  asyncHandler(async (_req, res: Response) => {
    res.json(await svc.listAsaasManaged());
  }),
);

router.post(
  "/saas-billing/clinic-subscriptions/:clinicId/remind",
  requireSuperAdmin(),
  asyncHandler(async (req, res: Response) => {
    const clinicId = Number(req.params.clinicId);
    if (!clinicId) throw HttpError.badRequest("clinicId inválido");
    await svc.sendDunningReminder(clinicId);
    res.status(204).send();
  }),
);

router.post(
  "/saas-billing/clinic-subscriptions/:clinicId/cancel",
  requireSuperAdmin(),
  asyncHandler(async (req, res: Response) => {
    const clinicId = Number(req.params.clinicId);
    if (!clinicId) throw HttpError.badRequest("clinicId inválido");
    await svc.cancelAsaasSubscription(clinicId);
    res.status(204).send();
  }),
);

router.get(
  "/saas-billing/webhook-events",
  requireSuperAdmin(),
  asyncHandler(async (_req, res: Response) => {
    res.json(await svc.listRecentWebhookEvents(100));
  }),
);

export default router;
