/**
 * Sprint 3 — Endpoints de extrato de créditos do paciente.
 */
import { Router } from "express";
import type { Request, Response } from "express";
import { requirePermission } from "../../../middleware/rbac.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { getPatientCreditsStatement } from "./session-credits.service.js";

const router = Router({ mergeParams: true });

router.get(
  "/patients/:patientId/session-credits/statement",
  requirePermission("medical.read"),
  asyncHandler(async (req: Request<{ patientId: string }>, res: Response) => {
    const patientId = parseInt(req.params.patientId, 10);
    if (Number.isNaN(patientId)) {
      res.status(400).json({ error: "patientId inválido" });
      return;
    }
    const rows = await getPatientCreditsStatement(patientId);
    res.json(rows);
  }),
);

export default router;
