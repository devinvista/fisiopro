import { Router } from "express";
import { db } from "@workspace/db";
import { auditLogTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { authMiddleware } from "../../../middleware/auth.js";
import { requireSuperAdmin } from "../../../middleware/rbac.js";
import { requireFeature } from "../../../middleware/plan-features.js";

const router = Router();
router.use(authMiddleware);
router.use(requireFeature("module.audit_log"));

router.get("/patients/:patientId", requireSuperAdmin(), async (req, res) => {
  try {
    const patientId = parseInt(req.params.patientId as string);
    const logs = await db
      .select()
      .from(auditLogTable)
      .where(eq(auditLogTable.patientId, patientId))
      .orderBy(desc(auditLogTable.createdAt))
      .limit(200);
    res.json(logs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
