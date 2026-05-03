import { Router, type Request, type Response } from "express";
import { authMiddleware } from "../../../middleware/auth.js";
import { requirePermission } from "../../../middleware/rbac.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";

const router = Router({ mergeParams: true });
router.use(authMiddleware);

// Rota de reparo: materializar/desmaterializar plano já aceito.
//
// Para o fluxo normal de aceite, usar:
//   POST /api/patients/:patientId/treatment-plans/:planId/accept-and-materialize
// que orquestra aceite + materialização atomicamente em uma única transação.
//
// Este endpoint é a **ferramenta de reparo** quando a materialização
// anterior falhou e precisa ser re-executada sem refazer o aceite
// (ex.: bug corrigido em produção, ajuste de horários pós-aceite, etc.).
// O caso de uso "materializar sem aceitar" é legítimo e permanece suportado.
router.post(
  "/materialize",
  requirePermission("medical.write"),
  asyncHandler(async (req: Request<{ planId: string }>, res: Response) => {
    const planId = parseInt(req.params.planId);
    const { force, durationMonths, startDate } = (req.body ?? {}) as {
      force?: boolean;
      durationMonths?: number;
      startDate?: string;
    };
    const { materializeTreatmentPlan } = await import("./treatment-plans.materialization.js");
    const result = await materializeTreatmentPlan(planId, { force, durationMonths, startDate });
    res.json(result);
  }),
);

router.delete(
  "/materialize",
  requirePermission("medical.write"),
  asyncHandler(async (req: Request<{ planId: string }>, res: Response) => {
    const planId = parseInt(req.params.planId);
    const { dematerializeTreatmentPlan } = await import("./treatment-plans.materialization.js");
    const result = await dematerializeTreatmentPlan(planId);
    res.json(result);
  }),
);

// Sprint Financeiro 12 (P3) — Cancela um plano vigente, estornando os
// `deferred_receivable` das faturas mensais futuras ainda não consumidas.
// Faturas já pagas/parcialmente pagas ficam de fora (ressarcimento manual).
router.post(
  "/cancel",
  requirePermission("medical.write"),
  asyncHandler(async (req: Request<{ planId: string }>, res: Response) => {
    const planId = parseInt(req.params.planId);
    const body = (req.body ?? {}) as { reason?: string; recalculate?: boolean };
    const { reason, recalculate } = body;
    if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
      res
        .status(400)
        .json({ error: "Motivo do cancelamento é obrigatório (mínimo 3 caracteres)." });
      return;
    }
    const userId = (req as any).user?.id ?? null;
    const { cancelTreatmentPlan } = await import("./treatment-plans.cancel.js");
    const result = await cancelTreatmentPlan({
      planId,
      reason: reason.trim(),
      cancelledBy: userId,
      // Sprint Financeiro 13 (P4): recálculo de diferença de preço.
      recalculate: recalculate === true,
    });
    res.json(result);
  }),
);

export default router;
