import { Router } from "express";
import type { Role } from "@workspace/db";
import { authMiddleware, AuthRequest } from "../../../middleware/auth.js";
import { requirePermission } from "../../../middleware/rbac.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { validateBody } from "../../../utils/validate.js";
import {
  createProcedureSchema,
  updateProcedureSchema,
  updateProcedureCostsSchema,
} from "./procedures.schemas.js";
import * as svc from "./procedures.service.js";

// Re-export por compatibilidade — alguns módulos podem importar daqui.
export { getEffectiveProcedurePrice } from "./procedures.service.js";

const router = Router();
router.use(authMiddleware);

function scopeOf(req: AuthRequest) {
  const isAdmin = req.isSuperAdmin || (req.userRoles ?? []).includes("admin" as Role);
  return {
    clinicId: req.clinicId ?? null,
    isSuperAdmin: !!req.isSuperAdmin,
    isAdmin,
  };
}

// ─── GET / (list) ─────────────────────────────────────────────────────────────
router.get(
  "/",
  requirePermission("procedures.manage"),
  asyncHandler(async (req: AuthRequest, res) => {
    const procedures = await svc.listProcedures(scopeOf(req), {
      category: (req.query.category as string | undefined) || undefined,
      includeInactive: req.query.includeInactive === "true",
    });
    res.json(procedures);
  })
);

// ─── POST / (create) ──────────────────────────────────────────────────────────
router.post(
  "/",
  requirePermission("procedures.manage"),
  asyncHandler(async (req: AuthRequest, res) => {
    const body = validateBody(createProcedureSchema, req.body, res);
    if (!body) return;
    const procedure = await svc.createProcedure(scopeOf(req), body);
    res.status(201).json(procedure);
  })
);

// ─── GET /overhead-analysis ───────────────────────────────────────────────────
// MUST be registered before any /:id route to avoid being matched as :id.
router.get(
  "/overhead-analysis",
  requirePermission("procedures.manage"),
  asyncHandler(async (req: AuthRequest, res) => {
    const result = await svc.overheadAnalysis(scopeOf(req), {
      month: parseInt(req.query.month as string) || undefined,
      year: parseInt(req.query.year as string) || undefined,
      procedureId: req.query.procedureId
        ? parseInt(req.query.procedureId as string)
        : null,
    });
    res.json(result);
  })
);

// ─── PUT /:id ─────────────────────────────────────────────────────────────────
router.put(
  "/:id",
  requirePermission("procedures.manage"),
  asyncHandler(async (req: AuthRequest, res) => {
    const id = parseInt(req.params.id as string);
    const body = validateBody(updateProcedureSchema, req.body, res);
    if (!body) return;
    const procedure = await svc.updateProcedure(scopeOf(req), id, body);
    res.json(procedure);
  })
);

// ─── GET /:id/costs ──────────────────────────────────────────────────────────
router.get(
  "/:id/costs",
  requirePermission("procedures.manage"),
  asyncHandler(async (req: AuthRequest, res) => {
    const id = parseInt(req.params.id as string);
    const costs = await svc.getProcedureCosts(scopeOf(req), id);
    res.json(costs);
  })
);

// ─── PUT /:id/costs ──────────────────────────────────────────────────────────
router.put(
  "/:id/costs",
  requirePermission("procedures.manage"),
  asyncHandler(async (req: AuthRequest, res) => {
    const id = parseInt(req.params.id as string);
    const body = validateBody(updateProcedureCostsSchema, req.body, res);
    if (!body) return;
    const result = await svc.upsertProcedureCosts(scopeOf(req), id, body);
    res.json(result);
  })
);

// ─── DELETE /:id/costs ───────────────────────────────────────────────────────
router.delete(
  "/:id/costs",
  requirePermission("procedures.manage"),
  asyncHandler(async (req: AuthRequest, res) => {
    const id = parseInt(req.params.id as string);
    await svc.deleteProcedureCosts(scopeOf(req), id);
    res.status(204).send();
  })
);

// ─── PATCH /:id/toggle-active ─────────────────────────────────────────────────
router.patch(
  "/:id/toggle-active",
  requirePermission("procedures.manage"),
  asyncHandler(async (req: AuthRequest, res) => {
    const id = parseInt(req.params.id as string);
    const updated = await svc.toggleProcedureActive(scopeOf(req), id);
    res.json(updated);
  })
);

// ─── DELETE /:id ─────────────────────────────────────────────────────────────
router.delete(
  "/:id",
  requirePermission("procedures.manage"),
  asyncHandler(async (req: AuthRequest, res) => {
    const id = parseInt(req.params.id as string);
    await svc.deleteProcedure(scopeOf(req), id);
    res.status(204).send();
  })
);

export default router;
