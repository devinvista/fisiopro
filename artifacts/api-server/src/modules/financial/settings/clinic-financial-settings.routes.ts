/**
 * GET / PUT  /api/clinics/current/financial-settings   (Sprint 2 — T5)
 *
 * Permissão: `settings.manage` (mesma da edição de clínica).
 * Feature gate: `financial.view.budget` — porque essas configurações alimentam
 * principalmente o "Orçado vs Realizado" e o fluxo de caixa projetado, ambos
 * exclusivos de planos profissional+.
 */
import { Router } from "express";
import { updateClinicFinancialSettingsSchema } from "@workspace/db";
import { authMiddleware, type AuthRequest } from "../../../middleware/auth.js";
import { requirePermission } from "../../../middleware/rbac.js";
import { requireFeature } from "../../../middleware/plan-features.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { HttpError } from "../../../utils/httpError.js";
import {
  getClinicFinancialSettings,
  upsertClinicFinancialSettings,
} from "./clinic-financial-settings.service.js";

const router: Router = Router();
router.use(authMiddleware);
router.use(requireFeature("financial.view.budget"));

router.get("/", requirePermission("settings.manage"), asyncHandler(async (req: AuthRequest, res) => {
  if (!req.clinicId) throw HttpError.badRequest("Clínica não identificada");
  const data = await getClinicFinancialSettings(req.clinicId);
  res.json(data);
}));

router.put("/", requirePermission("settings.manage"), asyncHandler(async (req: AuthRequest, res) => {
  if (!req.clinicId) throw HttpError.badRequest("Clínica não identificada");
  const parsed = updateClinicFinancialSettingsSchema.safeParse(req.body);
  if (!parsed.success) throw HttpError.badRequest("Payload inválido", { issues: parsed.error.issues });
  const data = await upsertClinicFinancialSettings(req.clinicId, parsed.data);
  res.json(data);
}));

export default router;
