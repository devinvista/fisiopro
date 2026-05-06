import { Router } from "express";
import { db } from "@workspace/db";
import {
  financialRecordsTable,
  appointmentsTable,
  proceduresTable,
  accountingJournalEntriesTable,
  accountingJournalLinesTable,
  accountingAccountsTable,
  receivableAllocationsTable,
} from "@workspace/db";
import { and, eq, sql, gte, lte, isNull, inArray } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../../../middleware/auth.js";
import { requirePermission } from "../../../middleware/rbac.js";
import { nowBRT } from "../../../utils/dateUtils.js";
import { recordDateFilter, revenueSummarySql, RECEIVABLE_TYPES } from "../shared/financial-reports.service.js";
import { getAccountingBalances } from "../../shared/accounting/accounting.service.js";

/**
 * Data efetiva do registro financeiro para fins de relatório (competência):
 * — faturaPlano com planMonthRef → usa planMonthRef (competência do serviço,
 *   não a data do pagamento). Pagar em maio uma parcela de julho → julho.
 * — Demais: paymentDate se pago, dueDate se pendente, createdAt como fallback.
 *
 * Espelha a regra usada por `recordDateFilter` no `financial-reports.service`.
 */
const effectiveDateSql = sql<string>`CASE
  WHEN ${financialRecordsTable.transactionType} = 'faturaPlano'
    AND ${financialRecordsTable.planMonthRef} IS NOT NULL
  THEN ${financialRecordsTable.planMonthRef}::date
  ELSE COALESCE(${financialRecordsTable.paymentDate}::date, ${financialRecordsTable.dueDate}::date, DATE(${financialRecordsTable.createdAt}))
END`;

const router = Router();
router.use(authMiddleware);

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function monthDateRange(year: number, month: number): { startDate: string; endDate: string } {
  const lastDay = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, "0");
  return {
    startDate: `${year}-${mm}-01`,
    endDate: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}

router.get("/monthly-revenue", requirePermission("reports.read"), async (req: AuthRequest, res) => {
  try {
    const year = parseInt(req.query.year as string) || nowBRT().year;
    const yearStartStr = `${year}-01-01`;
    const yearEndStr = `${year}-12-31`;

    const clinicFilter = !req.clinicId ? null : eq(financialRecordsTable.clinicId, req.clinicId);
    const dateInYear = recordDateFilter(yearStartStr, yearEndStr);
    const monthExpr = sql<number>`EXTRACT(MONTH FROM ${effectiveDateSql})::int`;

    // Receita: usa regra completa (exclui estornado/cancelado e tipos não-competência)
    const revenueRows = await db
      .select({
        month: monthExpr,
        total: sql<number>`SUM(${financialRecordsTable.amount}::numeric)`,
      })
      .from(financialRecordsTable)
      .where(and(...[clinicFilter, revenueSummarySql(), dateInYear].filter(Boolean) as any[]))
      .groupBy(monthExpr);

    const revenueByMonth: number[] = new Array(13).fill(0);
    for (const r of revenueRows) {
      if (r.month >= 1 && r.month <= 12) revenueByMonth[r.month] = Number(r.total);
    }

    // Despesas: aplica mesma regra de data efetiva
    const expenseRows = await db
      .select({
        month: monthExpr,
        total: sql<number>`SUM(${financialRecordsTable.amount}::numeric)`,
      })
      .from(financialRecordsTable)
      .where(and(...[
        clinicFilter,
        eq(financialRecordsTable.type, "despesa"),
        sql`${financialRecordsTable.status} NOT IN ('estornado', 'cancelado')`,
        dateInYear,
      ].filter(Boolean) as any[]))
      .groupBy(monthExpr);

    const result = [];
    for (let month = 1; month <= 12; month++) {
      const revenue = revenueByMonth[month];
      const expenses = Number(expenseRows.find((r) => r.month === month)?.total ?? 0);
      result.push({ month, monthName: MONTH_NAMES[month - 1], revenue, expenses, profit: revenue - expenses });
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/procedure-revenue", requirePermission("reports.read"), async (req: AuthRequest, res) => {
  try {
    const brt = nowBRT();
    const month = parseInt(req.query.month as string) || brt.month;
    const year = parseInt(req.query.year as string) || brt.year;
    const { startDate, endDate } = monthDateRange(year, month);

    const clinicId = req.clinicId ?? null;

    // Estratégia: resolver o procedure_id de cada financial_record numa subquery
    // (direto via fr.procedure_id; via fr.appointment_id → appointments.procedure_id como fallback),
    // depois juntar com procedures. Evita o cross-product que ocorria ao fazer
    // procedures × appointments × financial_records num único JOIN.
    const clinicCond = clinicId ? sql`AND fr.clinic_id = ${clinicId}` : sql``;
    const startCond = sql`${startDate}`;
    const endCond = sql`${endDate}`;

    const rows = await db.execute<{
      procedure_id: number;
      procedure_name: string;
      category: string | null;
      total_revenue: string | number;
      total_sessions: string | number;
    }>(sql`
      WITH fr_resolved AS (
        SELECT fr.id, fr.amount,
               COALESCE(fr.procedure_id, a.procedure_id) AS resolved_procedure_id
        FROM financial_records fr
        LEFT JOIN appointments a ON a.id = fr.appointment_id
        WHERE fr.type = 'receita'
          AND fr.status NOT IN ('estornado', 'cancelado')
          AND (fr.transaction_type IS NULL OR fr.transaction_type NOT IN ('depositoCarteira', 'vendaPacote', 'pagamento', 'faturaConsolidada', 'faturaMensalAvulso'))
          AND (CASE
                 WHEN fr.transaction_type = 'faturaPlano' AND fr.plan_month_ref IS NOT NULL
                 THEN fr.plan_month_ref::date
                 ELSE COALESCE(fr.payment_date::date, fr.due_date::date, DATE(fr.created_at))
               END) BETWEEN ${startCond}::date AND ${endCond}::date
          ${clinicCond}
      )
      SELECT p.id AS procedure_id,
             p.name AS procedure_name,
             p.category,
             COALESCE(SUM(fr.amount::numeric), 0) AS total_revenue,
             COUNT(fr.id) AS total_sessions
      FROM procedures p
      LEFT JOIN fr_resolved fr ON fr.resolved_procedure_id = p.id
      GROUP BY p.id, p.name, p.category
      ORDER BY COALESCE(SUM(fr.amount::numeric), 0) DESC
    `);

    const results = (rows as unknown as { rows: any[] }).rows ?? (rows as unknown as any[]);

    res.json(
      results.map((r: any) => {
        const totalRevenue = Number(r.total_revenue ?? r.totalRevenue ?? 0);
        const totalSessions = Number(r.total_sessions ?? r.totalSessions ?? 0);
        return {
          procedureId: r.procedure_id ?? r.procedureId,
          procedureName: r.procedure_name ?? r.procedureName,
          category: r.category,
          totalRevenue,
          totalSessions,
          averageTicket: totalSessions > 0 ? totalRevenue / totalSessions : 0,
        };
      })
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/schedule-occupation", requirePermission("reports.read"), async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    const brt = nowBRT();
    const month = parseInt(authReq.query.month as string) || brt.month;
    const year = parseInt(authReq.query.year as string) || brt.year;
    const { startDate, endDate } = monthDateRange(year, month);

    const clinicFilter = !authReq.clinicId
      ? null
      : eq(appointmentsTable.clinicId, authReq.clinicId);

    const appointments = await db
      .select()
      .from(appointmentsTable)
      .where(and(
        gte(appointmentsTable.date, startDate),
        lte(appointmentsTable.date, endDate),
        clinicFilter ?? undefined
      ));

    const totalSlots = appointments.length;
    const occupiedSlots = appointments.filter((a) =>
      ["concluido", "agendado", "confirmado"].includes(a.status)
    ).length;
    const canceledCount = appointments.filter((a) => a.status === "cancelado").length;
    const noShowCount = appointments.filter((a) => a.status === "faltou").length;

    const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const byDayOfWeek: Record<string, number> = {};
    dayNames.forEach((d) => { byDayOfWeek[d] = 0; });

    for (const appt of appointments) {
      const dayOfWeek = new Date(appt.date + "T12:00:00").getDay();
      byDayOfWeek[dayNames[dayOfWeek]]++;
    }

    const activePatients = new Set(
      appointments
        .filter((a) => !["cancelado"].includes(a.status))
        .map((a) => a.patientId)
    ).size;

    const noShowRate = totalSlots > 0 ? (noShowCount / totalSlots) * 100 : 0;

    res.json({
      totalSlots,
      occupiedSlots,
      occupationRate: totalSlots > 0 ? (occupiedSlots / totalSlots) * 100 : 0,
      canceledCount,
      noShowCount,
      noShowRate,
      activePatients,
      byDayOfWeek: dayNames.map((d) => ({ dayOfWeek: d, count: byDayOfWeek[d] })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * PR-FIN8-3 — Conciliação Operacional × Contábil
 *
 * Compara, em uma janela `[from, to]`:
 *  • Receita operacional (revenueSummarySql)   ↔ Créditos das contas 4.x
 *  • Recebíveis pendentes (financial_records)  ↔ Saldo da conta 1.1.2 (Recebíveis)
 *  • Caixa recebido (settlements)              ↔ Débitos da conta 1.1.1 (Caixa)
 *
 * Identifica também:
 *  • registros financeiros sem `recognizedEntryId/accountingEntryId` (deveriam ter)
 *  • settlements pendentes sem `settlementEntryId`
 *
 * Retorna sempre 200 com `{ ok: boolean, ...diffs }`. `ok=false` quando alguma
 * diferença excede a tolerância (R$ 0,01). Usado pelo SuperAdmin / job noturno
 * para garantir que operacional e contábil contam a mesma história.
 */
router.get("/reconciliation", requirePermission("financial.read"), async (req: AuthRequest, res) => {
  try {
    const brt = nowBRT();
    const fromStr = (req.query.from as string) || `${brt.year}-${String(brt.month).padStart(2, "0")}-01`;
    const toStr = (req.query.to as string) || `${brt.year}-${String(brt.month).padStart(2, "0")}-${String(new Date(brt.year, brt.month, 0).getDate()).padStart(2, "0")}`;
    const tolerance = 0.01;

    const clinicId = req.isSuperAdmin ? (req.query.clinicId ? Number(req.query.clinicId) : null) : (req.clinicId ?? null);
    const clinicFilter = clinicId == null ? null : eq(financialRecordsTable.clinicId, clinicId);

    // ─── 1. Receita operacional na janela ──────────────────────────────────
    const [opRevenue] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${financialRecordsTable.amount}::numeric), 0)`,
      })
      .from(financialRecordsTable)
      .where(and(...[
        clinicFilter,
        revenueSummarySql(),
        recordDateFilter(fromStr, toStr),
      ].filter(Boolean) as any[]));

    // ─── 2. Recebíveis pendentes (snapshot atual) ──────────────────────────
    const [opPendingReceivables] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${financialRecordsTable.amount}::numeric), 0)`,
      })
      .from(financialRecordsTable)
      .where(and(...[
        clinicFilter,
        eq(financialRecordsTable.type, "receita"),
        eq(financialRecordsTable.status, "pendente"),
        sql`(${financialRecordsTable.transactionType} IS NULL OR ${financialRecordsTable.transactionType} = ANY(${RECEIVABLE_TYPES}))`,
      ].filter(Boolean) as any[]));

    // ─── 3. Caixa recebido (apenas pagamentos diretos na janela) ───────────
    // Somente transaction_type='pagamento' representa entradas reais de caixa.
    // 'usoCarteira' é reconhecimento de receita a partir de adiantamento
    // pré-pago — NÃO é nova entrada de caixa e não deve constar aqui.
    const [opCashIn] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${financialRecordsTable.amount}::numeric), 0)`,
      })
      .from(financialRecordsTable)
      .where(and(...[
        clinicFilter,
        eq(financialRecordsTable.type, "receita"),
        eq(financialRecordsTable.transactionType, "pagamento"),
        eq(financialRecordsTable.status, "pago"),
        gte(financialRecordsTable.paymentDate, fromStr),
        lte(financialRecordsTable.paymentDate, toStr),
      ].filter(Boolean) as any[]));

    // ─── 4. Saldos contábeis (snapshot, todas as datas postadas) ───────────
    const balances = await getAccountingBalances({ clinicId });
    const balanceFor = (codePrefix: string, kind: "credit" | "debit" = "credit") =>
      balances
        .filter((b) => b.code.startsWith(codePrefix))
        .reduce((acc, b) => {
          const debit = Number(b.debit);
          const credit = Number(b.credit);
          // Receita (4.x) → saldo credor; Caixa/Recebíveis (1.x) → saldo devedor
          return acc + (kind === "credit" ? credit - debit : debit - credit);
        }, 0);

    const accRevenueAllTime = balanceFor("4", "credit");
    const accReceivables = balanceFor("1.1.2", "debit");
    const accCash = balanceFor("1.1.1", "debit");

    // ─── 5. Registros sem lançamento contábil (deveriam ter) ───────────────
    const orphanRecords = await db
      .select({
        id: financialRecordsTable.id,
        description: financialRecordsTable.description,
        amount: financialRecordsTable.amount,
        status: financialRecordsTable.status,
        transactionType: financialRecordsTable.transactionType,
      })
      .from(financialRecordsTable)
      .where(and(...[
        clinicFilter,
        eq(financialRecordsTable.type, "receita"),
        sql`${financialRecordsTable.status} NOT IN ('estornado','cancelado')`,
        isNull(financialRecordsTable.recognizedEntryId),
        isNull(financialRecordsTable.accountingEntryId),
        sql`(${financialRecordsTable.transactionType} IS NULL OR ${financialRecordsTable.transactionType} = ANY(${RECEIVABLE_TYPES}))`,
      ].filter(Boolean) as any[]))
      .limit(50);

    // ─── 6. P3: Recebíveis mensais antecipados (deferred_receivable) ───────
    // Esperados (operacional) = soma das `faturaPlano` ainda em aberto
    // (pendente/vencido/parcialmentePago) que possuem entry contábil
    // `deferred_receivable` postada e NÃO estornada.
    const [opDeferredOutstanding] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${financialRecordsTable.amount}::numeric), 0)`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(financialRecordsTable)
      .innerJoin(
        accountingJournalEntriesTable,
        and(
          eq(accountingJournalEntriesTable.sourceType, "financial_record"),
          eq(accountingJournalEntriesTable.sourceId, financialRecordsTable.id),
          eq(accountingJournalEntriesTable.eventType, "deferred_receivable"),
          eq(accountingJournalEntriesTable.status, "posted"),
          isNull(accountingJournalEntriesTable.reversalOfEntryId),
        ),
      )
      .where(and(...[
        clinicFilter,
        // Sprint Financeiro 13 (P4) — inclui também `faturaPlanoAvulsoMensal`
        // (faturas mensais estimadas de itens avulso do plano).
        sql`${financialRecordsTable.transactionType} IN ('faturaPlano','faturaPlanoAvulsoMensal')`,
        sql`${financialRecordsTable.status} IN ('pendente','vencido','parcialmentePago')`,
      ].filter(Boolean) as any[]));

    // Realizados (contábil) = saldo líquido VIVO em 1.1.2 dos
    // `deferred_receivable`. Sprint Financeiro 14 (Hardening) — agora
    // verdadeiramente líquido:
    //
    //   gross           = SUM(débito em 1.1.2 dos deferred_receivable posted)
    //   - allocated     = SUM(receivable_allocations.amount cujo
    //                      receivable_entry_id é um deferred_receivable posted)
    //                      → pagamentos que liquidaram parte do recebível
    //   - partialReversed = SUM(crédito em 1.1.2 dos
    //                       deferred_receivable_partial_reversal posted)
    //                       → estornos parciais (cancelamento c/ consumo)
    //
    // Reversões INTEGRAIS (`postReversal` do deferred) já viram o entry
    // original com `status='reversed'` → o filtro `status='posted'` no `gross`
    // já as exclui automaticamente.
    const [accDeferredGross] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${accountingJournalLinesTable.debitAmount}::numeric), 0)`,
      })
      .from(accountingJournalLinesTable)
      .innerJoin(
        accountingJournalEntriesTable,
        eq(accountingJournalEntriesTable.id, accountingJournalLinesTable.entryId),
      )
      .innerJoin(
        accountingAccountsTable,
        eq(accountingAccountsTable.id, accountingJournalLinesTable.accountId),
      )
      .where(and(...[
        clinicId == null ? null : eq(accountingJournalEntriesTable.clinicId, clinicId),
        eq(accountingJournalEntriesTable.eventType, "deferred_receivable"),
        eq(accountingJournalEntriesTable.status, "posted"),
        eq(accountingAccountsTable.code, "1.1.2"),
      ].filter(Boolean) as any[]));

    // Allocations contra deferred_receivable posted → reduzem 1.1.2 vivo.
    const [accDeferredAllocated] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${receivableAllocationsTable.amount}::numeric), 0)`,
      })
      .from(receivableAllocationsTable)
      .innerJoin(
        accountingJournalEntriesTable,
        eq(accountingJournalEntriesTable.id, receivableAllocationsTable.receivableEntryId),
      )
      .where(and(...[
        clinicId == null ? null : eq(accountingJournalEntriesTable.clinicId, clinicId),
        eq(accountingJournalEntriesTable.eventType, "deferred_receivable"),
        eq(accountingJournalEntriesTable.status, "posted"),
      ].filter(Boolean) as any[]));

    // Estornos PARCIAIS: D 2.1.1 / C 1.1.2 com eventType
    // `deferred_receivable_partial_reversal` — cancelam o saldo restante
    // sem desfazer o entry original (que segue posted).
    const [accDeferredPartialReversed] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${accountingJournalLinesTable.creditAmount}::numeric), 0)`,
      })
      .from(accountingJournalLinesTable)
      .innerJoin(
        accountingJournalEntriesTable,
        eq(accountingJournalEntriesTable.id, accountingJournalLinesTable.entryId),
      )
      .innerJoin(
        accountingAccountsTable,
        eq(accountingAccountsTable.id, accountingJournalLinesTable.accountId),
      )
      .where(and(...[
        clinicId == null ? null : eq(accountingJournalEntriesTable.clinicId, clinicId),
        eq(accountingJournalEntriesTable.eventType, "deferred_receivable_partial_reversal"),
        eq(accountingJournalEntriesTable.status, "posted"),
        eq(accountingAccountsTable.code, "1.1.2"),
      ].filter(Boolean) as any[]));

    const accDeferredOutstanding = {
      total:
        Number(accDeferredGross.total) -
        Number(accDeferredAllocated.total) -
        Number(accDeferredPartialReversed.total),
      gross: Number(accDeferredGross.total),
      allocated: Number(accDeferredAllocated.total),
      partialReversed: Number(accDeferredPartialReversed.total),
    };

    // ─── 7. Diffs ─────────────────────────────────────────────────────────
    const diffPendingReceivables = Number(opPendingReceivables.total) - accReceivables;
    const diffDeferredReceivables =
      Number(opDeferredOutstanding.total) - accDeferredOutstanding.total;
    const ok =
      orphanRecords.length === 0 &&
      Math.abs(diffPendingReceivables) < tolerance &&
      Math.abs(diffDeferredReceivables) < tolerance;

    res.json({
      ok,
      window: { from: fromStr, to: toStr },
      clinicId,
      operational: {
        revenueInWindow: Number(opRevenue.total),
        pendingReceivables: Number(opPendingReceivables.total),
        cashInWindow: Number(opCashIn.total),
        deferredReceivablesOutstanding: Number(opDeferredOutstanding.total),
        deferredReceivablesCount: Number(opDeferredOutstanding.count),
      },
      accounting: {
        revenueAllTime: accRevenueAllTime,
        receivablesBalance: accReceivables,
        cashBalance: accCash,
        // Sprint Financeiro 14 (Hardening) — saldo líquido vivo:
        // gross − allocated − partialReversed.
        deferredReceivablesOutstanding: accDeferredOutstanding.total,
        deferredReceivablesBreakdown: {
          gross: accDeferredOutstanding.gross,
          allocated: accDeferredOutstanding.allocated,
          partialReversed: accDeferredOutstanding.partialReversed,
        },
      },
      diffs: {
        pendingReceivables: Number(diffPendingReceivables.toFixed(2)),
        // P3: esperado (faturas em aberto com deferred_receivable) vs
        // realizado (saldo contábil 1.1.2 dos deferred_receivable postados).
        deferredReceivables: Number(diffDeferredReceivables.toFixed(2)),
      },
      orphans: {
        count: orphanRecords.length,
        sample: orphanRecords.slice(0, 10),
      },
      tolerance,
      note:
        "Receita operacional usa data efetiva da janela; receita contábil (revenueAllTime) é " +
        "snapshot acumulado e não deve ser comparada diretamente. Use o relatório /monthly-revenue " +
        "para a comparação por competência.",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
