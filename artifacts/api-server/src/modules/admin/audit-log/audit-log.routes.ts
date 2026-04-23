import { Router } from "express";
import { db } from "@workspace/db";
import { auditLogTable } from "@workspace/db";
import { eq, desc, and, lt, or } from "drizzle-orm";
import { authMiddleware } from "../../../middleware/auth.js";
import { requireSuperAdmin } from "../../../middleware/rbac.js";
import { requireFeature } from "../../../middleware/plan-features.js";
import { parseIntParam, validateQuery } from "../../../utils/validate.js";
import { listQuerySchema } from "../../../utils/listQuery.js";
import { buildPage, clampLimit, decodeCursor } from "../../../utils/pagination.js";

const router = Router();
router.use(authMiddleware);
router.use(requireFeature("module.audit_log"));

router.get("/patients/:patientId", requireSuperAdmin(), async (req, res) => {
  try {
    const patientId = parseIntParam(req.params.patientId, res, "ID do paciente");
    if (patientId === null) return;

    const q = validateQuery(listQuerySchema, req.query, res);
    if (!q) return;

    const limit = clampLimit(q.limit);
    const cursor = decodeCursor(q.cursor);

    const cursorCondition = cursor
      ? or(
          lt(auditLogTable.createdAt, new Date(cursor.v as string)),
          and(
            eq(auditLogTable.createdAt, new Date(cursor.v as string)),
            lt(auditLogTable.id, cursor.id),
          ),
        )
      : undefined;

    const where = and(
      eq(auditLogTable.patientId, patientId),
      ...(cursorCondition ? [cursorCondition] : []),
    );

    const rows = await db
      .select()
      .from(auditLogTable)
      .where(where)
      .orderBy(desc(auditLogTable.createdAt), desc(auditLogTable.id))
      .limit(limit + 1);

    res.json(
      buildPage(rows, limit, (row) => ({ v: row.createdAt!.toISOString(), id: row.id })),
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
