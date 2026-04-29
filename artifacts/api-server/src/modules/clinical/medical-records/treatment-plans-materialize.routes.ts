import { Router, type Request, type Response } from "express";
import { authMiddleware } from "../../../middleware/auth.js";
import { requirePermission } from "../../../middleware/rbac.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";

const router = Router({ mergeParams: true });
router.use(authMiddleware);

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

export default router;
