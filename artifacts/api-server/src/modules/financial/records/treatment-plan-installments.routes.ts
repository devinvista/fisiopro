import { Router } from "express";
import { db } from "@workspace/db";
import {
  financialRecordsTable,
  treatmentPlansTable,
  treatmentPlanProceduresTable,
  packagesTable,
  patientsTable,
} from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../../../middleware/auth.js";
import { requirePermission } from "../../../middleware/rbac.js";
import {
  planInstallmentDueDate,
  monthOffsetFromStart,
} from "../../clinical/medical-records/treatment-plans.billing-dates.js";

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

/**
 * Recalcula a `dueDate` das parcelas (faturas mensais) do plano respeitando a
 * regra atual: 1ª parcela vence na próxima ocorrência de `billingDay` em ou
 * após `startDate` do plano; demais parcelas seguem mês a mês a partir daí.
 *
 * Útil para corrigir planos materializados antes da correção do bug, sem
 * precisar dematerializar/materializar (não toca em appointments nem
 * créditos). Pula parcelas já pagas para preservar o histórico financeiro.
 */
router.post(
  "/recalc-due-dates",
  requirePermission("medical.write"),
  async (req: AuthRequest, res) => {
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

      const [plan] = await db
        .select({
          id: treatmentPlansTable.id,
          startDate: treatmentPlansTable.startDate,
        })
        .from(treatmentPlansTable)
        .where(eq(treatmentPlansTable.id, planId))
        .limit(1);

      if (!plan) {
        res.status(404).json({ error: "Not Found", message: "Plano não encontrado" });
        return;
      }
      if (!plan.startDate) {
        res.status(400).json({
          error: "Bad Request",
          message: "Plano sem data de início — preencha o startDate antes de recalcular.",
        });
        return;
      }

      // Mapa { treatmentPlanProcedureId → billingDay } para todos os itens do plano.
      const items = await db
        .select({
          itemId: treatmentPlanProceduresTable.id,
          packageBillingDay: packagesTable.billingDay,
        })
        .from(treatmentPlanProceduresTable)
        .leftJoin(packagesTable, eq(packagesTable.id, treatmentPlanProceduresTable.packageId))
        .where(eq(treatmentPlanProceduresTable.treatmentPlanId, planId));

      const billingDayByItem = new Map<number, number>();
      for (const it of items) {
        billingDayByItem.set(it.itemId, it.packageBillingDay ?? 10);
      }

      // Carrega só as parcelas mensais (faturaPlano) — vendaPacote/avulso ficam de fora.
      const records = await db
        .select({
          id: financialRecordsTable.id,
          dueDate: financialRecordsTable.dueDate,
          planMonthRef: financialRecordsTable.planMonthRef,
          status: financialRecordsTable.status,
          treatmentPlanProcedureId: financialRecordsTable.treatmentPlanProcedureId,
        })
        .from(financialRecordsTable)
        .where(
          and(
            eq(financialRecordsTable.treatmentPlanId, planId),
            eq(financialRecordsTable.transactionType, "faturaPlano"),
          ),
        );

      let updated = 0;
      let alreadyCorrect = 0;
      let skippedPaid = 0;
      let skippedNoRef = 0;
      const updates: Array<{ id: number; from: string | null; to: string }> = [];

      for (const rec of records) {
        if (rec.status === "pago") {
          skippedPaid += 1;
          continue;
        }
        if (!rec.planMonthRef || !rec.treatmentPlanProcedureId) {
          skippedNoRef += 1;
          continue;
        }
        const billingDay = billingDayByItem.get(rec.treatmentPlanProcedureId) ?? 10;

        const [refY, refM] = String(rec.planMonthRef).slice(0, 10).split("-").map(Number);
        const offset = monthOffsetFromStart(plan.startDate, refY, refM);
        if (offset == null) {
          skippedNoRef += 1;
          continue;
        }
        const correctDueDate = planInstallmentDueDate(plan.startDate, billingDay, offset);
        const currentDueDate = rec.dueDate ? String(rec.dueDate).slice(0, 10) : null;

        if (currentDueDate === correctDueDate) {
          alreadyCorrect += 1;
          continue;
        }

        await db
          .update(financialRecordsTable)
          .set({ dueDate: correctDueDate })
          .where(eq(financialRecordsTable.id, rec.id));

        updates.push({ id: rec.id, from: currentDueDate, to: correctDueDate });
        updated += 1;
      }

      res.json({
        planId,
        updated,
        alreadyCorrect,
        skippedPaid,
        skippedNoRef,
        total: records.length,
        updates,
      });
    } catch (err) {
      console.error("[recalc-due-dates]", err);
      res.status(500).json({ error: "Internal Server Error" });
    }
  },
);

export default router;
