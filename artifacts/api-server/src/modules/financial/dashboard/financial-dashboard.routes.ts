import { Router } from "express";
import { db } from "@workspace/db";
import {
  appointmentsTable, financialRecordsTable, proceduresTable,
  treatmentPlansTable, treatmentPlanProceduresTable, packagesTable,
} from "@workspace/db";
import { eq, and, or, sql, gte, lte, inArray, isNotNull } from "drizzle-orm";
import type { AuthRequest } from "../../../middleware/auth.js";
import { requirePermission } from "../../../middleware/rbac.js";
import { nowBRT } from "../../../utils/dateUtils.js";
import {
  ACCOUNT_CODES,
  getAccountingBalances,
  getAccountingTotals,
} from "../../shared/accounting/accounting.service.js";
import {
  RECEIVABLE_TYPES,
  monthDateRange,
  recordDateFilter,
  revenueSummarySql,
} from "../shared/financial-reports.service.js";
import { apptClinicCond, clinicCond } from "../financial.repository.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";

const router = Router();

router.get("/dashboard", requirePermission("financial.read"), asyncHandler(async (req: AuthRequest, res) => {
    const brt = nowBRT();
    const month = parseInt(req.query.month as string) || brt.month;
    const year = parseInt(req.query.year as string) || brt.year;

    const { startDate, endDate } = monthDateRange(year, month);

    const cc = clinicCond(req);
    const ac = apptClinicCond(req);

    const accountingTotals = await getAccountingTotals({
      clinicId: req.isSuperAdmin ? null : req.clinicId,
      startDate,
      endDate,
    });
    const accountingBalances = await getAccountingBalances({
      clinicId: req.isSuperAdmin ? null : req.clinicId,
    });
    const totalByCode = new Map(accountingTotals.map((row) => [row.code, { debit: Number(row.debit), credit: Number(row.credit) }]));
    const balanceByCode = new Map(accountingBalances.map((row) => [row.code, { debit: Number(row.debit), credit: Number(row.credit) }]));

    const monthlyRevenue =
      (totalByCode.get(ACCOUNT_CODES.serviceRevenue)?.credit ?? 0) +
      (totalByCode.get(ACCOUNT_CODES.packageRevenue)?.credit ?? 0);
    const monthlyExpenses =
      (totalByCode.get(ACCOUNT_CODES.operatingExpenses)?.debit ?? 0) +
      (totalByCode.get(ACCOUNT_CODES.revenueReversals)?.debit ?? 0);
    const cashReceived = totalByCode.get(ACCOUNT_CODES.cash)?.debit ?? 0;
    const accountsReceivable = (balanceByCode.get(ACCOUNT_CODES.receivables)?.debit ?? 0) - (balanceByCode.get(ACCOUNT_CODES.receivables)?.credit ?? 0);
    const customerAdvances = (balanceByCode.get(ACCOUNT_CODES.customerAdvances)?.credit ?? 0) - (balanceByCode.get(ACCOUNT_CODES.customerAdvances)?.debit ?? 0);

    const completedAppts = await db
      .select({ count: sql<number>`count(*)` })
      .from(appointmentsTable)
      .where(
        ac
          ? and(ac, eq(appointmentsTable.status, "concluido"), gte(appointmentsTable.date, startDate), lte(appointmentsTable.date, endDate))
          : and(eq(appointmentsTable.status, "concluido"), gte(appointmentsTable.date, startDate), lte(appointmentsTable.date, endDate))
      );

    const totalAppts = await db
      .select({ count: sql<number>`count(*)` })
      .from(appointmentsTable)
      .where(
        ac
          ? and(ac, gte(appointmentsTable.date, startDate), lte(appointmentsTable.date, endDate))
          : and(gte(appointmentsTable.date, startDate), lte(appointmentsTable.date, endDate))
      );

    const completedCount = Number(completedAppts[0]?.count ?? 0);
    const averageTicket = completedCount > 0 ? monthlyRevenue / completedCount : 0;

    const categoryRevenue = await db
      .select({
        category: proceduresTable.category,
        revenue: sql<number>`COALESCE(SUM(${financialRecordsTable.amount}::numeric), 0)`,
      })
      .from(financialRecordsTable)
      .leftJoin(proceduresTable, eq(financialRecordsTable.procedureId, proceduresTable.id))
      .where(
        cc
          ? and(cc, revenueSummarySql(), recordDateFilter(startDate, endDate))
          : and(revenueSummarySql(), recordDateFilter(startDate, endDate))
      )
      .groupBy(proceduresTable.category);

    const topProc = await db
      .select({
        name: proceduresTable.name,
        total: sql<number>`COALESCE(SUM(${financialRecordsTable.amount}::numeric), 0)`,
      })
      .from(financialRecordsTable)
      .leftJoin(proceduresTable, eq(financialRecordsTable.procedureId, proceduresTable.id))
      .where(
        cc
          ? and(cc, revenueSummarySql(), recordDateFilter(startDate, endDate))
          : and(revenueSummarySql(), recordDateFilter(startDate, endDate))
      )
      .groupBy(proceduresTable.name)
      .orderBy(sql`COALESCE(SUM(${financialRecordsTable.amount}::numeric), 0) DESC`)
      .limit(1);

    // MRR — soma das mensalidades dos itens recorrentes em planos vigente+aceito
    // (Sprint 5+): fonte oficial é treatment_plan_procedures.kind='recorrenteMensal'.
    // Para itens legados sem `kind` preenchido, derivamos via packages.package_type
    // ('mensal' ou 'faturaConsolidada' — descontinuado, ainda existe em dados antigos).
    const isRecurringItem = or(
      eq(treatmentPlanProceduresTable.kind, "recorrenteMensal"),
      and(
        sql`${treatmentPlanProceduresTable.kind} IS NULL`,
        inArray(packagesTable.packageType, ["mensal", "faturaConsolidada"]),
      ),
    );
    const planActiveCond = and(
      isNotNull(treatmentPlansTable.acceptedAt),
      inArray(treatmentPlansTable.status, ["vigente", "ativo"]),
    );
    const planClinicCond = req.isSuperAdmin || !req.clinicId
      ? planActiveCond
      : and(planActiveCond, eq(treatmentPlansTable.clinicId, req.clinicId!));

    const recurringItems = await db
      .select({
        count: sql<number>`count(*)`,
        mrr: sql<number>`COALESCE(SUM(COALESCE(${treatmentPlanProceduresTable.unitMonthlyPrice}, ${packagesTable.monthlyPrice}, ${treatmentPlanProceduresTable.unitPrice})::numeric), 0)`,
      })
      .from(treatmentPlanProceduresTable)
      .innerJoin(treatmentPlansTable, eq(treatmentPlansTable.id, treatmentPlanProceduresTable.treatmentPlanId))
      .leftJoin(packagesTable, eq(packagesTable.id, treatmentPlanProceduresTable.packageId))
      .where(and(planClinicCond, isRecurringItem));

    const mrr = Number(recurringItems[0]?.mrr ?? 0);
    const activeRecurringCount = Number(recurringItems[0]?.count ?? 0);

    // Cobranças mensais pendentes do plano (faturaPlano) — substitui o antigo
    // filtro por subscriptionId (pré-Sprint 1, agora vazio na maioria das clínicas).
    const RECURRING_BILLING_TYPES = ["faturaPlano", "faturaConsolidada"] as const;
    const pendingRecurringWhere = cc
      ? and(cc, eq(financialRecordsTable.status, "pendente"), inArray(financialRecordsTable.transactionType, RECURRING_BILLING_TYPES as unknown as string[]))
      : and(eq(financialRecordsTable.status, "pendente"), inArray(financialRecordsTable.transactionType, RECURRING_BILLING_TYPES as unknown as string[]));

    const pendingRecurringRecords = await db
      .select({
        count: sql<number>`count(*)`,
        total: sql<number>`COALESCE(SUM(${financialRecordsTable.amount}::numeric), 0)`,
      })
      .from(financialRecordsTable)
      .where(pendingRecurringWhere);

    res.json({
      monthlyRevenue,
      recognizedRevenue: monthlyRevenue,
      cashReceived,
      accountsReceivable,
      customerAdvances,
      monthlyExpenses,
      monthlyProfit: monthlyRevenue - monthlyExpenses,
      averageTicket,
      totalAppointments: Number(totalAppts[0]?.count ?? 0),
      completedAppointments: completedCount,
      topProcedure: topProc[0]?.name ?? null,
      revenueByCategory: categoryRevenue.map((c) => ({
        category: c.category ?? "outros",
        revenue: Number(c.revenue),
      })),
      mrr,
      // Sprint 5: "activeSubscriptions" é mantido no payload para compat com a
      // UI atual (chips em LancamentosTab), mas representa itens recorrentes do
      // plano de tratamento (kind='recorrenteMensal').
      activeSubscriptions: activeRecurringCount,
      pendingSubscriptionCharges: {
        count: Number(pendingRecurringRecords[0]?.count ?? 0),
        total: Number(pendingRecurringRecords[0]?.total ?? 0),
      },
    });
}));

export default router;
