import { Router } from "express";
import { db } from "@workspace/db";
import {
  financialRecordsTable,
  treatmentPlansTable,
  patientsTable,
} from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../../../middleware/auth.js";
import { requirePermission } from "../../../middleware/rbac.js";

const router = Router({ mergeParams: true });
router.use(authMiddleware);

async function verifyPlanOwnership(
  planId: number,
  req: AuthRequest,
): Promise<boolean> {
  if (req.isSuperAdmin || !req.clinicId) return true;
  const [row] = await db
    .select({ clinicId: patientsTable.clinicId })
    .from(treatmentPlansTable)
    .innerJoin(patientsTable, eq(treatmentPlansTable.patientId, patientsTable.id))
    .where(eq(treatmentPlansTable.id, planId))
    .limit(1);
  return row?.clinicId === req.clinicId;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

router.get("/", requirePermission("financial.read"), async (req: AuthRequest, res) => {
  try {
    const planId = parseInt(req.params.planId as string);
    if (!planId || isNaN(planId)) {
      res.status(400).json({ error: "Bad Request", message: "planId inválido" });
      return;
    }

    if (!(await verifyPlanOwnership(planId, req))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const items = await db
      .select({
        id: financialRecordsTable.id,
        description: financialRecordsTable.description,
        amount: financialRecordsTable.amount,
        status: financialRecordsTable.status,
        dueDate: financialRecordsTable.dueDate,
        paymentDate: financialRecordsTable.paymentDate,
        paymentMethod: financialRecordsTable.paymentMethod,
        transactionType: financialRecordsTable.transactionType,
        planMonthRef: financialRecordsTable.planMonthRef,
        treatmentPlanProcedureId: financialRecordsTable.treatmentPlanProcedureId,
        category: financialRecordsTable.category,
        type: financialRecordsTable.type,
      })
      .from(financialRecordsTable)
      .where(
        and(
          eq(financialRecordsTable.treatmentPlanId, planId),
          eq(financialRecordsTable.type, "receita"),
        ),
      )
      .orderBy(
        asc(financialRecordsTable.planMonthRef),
        asc(financialRecordsTable.dueDate),
        asc(financialRecordsTable.id),
      );

    const today = todayISO();
    const summary = items.reduce(
      (acc, it) => {
        const amt = Number(it.amount) || 0;
        acc.total += amt;
        acc.countTotal += 1;
        if (it.status === "pago") {
          acc.paid += amt;
          acc.countPaid += 1;
        } else if (it.status === "pendente") {
          acc.pending += amt;
          acc.countPending += 1;
          if (it.dueDate && it.dueDate < today) {
            acc.overdue += amt;
            acc.countOverdue += 1;
          }
        }
        return acc;
      },
      {
        total: 0,
        paid: 0,
        pending: 0,
        overdue: 0,
        countTotal: 0,
        countPaid: 0,
        countPending: 0,
        countOverdue: 0,
      },
    );

    res.json({ items, summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
