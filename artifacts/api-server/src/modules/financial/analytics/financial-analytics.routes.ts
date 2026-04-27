import { Router } from "express";
import { db } from "@workspace/db";
import {
  appointmentsTable, financialRecordsTable, proceduresTable, patientSubscriptionsTable,
  procedureCostsTable, schedulesTable, recurringExpensesTable,
} from "@workspace/db";
import { eq, and, sql, gte, lte, inArray, isNull, or, count } from "drizzle-orm";
import type { AuthRequest } from "../../../middleware/auth.js";
import { requirePermission } from "../../../middleware/rbac.js";
import { requireFeature } from "../../../middleware/plan-features.js";
import { getClinicFinancialSettings } from "../settings/clinic-financial-settings.service.js";
import { monthDateRangeBRT, nowBRT } from "../../../utils/dateUtils.js";
import {
  ACCOUNT_CODES,
  getAccountingTotals,
} from "../../shared/accounting/accounting.service.js";
import {
  RECEIVABLE_TYPES,
  revenueSummarySql,
} from "../shared/financial-reports.service.js";
import { clinicCond } from "../financial.repository.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { HttpError } from "../../../utils/httpError.js";

const router = Router();

// ─── GET /cost-per-procedure ───────────────────────────────────────────────────
// Returns all active procedures with estimated cost, real (overhead-rateado) cost per session,
// revenue generated in the month, and margin analysis.
router.get("/cost-per-procedure", requireFeature("financial.cost_per_procedure"), requirePermission("financial.read"), asyncHandler(async (req: AuthRequest, res) => {
    const clinicId = req.clinicId;
    if (!clinicId && !req.isSuperAdmin) {
      throw HttpError.badRequest("Clínica não identificada");
    }

    const brt = nowBRT();
    const month = parseInt(req.query.month as string) || brt.month;
    const year  = parseInt(req.query.year  as string) || brt.year;

    const daysInMonth = new Date(year, month, 0).getDate();
    const startDate   = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate     = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

    // ── 1. Total real overhead expenses (accrual: by dueDate) ─────────────────
    const expCond = clinicId
      ? and(eq(financialRecordsTable.clinicId, clinicId), eq(financialRecordsTable.type, "despesa"), gte(financialRecordsTable.dueDate, startDate), lte(financialRecordsTable.dueDate, endDate))
      : and(eq(financialRecordsTable.type, "despesa"), gte(financialRecordsTable.dueDate, startDate), lte(financialRecordsTable.dueDate, endDate));

    const [expRow] = await db
      .select({ total: sql<string>`COALESCE(SUM(${financialRecordsTable.amount}::numeric), 0)` })
      .from(financialRecordsTable)
      .where(expCond);
    const totalRealOverhead = Number(expRow?.total ?? 0);

    // ── 2. Estimated overhead from recurring expenses ─────────────────────────
    const weeksInMonth = daysInMonth / 7;

    const recCond = clinicId
      ? and(eq(recurringExpensesTable.clinicId, clinicId), eq(recurringExpensesTable.isActive, true))
      : eq(recurringExpensesTable.isActive, true);

    const recurringRows = await db.select().from(recurringExpensesTable).where(recCond);
    const totalEstimatedOverhead = recurringRows.reduce((sum, r) => {
      const amt = Number(r.amount);
      if (r.frequency === "anual") return sum + amt / 12;
      if (r.frequency === "semanal") return sum + amt * weeksInMonth;
      return sum + amt;
    }, 0);

    // ── 3. Available clinic hours ──────────────────────────────────────────────
    const schCond = clinicId
      ? and(eq(schedulesTable.clinicId, clinicId), eq(schedulesTable.isActive, true), eq(schedulesTable.type, "clinic"))
      : and(eq(schedulesTable.isActive, true), eq(schedulesTable.type, "clinic"));

    const schedules = await db.select().from(schedulesTable).where(schCond);
    let totalAvailableHours = 0;
    for (const sch of schedules) {
      const days = sch.workingDays.split(",").map(Number);
      const [sh, sm] = sch.startTime.split(":").map(Number);
      const [eh, em] = sch.endTime.split(":").map(Number);
      const hpd = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
      let wd = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        if (days.includes(new Date(year, month - 1, d).getDay())) wd++;
      }
      totalAvailableHours += hpd * wd;
    }

    const realCostPerHour  = totalAvailableHours > 0 ? totalRealOverhead  / totalAvailableHours : 0;
    const estCostPerHour   = totalAvailableHours > 0 ? totalEstimatedOverhead / totalAvailableHours : 0;

    // ── 4. Procedures with costs and appointment stats ─────────────────────────
    const procCond = clinicId
      ? and(or(isNull(proceduresTable.clinicId), eq(proceduresTable.clinicId, clinicId)), eq(proceduresTable.isActive, true))
      : eq(proceduresTable.isActive, true);

    const procs = await db
      .select({
        id: proceduresTable.id,
        name: proceduresTable.name,
        category: proceduresTable.category,
        modalidade: proceduresTable.modalidade,
        durationMinutes: proceduresTable.durationMinutes,
        maxCapacity: proceduresTable.maxCapacity,
        price: proceduresTable.price,
        baseCost: proceduresTable.cost,
        variableCost: procedureCostsTable.variableCost,
      })
      .from(proceduresTable)
      .leftJoin(
        procedureCostsTable,
        and(
          eq(procedureCostsTable.procedureId, proceduresTable.id),
          clinicId ? eq(procedureCostsTable.clinicId, clinicId) : sql`false`
        )
      )
      .where(procCond)
      .orderBy(proceduresTable.name);

    const apptStatsCond = clinicId
      ? and(eq(appointmentsTable.clinicId, clinicId), gte(appointmentsTable.date, startDate), lte(appointmentsTable.date, endDate))
      : and(gte(appointmentsTable.date, startDate), lte(appointmentsTable.date, endDate));

    const apptStats = await db
      .select({
        procedureId: appointmentsTable.procedureId,
        completedCount: sql<number>`COUNT(*) FILTER (WHERE ${appointmentsTable.status} IN ('concluido','compareceu'))`,
        scheduledCount: sql<number>`COUNT(*)`,
        uniqueCompletedSessions: sql<number>`COUNT(DISTINCT CASE WHEN ${appointmentsTable.status} IN ('concluido','compareceu') THEN (${appointmentsTable.date}::text || '_' || ${appointmentsTable.startTime}) END)`,
      })
      .from(appointmentsTable)
      .where(apptStatsCond)
      .groupBy(appointmentsTable.procedureId);

    const apptMap = new Map(apptStats.map(a => [a.procedureId, a]));

    const revStatsCond = clinicId
      ? and(eq(financialRecordsTable.clinicId, clinicId), revenueSummarySql(), gte(financialRecordsTable.paymentDate, startDate), lte(financialRecordsTable.paymentDate, endDate))
      : and(revenueSummarySql(), gte(financialRecordsTable.paymentDate, startDate), lte(financialRecordsTable.paymentDate, endDate));

    const revByProcedure = await db
      .select({
        procedureId: financialRecordsTable.procedureId,
        totalRevenue: sql<number>`COALESCE(SUM(${financialRecordsTable.amount}::numeric), 0)`,
      })
      .from(financialRecordsTable)
      .where(revStatsCond)
      .groupBy(financialRecordsTable.procedureId);

    const revMap = new Map(revByProcedure.map(r => [r.procedureId, r.totalRevenue]));

    const results = procs.map((p) => {
      const durationHours = p.durationMinutes / 60;
      const isGroup = p.modalidade !== "individual";
      const maxCap = Math.max(p.maxCapacity ?? 1, 1);

      const stats = apptMap.get(p.id);
      const completedParticipants  = Number(stats?.completedCount ?? 0);
      const scheduledSessions      = Number(stats?.scheduledCount ?? 0);
      const uniqueCompletedSessions = Number(stats?.uniqueCompletedSessions ?? 0);

      const estimatedCapacityDivisor = isGroup ? maxCap : 1;

      const avgActualParticipants = (isGroup && uniqueCompletedSessions > 0)
        ? completedParticipants / uniqueCompletedSessions
        : estimatedCapacityDivisor;
      const realCapacityDivisor = Math.max(avgActualParticipants, 1);

      const hasClinicCost = p.variableCost !== null;
      const variableDirectCost = hasClinicCost
        ? Number(p.variableCost ?? 0)
        : Number(p.baseCost ?? 0);

      const realOverheadCostPerSession      = (realCostPerHour  * durationHours) / realCapacityDivisor;
      const estimatedOverheadCostPerSession = (estCostPerHour   * durationHours) / estimatedCapacityDivisor;

      const estimatedTotalCostPerSession = variableDirectCost + estimatedOverheadCostPerSession;
      const realTotalCostPerSession      = variableDirectCost + realOverheadCostPerSession;

      const price = Number(p.price);
      const revenueGenerated = Number(revMap.get(p.id) ?? 0);

      return {
        procedureId: p.id,
        name: p.name,
        category: p.category,
        modalidade: p.modalidade,
        durationMinutes: p.durationMinutes,
        maxCapacity: maxCap,
        estimatedCapacityDivisor,
        realCapacityDivisor: Math.round(realCapacityDivisor * 100) / 100,
        avgActualParticipants: isGroup ? Math.round(avgActualParticipants * 10) / 10 : null,
        price,
        variableDirectCost: Math.round(variableDirectCost * 100) / 100,
        estimatedOverheadPerSession: Math.round(estimatedOverheadCostPerSession * 100) / 100,
        estimatedTotalCostPerSession: Math.round(estimatedTotalCostPerSession * 100) / 100,
        realOverheadPerSession: Math.round(realOverheadCostPerSession * 100) / 100,
        realTotalCostPerSession: Math.round(realTotalCostPerSession * 100) / 100,
        estimatedMarginPerSession: Math.round((price - estimatedTotalCostPerSession) * 100) / 100,
        realMarginPerSession: Math.round((price - realTotalCostPerSession) * 100) / 100,
        estimatedMarginPct: price > 0 ? Math.round(((price - estimatedTotalCostPerSession) / price) * 10000) / 100 : 0,
        realMarginPct: price > 0 ? Math.round(((price - realTotalCostPerSession) / price) * 10000) / 100 : 0,
        completedParticipants,
        uniqueCompletedSessions,
        scheduledSessions,
        revenueGenerated: Math.round(revenueGenerated * 100) / 100,
        realCostAllocated: Math.round(completedParticipants * realTotalCostPerSession * 100) / 100,
        estimatedCostAllocated: Math.round(completedParticipants * estimatedTotalCostPerSession * 100) / 100,
      };
    });

    res.json({
      month, year,
      totalRealOverhead: Math.round(totalRealOverhead * 100) / 100,
      totalEstimatedOverhead: Math.round(totalEstimatedOverhead * 100) / 100,
      totalAvailableHours: Math.round(totalAvailableHours * 10) / 10,
      realCostPerHour:  Math.round(realCostPerHour * 100) / 100,
      estCostPerHour:   Math.round(estCostPerHour * 100) / 100,
      procedures: results,
    });
}));

// ─── GET /dre ─────────────────────────────────────────────────────────────────
// Mini Demonstrativo de Resultado do Exercício (DRE) mensal
router.get("/dre", requireFeature("financial.view.dre"), requirePermission("financial.read"), asyncHandler(async (req: AuthRequest, res) => {
    const clinicId = req.clinicId;
    const cc = clinicCond(req);
    const brt = nowBRT();
    const month = parseInt(req.query.month as string) || brt.month;
    const year  = parseInt(req.query.year  as string) || brt.year;

    function dateRange(y: number, m: number) {
      const range = monthDateRangeBRT(y, m);
      return { start: range.startDate, end: range.endDate };
    }

    const { start, end } = dateRange(year, month);
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear  = month === 1 ? year - 1 : year;
    const { start: ps, end: pe } = dateRange(prevYear, prevMonth);

    async function getMonthlyFinancials(s: string, e: string) {
      const totals = await getAccountingTotals({
        clinicId: req.isSuperAdmin ? null : clinicId,
        startDate: s,
        endDate: e,
      });
      const byCode = new Map(totals.map((row) => [row.code, { debit: Number(row.debit), credit: Number(row.credit) }]));

      const revenue =
        (byCode.get(ACCOUNT_CODES.serviceRevenue)?.credit ?? 0) +
        (byCode.get(ACCOUNT_CODES.packageRevenue)?.credit ?? 0);
      const operatingExpenses = byCode.get(ACCOUNT_CODES.operatingExpenses)?.debit ?? 0;
      const revenueReversals = byCode.get(ACCOUNT_CODES.revenueReversals)?.debit ?? 0;
      const totalExpenses = operatingExpenses + revenueReversals;
      const expensesByCategory: Record<string, number> = {
        "Despesas Operacionais": operatingExpenses,
      };
      if (revenueReversals > 0) {
        expensesByCategory["Estornos/Cancelamentos"] = revenueReversals;
      }

      return { revenue, totalExpenses, expensesByCategory };
    }

    const [current, previous] = await Promise.all([
      getMonthlyFinancials(start, end),
      getMonthlyFinancials(ps, pe),
    ]);

    const subCond = clinicId
      ? and(eq(patientSubscriptionsTable.clinicId, clinicId), eq(patientSubscriptionsTable.status, "ativa"))
      : eq(patientSubscriptionsTable.status, "ativa");

    const [mrrRow] = await db
      .select({ mrr: sql<number>`COALESCE(SUM(${patientSubscriptionsTable.monthlyAmount}::numeric), 0)` })
      .from(patientSubscriptionsTable)
      .where(subCond);

    const mrr = Number(mrrRow?.mrr ?? 0);

    const recCond = clinicId
      ? and(eq(recurringExpensesTable.clinicId, clinicId), eq(recurringExpensesTable.isActive, true))
      : eq(recurringExpensesTable.isActive, true);

    const recurringRows = await db.select().from(recurringExpensesTable).where(recCond);
    // Cada despesa recorrente pode ter `monthlyBudget` próprio (Sprint 2 — T5).
    // Quando ausente, calculamos a partir de `amount` ajustado pela frequência.
    const recurringEstimatedExpenses = recurringRows.reduce((sum, r) => {
      if (r.monthlyBudget !== null && r.monthlyBudget !== undefined) {
        return sum + Number(r.monthlyBudget);
      }
      const amt = Number(r.amount);
      if (r.frequency === "anual") return sum + amt / 12;
      if (r.frequency === "semanal") return sum + amt * 4.33;
      return sum + amt;
    }, 0);

    // Se a clínica configurou metas explícitas em `clinic_financial_settings`,
    // elas têm prioridade sobre o cálculo implícito (Sprint 2 — T5).
    const financialSettings = clinicId ? await getClinicFinancialSettings(clinicId) : null;
    const configuredExpenseBudget = financialSettings?.monthlyExpenseBudget ?? null;
    const configuredRevenueGoal = financialSettings?.monthlyRevenueGoal ?? null;
    const estimatedExpenses = configuredExpenseBudget !== null
      ? configuredExpenseBudget
      : recurringEstimatedExpenses;

    const pendCond = cc
      ? and(cc, eq(financialRecordsTable.status, "pendente"), eq(financialRecordsTable.type, "receita"), inArray(financialRecordsTable.transactionType, RECEIVABLE_TYPES), gte(financialRecordsTable.dueDate, start), lte(financialRecordsTable.dueDate, end))
      : and(eq(financialRecordsTable.status, "pendente"), eq(financialRecordsTable.type, "receita"), inArray(financialRecordsTable.transactionType, RECEIVABLE_TYPES), gte(financialRecordsTable.dueDate, start), lte(financialRecordsTable.dueDate, end));

    const [pendRow] = await db
      .select({ total: sql<number>`COALESCE(SUM(${financialRecordsTable.amount}::numeric), 0)`, cnt: count() })
      .from(financialRecordsTable)
      .where(pendCond);

    const pendingReceivable = Number(pendRow?.total ?? 0);
    const computedRevenue = mrr > 0 ? mrr + pendingReceivable : current.revenue + pendingReceivable;
    const estimatedRevenue = configuredRevenueGoal !== null ? configuredRevenueGoal : computedRevenue;

    const netProfit   = current.revenue - current.totalExpenses;
    const prevNetProfit = previous.revenue - previous.totalExpenses;
    const netProfitChange = prevNetProfit !== 0 ? ((netProfit - prevNetProfit) / Math.abs(prevNetProfit)) * 100 : 0;

    const expenseItems = Object.entries(current.expensesByCategory).map(([cat, val]) => ({
      category: cat,
      amount: Math.round(val * 100) / 100,
      pct: current.totalExpenses > 0 ? Math.round((val / current.totalExpenses) * 10000) / 100 : 0,
    })).sort((a, b) => b.amount - a.amount);

    res.json({
      month, year,
      current: {
        grossRevenue: Math.round(current.revenue * 100) / 100,
        totalExpenses: Math.round(current.totalExpenses * 100) / 100,
        netProfit: Math.round(netProfit * 100) / 100,
        netMarginPct: current.revenue > 0 ? Math.round((netProfit / current.revenue) * 10000) / 100 : 0,
        expensesByCategory: expenseItems,
      },
      previous: {
        grossRevenue: Math.round(previous.revenue * 100) / 100,
        totalExpenses: Math.round(previous.totalExpenses * 100) / 100,
        netProfit: Math.round(prevNetProfit * 100) / 100,
        netMarginPct: previous.revenue > 0 ? Math.round((prevNetProfit / previous.revenue) * 10000) / 100 : 0,
      },
      estimated: {
        revenue: Math.round(estimatedRevenue * 100) / 100,
        expenses: Math.round(estimatedExpenses * 100) / 100,
        netProfit: Math.round((estimatedRevenue - estimatedExpenses) * 100) / 100,
        mrr: Math.round(mrr * 100) / 100,
        pendingReceivable: Math.round(pendingReceivable * 100) / 100,
        revenueSource: configuredRevenueGoal !== null ? "configured" : "computed",
        expensesSource: configuredExpenseBudget !== null ? "configured" : "recurring",
      },
      variance: {
        revenue: Math.round((current.revenue - estimatedRevenue) * 100) / 100,
        revenuePct: estimatedRevenue > 0 ? Math.round(((current.revenue - estimatedRevenue) / estimatedRevenue) * 10000) / 100 : 0,
        expenses: Math.round((current.totalExpenses - estimatedExpenses) * 100) / 100,
        expensesPct: estimatedExpenses > 0 ? Math.round(((current.totalExpenses - estimatedExpenses) / estimatedExpenses) * 10000) / 100 : 0,
        netProfitChangeVsPrevMonth: Math.round(netProfitChange * 100) / 100,
      },
      recurringExpenses: recurringRows.map(r => ({
        id: r.id,
        name: r.name,
        category: r.category,
        amount: Number(r.amount),
        frequency: r.frequency,
        monthlyEquivalent: r.frequency === "anual" ? Number(r.amount) / 12 : r.frequency === "semanal" ? Number(r.amount) * 4.33 : Number(r.amount),
      })),
    });
}));

export default router;
