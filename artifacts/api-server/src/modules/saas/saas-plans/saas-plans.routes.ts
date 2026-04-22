import { Router, type Response } from "express";
import { authMiddleware, type AuthRequest } from "../../../middleware/auth.js";
import { requireSuperAdmin } from "../../../middleware/rbac.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { validateBody } from "../../../utils/validate.js";
import { runSubscriptionCheck } from "../subscriptions/subscription.service.js";
import {
  planSchema,
  subscriptionSchema,
  updateSubscriptionSchema,
  paymentSchema,
} from "./saas-plans.schemas.js";
import * as svc from "./saas-plans.service.js";

const router = Router();
router.use(authMiddleware);

// ─── Plans CRUD (superadmin only) ────────────────────────────────────────────

router.get("/plans", requireSuperAdmin(), asyncHandler(async (_req, res: Response) => {
  res.json(await svc.listAllPlans());
}));

router.post("/plans/seed-defaults", requireSuperAdmin(), asyncHandler(async (_req, res: Response) => {
  const results = await svc.seedDefaultPlans();
  res.json({ ok: true, results });
}));

router.get("/plans/stats", requireSuperAdmin(), asyncHandler(async (_req, res: Response) => {
  res.json(await svc.getPlanStats());
}));

router.get("/plans/public", asyncHandler(async (_req, res: Response) => {
  res.json(await svc.listPublicPlans());
}));

router.post("/plans", requireSuperAdmin(), asyncHandler(async (req, res: Response) => {
  const body = validateBody(planSchema, req.body, res);
  if (!body) return;
  const plan = await svc.createSaasPlan(body);
  res.status(201).json(plan);
}));

router.put("/plans/:id", requireSuperAdmin(), asyncHandler(async (req, res: Response) => {
  const id = Number(req.params.id);
  const body = validateBody(planSchema.partial(), req.body, res);
  if (!body) return;
  const plan = await svc.updateSaasPlan(id, body);
  res.json(plan);
}));

router.delete("/plans/:id", requireSuperAdmin(), asyncHandler(async (req, res: Response) => {
  await svc.deleteSaasPlan(Number(req.params.id));
  res.status(204).send();
}));

// ─── Clinic Subscriptions (superadmin only) ───────────────────────────────────

router.get("/clinic-subscriptions", requireSuperAdmin(), asyncHandler(async (_req, res: Response) => {
  res.json(await svc.listAllSubscriptions());
}));

router.post("/clinic-subscriptions", requireSuperAdmin(), asyncHandler(async (req, res: Response) => {
  const body = validateBody(subscriptionSchema, req.body, res);
  if (!body) return;
  const sub = await svc.createClinicSubscription(body);
  res.status(201).json(sub);
}));

router.patch("/clinic-subscriptions/:id", requireSuperAdmin(), asyncHandler(async (req, res: Response) => {
  const id = Number(req.params.id);
  const body = validateBody(updateSubscriptionSchema, req.body, res);
  if (!body) return;
  const sub = await svc.updateClinicSubscription(id, body);
  res.json(sub);
}));

// ─── Current clinic subscription (any authenticated user) ─────────────────────

router.get("/clinic-subscriptions/mine", asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await svc.getMineSubscription(req.clinicId ?? null));
}));

router.get("/clinic-subscriptions/mine/limits", asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await svc.getMineLimits(req.clinicId ?? null));
}));

// ─── Manual subscription check (superadmin) ──────────────────────────────────

router.post("/clinic-subscriptions/run-check", requireSuperAdmin(), asyncHandler(async (_req, res: Response) => {
  res.json(await runSubscriptionCheck());
}));

// ─── All clinics (superadmin) — para aba Clínicas ────────────────────────────

router.get("/admin/clinics", requireSuperAdmin(), asyncHandler(async (_req, res: Response) => {
  res.json(await svc.listAdminClinics());
}));

// ─── Payment History (superadmin) ─────────────────────────────────────────────

router.get("/payment-history", requireSuperAdmin(), asyncHandler(async (_req, res: Response) => {
  res.json(await svc.listAllPaymentHistory());
}));

router.get("/payment-history/clinic/:clinicId", requireSuperAdmin(), asyncHandler(async (req, res: Response) => {
  res.json(await svc.listClinicPaymentHistory(Number(req.params.clinicId)));
}));

router.post("/payment-history", requireSuperAdmin(), asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = validateBody(paymentSchema, req.body, res);
  if (!body) return;
  const payment = await svc.createPayment(body, req.userId ?? null);
  res.status(201).json(payment);
}));

router.delete("/payment-history/:id", requireSuperAdmin(), asyncHandler(async (req, res: Response) => {
  await svc.deletePayment(Number(req.params.id));
  res.status(204).send();
}));

router.get("/payment-history/stats", requireSuperAdmin(), asyncHandler(async (_req, res: Response) => {
  res.json(await svc.getPaymentHistoryStats());
}));

export default router;
