/**
 * cash-flow-projection.routes — Sprint 3 — T7
 *
 * GET /api/financial/cash-flow-projection?days=30
 *
 * Projeta o saldo de caixa diário pelos próximos N dias (1..180), cruzando:
 *   • Saldo inicial → balance da conta contábil "Caixa/Banco" (ACCOUNT_CODES.cash)
 *   • Entradas previstas → financial_records type='receita' status='pendente'
 *                          em RECEIVABLE_TYPES, agregadas por due_date
 *   • Saídas previstas:
 *       - financial_records type='despesa' status='pendente' por due_date
 *       - recurring_expenses ativas projetadas pela frequência
 *         (mensal → dia do mês = createdAt.getDate; semanal → cada 7 dias
 *         a partir de hoje; anual → aniversário se cair na janela)
 *
 * Retorna `{ days, openingBalance, cashReserveTarget, breachesReserve, series: [...] }`
 * onde cada item tem { date, opening, expectedIn, expectedOut, closing,
 * inflowItems, outflowItems, alert }.
 */
import { Router } from "express";
import { db } from "@workspace/db";
import {
  financialRecordsTable, recurringExpensesTable,
} from "@workspace/db";
import { and, eq, sql, gte, lte, inArray } from "drizzle-orm";
import type { AuthRequest } from "../../../middleware/auth.js";
import { requirePermission } from "../../../middleware/rbac.js";
import { requireFeature } from "../../../middleware/plan-features.js";
import { getClinicFinancialSettings } from "../settings/clinic-financial-settings.service.js";
import { todayBRT } from "../../../utils/dateUtils.js";
import {
  ACCOUNT_CODES,
  getAccountingBalances,
} from "../../shared/accounting/accounting.service.js";
import { RECEIVABLE_TYPES } from "../shared/financial-reports.service.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { HttpError } from "../../../utils/httpError.js";

const router = Router();

// ─── Helpers ────────────────────────────────────────────────────────────────
function toIsoDate(d: Date): string {
  // Mantém formato YYYY-MM-DD em UTC (suficiente para comparação por data —
  // datas em pt-BR/BRT são tratadas como timestamps de meia-noite UTC nas
  // colunas `date` do Postgres).
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

/** Próxima data de incidência de uma despesa recorrente >= startISO. */
function nextRecurringDate(rec: RecurringRow, startISO: string): string | null {
  const baseDate = rec.createdAt instanceof Date
    ? toIsoDate(rec.createdAt)
    : toIsoDate(new Date(rec.createdAt as unknown as string));

  if (rec.frequency === "semanal") {
    // Próxima ocorrência semanal a partir de baseDate, alinhada >= startISO.
    const elapsed = diffDaysISO(baseDate, startISO);
    if (elapsed <= 0) return baseDate;
    const k = Math.ceil(elapsed / 7);
    return addDaysISO(baseDate, k * 7);
  }

  if (rec.frequency === "anual") {
    // Aniversário do baseDate (mesmo mês/dia). Procuramos no ano corrente; se
    // já passou, vamos pro próximo ano.
    const baseMonth = monthOfDate(baseDate);
    const baseDay = dayOfMonth(baseDate);
    const startYear = Number(startISO.split("-")[0]);
    const candidate = `${startYear}-${String(baseMonth).padStart(2, "0")}-${String(baseDay).padStart(2, "0")}`;
    if (candidate >= startISO) return candidate;
    return `${startYear + 1}-${String(baseMonth).padStart(2, "0")}-${String(baseDay).padStart(2, "0")}`;
  }

  // Mensal (default): mesmo dia do mês do `createdAt`. Se já passou no mês
  // de startISO, vai pro próximo mês.
  const baseDay = Math.min(dayOfMonth(baseDate), 28); // evita 29-31 inválidos
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

/** Gera todas as ocorrências de `rec` no intervalo [startISO, endISO]. */
function* recurringOccurrences(rec: RecurringRow, startISO: string, endISO: string): Generator<string> {
  let next = nextRecurringDate(rec, startISO);
  let safety = 0;
  while (next && next <= endISO && safety < 400) {
    yield next;
    safety += 1;
    if (rec.frequency === "semanal")      next = addDaysISO(next, 7);
    else if (rec.frequency === "anual")   next = `${Number(next.split("-")[0]) + 1}-${next.slice(5)}`;
    else {
      // mensal: avança 1 mês
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
    const startISO = todayBRT();
    const endISO = addDaysISO(startISO, days - 1);

    // ── 1. Saldo inicial (saldo histórico da conta caixa) ─────────────────
    const balances = await getAccountingBalances({ clinicId: req.isSuperAdmin ? null : clinicId });
    const cashRow = balances.find((b) => b.code === ACCOUNT_CODES.cash);
    const openingBalance = cashRow ? Number(cashRow.debit) - Number(cashRow.credit) : 0;

    // ── 2. Configurações financeiras (reserva mínima) ────────────────────
    const settings = clinicId ? await getClinicFinancialSettings(clinicId) : null;
    const cashReserveTarget = settings?.cashReserveTarget ?? null;

    // ── 3. Recebíveis pendentes na janela ─────────────────────────────────
    const recCondBase = clinicId
      ? eq(financialRecordsTable.clinicId, clinicId)
      : sql`TRUE`;

    const incomingRows = await db
      .select({
        date: financialRecordsTable.dueDate,
        amount: sql<string>`COALESCE(SUM(${financialRecordsTable.amount}::numeric), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(financialRecordsTable)
      .where(and(
        recCondBase,
        eq(financialRecordsTable.type, "receita"),
        eq(financialRecordsTable.status, "pendente"),
        inArray(financialRecordsTable.transactionType, RECEIVABLE_TYPES),
        gte(financialRecordsTable.dueDate, startISO),
        lte(financialRecordsTable.dueDate, endISO),
      ))
      .groupBy(financialRecordsTable.dueDate);

    const inflowsByDate = new Map<string, { amount: number; count: number }>();
    for (const r of incomingRows) {
      if (!r.date) continue;
      inflowsByDate.set(String(r.date), {
        amount: Number(r.amount ?? 0),
        count: Number(r.count ?? 0),
      });
    }

    // ── 4. Despesas pontuais pendentes na janela ──────────────────────────
    const outgoingRows = await db
      .select({
        date: financialRecordsTable.dueDate,
        amount: sql<string>`COALESCE(SUM(${financialRecordsTable.amount}::numeric), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(financialRecordsTable)
      .where(and(
        recCondBase,
        eq(financialRecordsTable.type, "despesa"),
        eq(financialRecordsTable.status, "pendente"),
        gte(financialRecordsTable.dueDate, startISO),
        lte(financialRecordsTable.dueDate, endISO),
      ))
      .groupBy(financialRecordsTable.dueDate);

    const outflowsByDate = new Map<string, { adhocAmount: number; adhocCount: number; recurringAmount: number; recurringCount: number }>();
    for (const r of outgoingRows) {
      if (!r.date) continue;
      outflowsByDate.set(String(r.date), {
        adhocAmount: Number(r.amount ?? 0),
        adhocCount: Number(r.count ?? 0),
        recurringAmount: 0,
        recurringCount: 0,
      });
    }

    // ── 5. Recorrentes ativas projetadas ───────────────────────────────────
    const recurringRows = await db
      .select()
      .from(recurringExpensesTable)
      .where(clinicId
        ? and(eq(recurringExpensesTable.clinicId, clinicId), eq(recurringExpensesTable.isActive, true))
        : eq(recurringExpensesTable.isActive, true));

    for (const rec of recurringRows) {
      const amt = Number(rec.amount);
      if (!Number.isFinite(amt) || amt <= 0) continue;
      for (const occ of recurringOccurrences(rec, startISO, endISO)) {
        const cur = outflowsByDate.get(occ) ?? { adhocAmount: 0, adhocCount: 0, recurringAmount: 0, recurringCount: 0 };
        cur.recurringAmount += amt;
        cur.recurringCount += 1;
        outflowsByDate.set(occ, cur);
      }
    }

    // ── 6. Monta série diária ─────────────────────────────────────────────
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
      alert: "below_reserve" | "negative" | null;
    }> = [];

    for (let i = 0; i < days; i++) {
      const date = addDaysISO(startISO, i);
      const opening = runningBalance;
      const inflow = inflowsByDate.get(date);
      const outflow = outflowsByDate.get(date);
      const expectedIn = inflow?.amount ?? 0;
      const adhocOut = outflow?.adhocAmount ?? 0;
      const recurringOut = outflow?.recurringAmount ?? 0;
      const expectedOut = adhocOut + recurringOut;
      const closing = opening + expectedIn - expectedOut;

      let alert: "below_reserve" | "negative" | null = null;
      if (closing < 0) alert = "negative";
      else if (cashReserveTarget !== null && closing < cashReserveTarget) alert = "below_reserve";
      if (alert) breachesReserve = true;

      series.push({
        date,
        opening: Math.round(opening * 100) / 100,
        expectedIn: Math.round(expectedIn * 100) / 100,
        expectedOut: Math.round(expectedOut * 100) / 100,
        closing: Math.round(closing * 100) / 100,
        adhocOut: Math.round(adhocOut * 100) / 100,
        recurringOut: Math.round(recurringOut * 100) / 100,
        inflowCount: inflow?.count ?? 0,
        outflowCount: (outflow?.adhocCount ?? 0) + (outflow?.recurringCount ?? 0),
        alert,
      });

      runningBalance = closing;
    }

    // ── 7. Totais agregados ───────────────────────────────────────────────
    const totalIn = series.reduce((s, d) => s + d.expectedIn, 0);
    const totalOut = series.reduce((s, d) => s + d.expectedOut, 0);
    const finalBalance = series.length > 0 ? series[series.length - 1].closing : openingBalance;
    const lowestBalance = series.reduce((min, d) => Math.min(min, d.closing), openingBalance);

    res.json({
      days,
      startDate: startISO,
      endDate: endISO,
      openingBalance: Math.round(openingBalance * 100) / 100,
      cashReserveTarget: cashReserveTarget !== null ? Math.round(cashReserveTarget * 100) / 100 : null,
      totals: {
        expectedIn: Math.round(totalIn * 100) / 100,
        expectedOut: Math.round(totalOut * 100) / 100,
        netChange: Math.round((totalIn - totalOut) * 100) / 100,
        finalBalance: Math.round(finalBalance * 100) / 100,
        lowestBalance: Math.round(lowestBalance * 100) / 100,
      },
      breachesReserve,
      series,
    });
  }),
);

export default router;
