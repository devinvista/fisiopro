/**
 * cash-flow-projection.routes
 *
 * GET /api/financial/cash-flow-projection?days=30
 *
 * Retorna série diária com duas camadas:
 *   • Realizadas (LOOKBACK_DAYS dias para trás até ontem):
 *       - entradas = receitas pagas (RECEIVABLE_TYPES) agrupadas por payment_date
 *       - saídas   = despesas pagas agrupadas por payment_date
 *   • Projetadas (hoje em diante):
 *       - entradas = receitas pendentes agrupadas por due_date
 *       - saídas   = despesas pendentes (due_date) + recorrentes projetadas
 *
 * O saldo de abertura é a posição da conta Caixa/Banco (1.1.1) com
 * entry_date < seriesStart, garantindo que os movimentos dentro da janela
 * apareçam como linhas explícitas (não engolidos pelo saldo inicial).
 */
import { Router } from "express";
import { db } from "@workspace/db";
import {
  financialRecordsTable,
  recurringExpensesTable,
  accountingAccountsTable,
  accountingJournalEntriesTable,
  accountingJournalLinesTable,
} from "@workspace/db";
import { and, eq, sql, gte, lte, lt, inArray, not } from "drizzle-orm";
import type { AuthRequest } from "../../../middleware/auth.js";
import { requirePermission } from "../../../middleware/rbac.js";
import { requireFeature } from "../../../middleware/plan-features.js";
import { getClinicFinancialSettings } from "../settings/clinic-financial-settings.service.js";
import { todayBRT } from "../../../utils/dateUtils.js";
import { ACCOUNT_CODES } from "../../shared/accounting/accounting.service.js";
import { RECEIVABLE_TYPES } from "../shared/financial-reports.service.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { HttpError } from "../../../utils/httpError.js";

const router = Router();

/** Quantos dias para trás exibir movimentações realizadas. */
const LOOKBACK_DAYS = 3;

// ─── Helpers ────────────────────────────────────────────────────────────────
function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysISO(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return toIsoDate(dt);
}

function diffDaysISO(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const da = Date.UTC(ay, am - 1, ad);
  const db_ = Date.UTC(by, bm - 1, bd);
  return Math.round((db_ - da) / 86400000);
}

function dayOfMonth(isoDate: string): number {
  return Number(isoDate.split("-")[2]);
}

function monthOfDate(isoDate: string): number {
  return Number(isoDate.split("-")[1]);
}

type RecurringRow = typeof recurringExpensesTable.$inferSelect;

function nextRecurringDate(rec: RecurringRow, startISO: string): string | null {
  const baseDate = rec.createdAt instanceof Date
    ? toIsoDate(rec.createdAt)
    : toIsoDate(new Date(rec.createdAt as unknown as string));

  if (rec.frequency === "semanal") {
    const elapsed = diffDaysISO(baseDate, startISO);
    if (elapsed <= 0) return baseDate;
    const k = Math.ceil(elapsed / 7);
    return addDaysISO(baseDate, k * 7);
  }

  if (rec.frequency === "anual") {
    const baseMonth = monthOfDate(baseDate);
    const baseDay = dayOfMonth(baseDate);
    const startYear = Number(startISO.split("-")[0]);
    const candidate = `${startYear}-${String(baseMonth).padStart(2, "0")}-${String(baseDay).padStart(2, "0")}`;
    if (candidate >= startISO) return candidate;
    return `${startYear + 1}-${String(baseMonth).padStart(2, "0")}-${String(baseDay).padStart(2, "0")}`;
  }

  const baseDay = Math.min(dayOfMonth(baseDate), 28);
  const [sy, sm] = startISO.split("-").map(Number);
  let y = sy;
  let m = sm;
  let candidate = `${y}-${String(m).padStart(2, "0")}-${String(baseDay).padStart(2, "0")}`;
  if (candidate < startISO) {
    m += 1;
    if (m > 12) { m = 1; y += 1; }
    candidate = `${y}-${String(m).padStart(2, "0")}-${String(baseDay).padStart(2, "0")}`;
  }
  return candidate;
}

function* recurringOccurrences(rec: RecurringRow, startISO: string, endISO: string): Generator<string> {
  let next = nextRecurringDate(rec, startISO);
  let safety = 0;
  while (next && next <= endISO && safety < 400) {
    yield next;
    safety += 1;
    if (rec.frequency === "semanal")      next = addDaysISO(next, 7);
    else if (rec.frequency === "anual")   next = `${Number(next.split("-")[0]) + 1}-${next.slice(5)}`;
    else {
      const [y, m, d] = next.split("-").map(Number);
      const ny = m === 12 ? y + 1 : y;
      const nm = m === 12 ? 1 : m + 1;
      next = `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, 28)).padStart(2, "0")}`;
    }
  }
}

// ─── GET /cash-flow-projection ──────────────────────────────────────────────
router.get(
  "/cash-flow-projection",
  requireFeature("financial.view.cash_flow"),
  requirePermission("financial.read"),
  asyncHandler(async (req: AuthRequest, res) => {
    const clinicId = req.clinicId;
    if (!clinicId && !req.isSuperAdmin) {
      throw HttpError.badRequest("Clínica não identificada");
    }

    const days = Math.min(180, Math.max(1, Number(req.query.days ?? 30)));
    const todayISO = todayBRT();
    // Série começa LOOKBACK_DAYS dias antes de hoje para mostrar realizados
    const seriesStartISO = addDaysISO(todayISO, -LOOKBACK_DAYS);
    const endISO = addDaysISO(todayISO, days - 1);
    const totalRows = days + LOOKBACK_DAYS;

    const clinicCond = clinicId
      ? eq(financialRecordsTable.clinicId, clinicId)
      : sql`TRUE`;

    // ── 1. Saldo abertura — caixa (1.1.1) com entry_date < seriesStart ────
    // Ao excluir a janela visível do saldo, os movimentos aparecem como linhas
    // explícitas na tabela em vez de serem engolidos pelo saldo inicial.
    const balRows = await db
      .select({
        debit:  sql<number>`COALESCE(SUM(${accountingJournalLinesTable.debitAmount}::numeric), 0)`,
        credit: sql<number>`COALESCE(SUM(${accountingJournalLinesTable.creditAmount}::numeric), 0)`,
      })
      .from(accountingJournalLinesTable)
      .innerJoin(
        accountingJournalEntriesTable,
        eq(accountingJournalLinesTable.entryId, accountingJournalEntriesTable.id),
      )
      .innerJoin(
        accountingAccountsTable,
        eq(accountingJournalLinesTable.accountId, accountingAccountsTable.id),
      )
      .where(and(
        eq(accountingJournalEntriesTable.status, "posted"),
        clinicId
          ? eq(accountingJournalEntriesTable.clinicId, clinicId)
          : sql`TRUE`,
        eq(accountingAccountsTable.code, ACCOUNT_CODES.cash),
        lt(accountingJournalEntriesTable.entryDate, seriesStartISO),
      ));
    const openingBalance = balRows[0]
      ? Number(balRows[0].debit) - Number(balRows[0].credit)
      : 0;

    // ── 2. Configurações financeiras (reserva mínima) ────────────────────
    const settings = clinicId ? await getClinicFinancialSettings(clinicId) : null;
    const cashReserveTarget = settings?.cashReserveTarget ?? null;

    // ── 3. Movimentos REALIZADOS na janela de lookback ────────────────────
    // Receitas pagas (RECEIVABLE_TYPES) agrupadas por payment_date.
    // Exclui "pagamento" (registro técnico de quitação) para evitar dupla
    // contagem com os lançamentos de crédito individuais.
    const realizedInRows = await db
      .select({
        date:   financialRecordsTable.paymentDate,
        amount: sql<string>`COALESCE(SUM(${financialRecordsTable.amount}::numeric), 0)`,
        count:  sql<number>`COUNT(*)`,
      })
      .from(financialRecordsTable)
      .where(and(
        clinicCond,
        eq(financialRecordsTable.type, "receita"),
        not(inArray(financialRecordsTable.status, ["pendente", "estornado", "cancelado"])),
        inArray(financialRecordsTable.transactionType, RECEIVABLE_TYPES),
        gte(financialRecordsTable.paymentDate, seriesStartISO),
        lte(financialRecordsTable.paymentDate, todayISO),
      ))
      .groupBy(financialRecordsTable.paymentDate);

    const realizedOutRows = await db
      .select({
        date:   financialRecordsTable.paymentDate,
        amount: sql<string>`COALESCE(SUM(${financialRecordsTable.amount}::numeric), 0)`,
        count:  sql<number>`COUNT(*)`,
      })
      .from(financialRecordsTable)
      .where(and(
        clinicCond,
        eq(financialRecordsTable.type, "despesa"),
        not(inArray(financialRecordsTable.status, ["pendente", "estornado", "cancelado"])),
        gte(financialRecordsTable.paymentDate, seriesStartISO),
        lte(financialRecordsTable.paymentDate, todayISO),
      ))
      .groupBy(financialRecordsTable.paymentDate);

    const realizedInflowsByDate = new Map<string, { amount: number; count: number }>();
    for (const r of realizedInRows) {
      if (!r.date) continue;
      realizedInflowsByDate.set(String(r.date), { amount: Number(r.amount), count: Number(r.count) });
    }
    const realizedOutflowsByDate = new Map<string, { amount: number; count: number }>();
    for (const r of realizedOutRows) {
      if (!r.date) continue;
      realizedOutflowsByDate.set(String(r.date), { amount: Number(r.amount), count: Number(r.count) });
    }

    // ── 4. Recebíveis PENDENTES na janela de projeção (hoje → endISO) ─────
    const incomingRows = await db
      .select({
        date:   financialRecordsTable.dueDate,
        amount: sql<string>`COALESCE(SUM(${financialRecordsTable.amount}::numeric), 0)`,
        count:  sql<number>`COUNT(*)`,
      })
      .from(financialRecordsTable)
      .where(and(
        clinicCond,
        eq(financialRecordsTable.type, "receita"),
        eq(financialRecordsTable.status, "pendente"),
        inArray(financialRecordsTable.transactionType, RECEIVABLE_TYPES),
        gte(financialRecordsTable.dueDate, todayISO),
        lte(financialRecordsTable.dueDate, endISO),
      ))
      .groupBy(financialRecordsTable.dueDate);

    const inflowsByDate = new Map<string, { amount: number; count: number }>();
    for (const r of incomingRows) {
      if (!r.date) continue;
      inflowsByDate.set(String(r.date), { amount: Number(r.amount), count: Number(r.count) });
    }

    // ── 5. Despesas PENDENTES na janela de projeção ───────────────────────
    const outgoingRows = await db
      .select({
        date:   financialRecordsTable.dueDate,
        amount: sql<string>`COALESCE(SUM(${financialRecordsTable.amount}::numeric), 0)`,
        count:  sql<number>`COUNT(*)`,
      })
      .from(financialRecordsTable)
      .where(and(
        clinicCond,
        eq(financialRecordsTable.type, "despesa"),
        eq(financialRecordsTable.status, "pendente"),
        gte(financialRecordsTable.dueDate, todayISO),
        lte(financialRecordsTable.dueDate, endISO),
      ))
      .groupBy(financialRecordsTable.dueDate);

    const outflowsByDate = new Map<string, { adhocAmount: number; adhocCount: number; recurringAmount: number; recurringCount: number }>();
    for (const r of outgoingRows) {
      if (!r.date) continue;
      outflowsByDate.set(String(r.date), {
        adhocAmount: Number(r.amount),
        adhocCount:  Number(r.count),
        recurringAmount: 0,
        recurringCount:  0,
      });
    }

    // ── 6. Recorrentes ativas projetadas (apenas dias futuros) ────────────
    const recurringRows = await db
      .select()
      .from(recurringExpensesTable)
      .where(clinicId
        ? and(eq(recurringExpensesTable.clinicId, clinicId), eq(recurringExpensesTable.isActive, true))
        : eq(recurringExpensesTable.isActive, true));

    for (const rec of recurringRows) {
      const amt = Number(rec.amount);
      if (!Number.isFinite(amt) || amt <= 0) continue;
      for (const occ of recurringOccurrences(rec, todayISO, endISO)) {
        const cur = outflowsByDate.get(occ) ?? { adhocAmount: 0, adhocCount: 0, recurringAmount: 0, recurringCount: 0 };
        cur.recurringAmount += amt;
        cur.recurringCount  += 1;
        outflowsByDate.set(occ, cur);
      }
    }

    // ── 7. Monta série diária ─────────────────────────────────────────────
    let runningBalance = openingBalance;
    let breachesReserve = false;
    const series: Array<{
      date: string;
      opening: number;
      expectedIn: number;
      expectedOut: number;
      closing: number;
      adhocOut: number;
      recurringOut: number;
      inflowCount: number;
      outflowCount: number;
      isRealized: boolean;
      alert: "below_reserve" | "negative" | null;
    }> = [];

    for (let i = 0; i < totalRows; i++) {
      const date = addDaysISO(seriesStartISO, i);
      const isRealized = date < todayISO;
      const opening = runningBalance;

      let expectedIn   = 0;
      let expectedOut  = 0;
      let adhocOut     = 0;
      let recurringOut = 0;
      let inflowCount  = 0;
      let outflowCount = 0;

      if (isRealized) {
        // Dia passado: apenas movimentos reais
        const ri = realizedInflowsByDate.get(date);
        const ro = realizedOutflowsByDate.get(date);
        expectedIn   = ri?.amount ?? 0;
        expectedOut  = ro?.amount ?? 0;
        adhocOut     = expectedOut;
        inflowCount  = ri?.count ?? 0;
        outflowCount = ro?.count ?? 0;
      } else {
        // Hoje ou futuro: reais de hoje + projeção pendentes
        const ri  = realizedInflowsByDate.get(date);
        const ro  = realizedOutflowsByDate.get(date);
        const pi  = inflowsByDate.get(date);
        const po  = outflowsByDate.get(date);
        expectedIn   = (ri?.amount ?? 0) + (pi?.amount ?? 0);
        adhocOut     = (ro?.amount ?? 0) + (po?.adhocAmount ?? 0);
        recurringOut = po?.recurringAmount ?? 0;
        expectedOut  = adhocOut + recurringOut;
        inflowCount  = (ri?.count ?? 0) + (pi?.count ?? 0);
        outflowCount = (ro?.count ?? 0) + (po?.adhocCount ?? 0) + (po?.recurringCount ?? 0);
      }

      const closing = opening + expectedIn - expectedOut;

      let alert: "below_reserve" | "negative" | null = null;
      if (closing < 0) alert = "negative";
      else if (cashReserveTarget !== null && closing < cashReserveTarget) alert = "below_reserve";
      if (alert && !isRealized) breachesReserve = true;

      series.push({
        date,
        opening:     Math.round(opening * 100) / 100,
        expectedIn:  Math.round(expectedIn * 100) / 100,
        expectedOut: Math.round(expectedOut * 100) / 100,
        closing:     Math.round(closing * 100) / 100,
        adhocOut:    Math.round(adhocOut * 100) / 100,
        recurringOut:Math.round(recurringOut * 100) / 100,
        inflowCount,
        outflowCount,
        isRealized,
        alert,
      });

      runningBalance = closing;
    }

    // ── 8. Totais (apenas período projetado) ──────────────────────────────
    const projected = series.filter((d) => !d.isRealized);
    const totalIn   = projected.reduce((s, d) => s + d.expectedIn, 0);
    const totalOut  = projected.reduce((s, d) => s + d.expectedOut, 0);
    const finalBalance   = series.length > 0 ? series[series.length - 1].closing : openingBalance;
    const lowestBalance  = series.reduce((min, d) => Math.min(min, d.closing), openingBalance);

    res.json({
      days,
      startDate:  seriesStartISO,
      endDate:    endISO,
      todayDate:  todayISO,
      openingBalance: Math.round(openingBalance * 100) / 100,
      cashReserveTarget: cashReserveTarget !== null ? Math.round(cashReserveTarget * 100) / 100 : null,
      totals: {
        expectedIn:   Math.round(totalIn * 100) / 100,
        expectedOut:  Math.round(totalOut * 100) / 100,
        netChange:    Math.round((totalIn - totalOut) * 100) / 100,
        finalBalance: Math.round(finalBalance * 100) / 100,
        lowestBalance:Math.round(lowestBalance * 100) / 100,
      },
      breachesReserve,
      series,
    });
  }),
);

export default router;
