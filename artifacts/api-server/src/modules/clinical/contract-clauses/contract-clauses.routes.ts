/**
 * Sprint Financeiro 11 (P5) — endpoints CRUD de cláusulas contratuais.
 *
 *   GET    /api/clinics/current/contract-clauses           — lista (admin)
 *   POST   /api/clinics/current/contract-clauses           — cria (versiona)
 *   PATCH  /api/clinics/current/contract-clauses/:id       — metadados leves
 *   DELETE /api/clinics/current/contract-clauses/:id       — soft/hard delete
 *
 * Permissão: `settings.manage`.
 */
import { Router } from "express";
import { z } from "zod/v4";
import { authMiddleware, type AuthRequest } from "../../../middleware/auth.js";
import { requirePermission } from "../../../middleware/rbac.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { HttpError } from "../../../utils/httpError.js";
import {
  listClauses,
  createClause,
  updateClause,
  deleteClause,
  seedDefaultClauses,
} from "./contract-clauses.service.js";

const router: Router = Router();
router.use(authMiddleware);

const createSchema = z.object({
  code: z.string().min(2).max(64),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(20000),
  isRequired: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  isRequired: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

router.get(
  "/",
  requirePermission("settings.manage"),
  asyncHandler(async (req: AuthRequest, res) => {
    if (!req.clinicId) throw HttpError.badRequest("Clínica não identificada");
    const includeInactive = req.query.includeInactive === "true";
    const data = await listClauses(req.clinicId, { activeOnly: !includeInactive });
    res.json(data);
  }),
);

router.post(
  "/",
  requirePermission("settings.manage"),
  asyncHandler(async (req: AuthRequest, res) => {
    if (!req.clinicId) throw HttpError.badRequest("Clínica não identificada");
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      throw HttpError.badRequest("Payload inválido", { issues: parsed.error.issues });
    }
    const created = await createClause(req.clinicId, parsed.data);
    res.status(201).json(created);
  }),
);

router.patch(
  "/:id",
  requirePermission("settings.manage"),
  asyncHandler(async (req: AuthRequest, res) => {
    if (!req.clinicId) throw HttpError.badRequest("Clínica não identificada");
    const id = parseInt(String(req.params.id));
    if (!Number.isFinite(id) || id <= 0) throw HttpError.badRequest("id inválido");
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw HttpError.badRequest("Payload inválido", { issues: parsed.error.issues });
    }
    const updated = await updateClause(req.clinicId, id, parsed.data);
    res.json(updated);
  }),
);

router.delete(
  "/:id",
  requirePermission("settings.manage"),
  asyncHandler(async (req: AuthRequest, res) => {
    if (!req.clinicId) throw HttpError.badRequest("Clínica não identificada");
    const id = parseInt(String(req.params.id));
    if (!Number.isFinite(id) || id <= 0) throw HttpError.badRequest("id inválido");
    const result = await deleteClause(req.clinicId, id);
    res.status(200).json(result);
  }),
);

/**
 * POST /api/clinics/current/contract-clauses/seed-defaults
 * — popula a clínica com as 3 cláusulas-padrão (idempotente).
 */
router.post(
  "/seed-defaults",
  requirePermission("settings.manage"),
  asyncHandler(async (req: AuthRequest, res) => {
    if (!req.clinicId) throw HttpError.badRequest("Clínica não identificada");
    const result = await seedDefaultClauses(req.clinicId);
    res.status(201).json(result);
  }),
);

export default router;
