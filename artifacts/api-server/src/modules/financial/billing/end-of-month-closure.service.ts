/**
 * Sprint Financeiro 10 (P2) — Apropriação de resíduo no fim do mês.
 *
 * Para cada `faturaPlano` no MODELO FRACIONADO em que sobraram créditos não
 * consumidos no fim do mês (paciente não compareceu a todas as sessões),
 * apropria o saldo restante numa única entry de fechamento.
 *
 * Justificativa contratual: cláusula `REAGENDAMENTO_INTRAMENSAL` (P5) —
 * sessões não realizadas dentro do mês não geram crédito futuro nem reembolso;
 * a receita do mês é integral conforme contratada.
 *
 * **Idempotência:**
 *   • Por fatura: TX dedicada + `pg_advisory_xact_lock(invoiceId)`.
 *   • Por estado: skip se `recognitionCreditsConsumed >= recognitionCreditsTotal`
 *     ou `residual <= 0,005` (<= meio centavo).
 *
 * Após o fechamento, a fatura tem `recognizedAmount = amount` e
 * `recognitionCreditsConsumed = recognitionCreditsTotal` — qualquer chamada
 * subsequente do reconhecimento fracionado será no-op.
 */
import { db } from "@workspace/db";
import {
  financialRecordsTable,
  proceduresTable,
  accountingJournalEntriesTable,
} from "@workspace/db";
import { and, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import { lastDayOfMonth, monthDateRangeBRT, nowBRT } from "../../../utils/dateUtils.js";
import {
  postReceivableRevenue,
  postWalletUsage,
  resolveAccountCodeById,
} from "../../shared/accounting/accounting.service.js";

export interface EndOfMonthClosureResult {
  closed: number;
  skipped: number;
  errors: number;
  residualTotal: string;
  details: Array<{
    invoiceId: number;
    status: "closed" | "skipped" | "error";
    residual?: number;
    reason?: string;
  }>;
}

export interface RunEndOfMonthClosureInput {
  /** Sobrescreve o "hoje" para testes (ISO YYYY-MM-DD em BRT). */
  today?: string;
  /** "scheduler" | "manual" | "test" — só vai pro log. */
  triggeredBy: string;
  /** Quando true, executa mesmo que `today` não seja o último dia do mês. */
  forceRun?: boolean;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function runEndOfMonthRevenueClosure(
  input: RunEndOfMonthClosureInput,
): Promise<EndOfMonthClosureResult> {
  const result: EndOfMonthClosureResult = {
    closed: 0,
    skipped: 0,
    errors: 0,
    residualTotal: "0.00",
    details: [],
  };

  // Determina o "hoje" e checa se é o último dia do mês BRT.
  let year: number, month: number, day: number;
  if (input.today) {
    const [y, m, d] = input.today.split("-").map(Number);
    year = y; month = m; day = d;
  } else {
    const now = nowBRT();
    year = now.year; month = now.month; day = now.day;
  }
  const lastDay = lastDayOfMonth(year, month);
  if (!input.forceRun && day !== lastDay) {
    return result; // Não é o último dia — no-op silencioso.
  }

  const { startDate, endDate } = monthDateRangeBRT(year, month);

  // Busca faturas no MODELO FRACIONADO com créditos restantes no mês corrente.
  // Sprint Financeiro 14 (Hardening) — agora inclui também `faturaPlanoAvulsoMensal`
  // (P4): faturas mensais estimadas de itens avulsos do plano.
  const candidates = await db
    .select({
      id: financialRecordsTable.id,
      clinicId: financialRecordsTable.clinicId,
      patientId: financialRecordsTable.patientId,
      procedureId: financialRecordsTable.procedureId,
      description: financialRecordsTable.description,
      amount: financialRecordsTable.amount,
      recognizedAmount: financialRecordsTable.recognizedAmount,
      recognitionCreditsTotal: financialRecordsTable.recognitionCreditsTotal,
      recognitionCreditsConsumed: financialRecordsTable.recognitionCreditsConsumed,
      status: financialRecordsTable.status,
      planMonthRef: financialRecordsTable.planMonthRef,
      transactionType: financialRecordsTable.transactionType,
    })
    .from(financialRecordsTable)
    .where(and(
      inArray(
        financialRecordsTable.transactionType,
        ["faturaPlano", "faturaPlanoAvulsoMensal"],
      ),
      notInArray(financialRecordsTable.status, ["cancelado", "estornado"]),
      isNotNull(financialRecordsTable.recognitionCreditsTotal),
      // consumed < total
      sql`${financialRecordsTable.recognitionCreditsConsumed} < ${financialRecordsTable.recognitionCreditsTotal}`,
      sql`${financialRecordsTable.planMonthRef} >= ${startDate}::date`,
      sql`${financialRecordsTable.planMonthRef} <= ${endDate}::date`,
    ));

  let totalResidual = 0;

  for (const inv of candidates) {
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${inv.id}::bigint)`);

        // Re-lê dentro do lock (estado fresco).
        const [invoice] = await tx
          .select()
          .from(financialRecordsTable)
          .where(eq(financialRecordsTable.id, inv.id))
          .limit(1);
        if (!invoice) {
          result.skipped++;
          result.details.push({ invoiceId: inv.id, status: "skipped", reason: "Fatura sumiu" });
          return;
        }
        if (invoice.status === "cancelado" || invoice.status === "estornado") {
          result.skipped++;
          result.details.push({ invoiceId: inv.id, status: "skipped", reason: `status ${invoice.status}` });
          return;
        }
        if (invoice.recognitionCreditsTotal == null) {
          result.skipped++;
          result.details.push({ invoiceId: inv.id, status: "skipped", reason: "sem pool de créditos (registro histórico)" });
          return;
        }
        const consumed = invoice.recognitionCreditsConsumed ?? 0;
        if (consumed >= invoice.recognitionCreditsTotal) {
          result.skipped++;
          result.details.push({ invoiceId: inv.id, status: "skipped", reason: "já consumido" });
          return;
        }

        const amount = Number(invoice.amount);
        const recognized = Number(invoice.recognizedAmount ?? 0);
        const residual = round2(amount - recognized);
        if (residual <= 0.005) {
          // Saldo desprezível — apenas marca como consumido para evitar loop.
          await tx
            .update(financialRecordsTable)
            .set({ recognitionCreditsConsumed: invoice.recognitionCreditsTotal })
            .where(eq(financialRecordsTable.id, invoice.id));
          result.skipped++;
          result.details.push({ invoiceId: inv.id, status: "skipped", reason: "residual ~0" });
          return;
        }

        // Sub-conta de receita pelo procedimento.
        // Sprint Financeiro 14 (Hardening) — default depende do tipo:
        //   - `faturaPlano` (mensalidade) → 4.1.2 (receita de pacotes/mensalidades)
        //   - `faturaPlanoAvulsoMensal` (avulso do plano) → 4.1.1 (receita por sessão)
        const defaultRevenueCode =
          invoice.transactionType === "faturaPlanoAvulsoMensal"
            ? "4.1.1"
            : "4.1.2";
        let revenueAccountCode = defaultRevenueCode;
        if (invoice.procedureId) {
          const [proc] = await tx
            .select({ accountingAccountId: (proceduresTable as any).accountingAccountId })
            .from(proceduresTable)
            .where(eq(proceduresTable.id, invoice.procedureId))
            .limit(1);
          revenueAccountCode = await resolveAccountCodeById(
            proc?.accountingAccountId ?? null,
            defaultRevenueCode,
            invoice.clinicId ?? null,
          );
        }

        const remainingCredits = invoice.recognitionCreditsTotal - consumed;
        const baseEntry = {
          clinicId: invoice.clinicId ?? null,
          entryDate: endDate,
          amount: residual,
          description:
            `Apropriação de resíduo do mês — fatura #${invoice.id} ` +
            `(${remainingCredits} crédito(s) não consumido(s)) — ${invoice.description}`,
          sourceType: "financial_record" as const,
          sourceId: invoice.id,
          patientId: invoice.patientId ?? null,
          procedureId: invoice.procedureId ?? null,
          financialRecordId: invoice.id,
          revenueAccountCode,
          eventType: "end_of_month_closure",
        };

        // Detecção de adiantamentos creditados em 2.1.1:
        //
        //   • P3 (deferred_receivable): aceite postou D 1.1.2 / C 2.1.1.
        //     O recebível e o adiantamento já existem; o resíduo consome 2.1.1.
        //
        //   • cashAdvance (sem deferred_receivable): fatura paga antes de qualquer
        //     sessão via postCashAdvance → D 1.1.1 / C 2.1.1. O adiantamento
        //     também existe e deve ser consumido pelo resíduo.
        //
        //   • Sem adiantamento (fatura pendente, sem cashAdvance): não há saldo
        //     em 2.1.1. O resíduo cria recebível + receita (D 1.1.2 / C 4.1.x).
        //
        // NÃO usamos `invoice.status === "pago"` como proxy — faturas pagas via
        // fluxo antigo (settlement sem adiantamento prévio) não têm 2.1.1 creditado.
        const [hasDeferred] = await tx
          .select({ id: accountingJournalEntriesTable.id })
          .from(accountingJournalEntriesTable)
          .where(and(
            eq(accountingJournalEntriesTable.sourceType, "financial_record"),
            eq(accountingJournalEntriesTable.sourceId, invoice.id),
            eq(accountingJournalEntriesTable.eventType, "deferred_receivable"),
            eq(accountingJournalEntriesTable.status, "posted"),
          ))
          .limit(1);
        const isP3Mode = !!hasDeferred;

        const [hasCashAdvance] = await tx
          .select({ id: accountingJournalEntriesTable.id })
          .from(accountingJournalEntriesTable)
          .where(and(
            eq(accountingJournalEntriesTable.sourceType, "financial_record"),
            eq(accountingJournalEntriesTable.sourceId, invoice.id),
            inArray(accountingJournalEntriesTable.eventType, ["cash_advance_receipt", "cash_advance_avulso"]),
            eq(accountingJournalEntriesTable.status, "posted"),
          ))
          .limit(1);

        // hasAdvances = 2.1.1 definitivamente creditado via deferred ou cashAdvance.
        const hasAdvances = isP3Mode || !!hasCashAdvance;

        let entryId: number;
        if (hasAdvances) {
          // 2.1.1 tem saldo → consome do adiantamento (D 2.1.1 / C 4.1.x).
          const entry = await postWalletUsage(baseEntry as any, tx as any);
          entryId = entry.id;
        } else {
          // Sem adiantamento → cria recebível + receita (D 1.1.2 / C 4.1.x).
          const entry = await postReceivableRevenue(baseEntry as any, tx as any);
          entryId = entry.id;
        }

        await tx
          .update(financialRecordsTable)
          .set({
            recognizedAmount: amount.toFixed(2),
            recognitionCreditsConsumed: invoice.recognitionCreditsTotal,
            recognizedEntryId: invoice.recognizedEntryId ?? entryId,
            accountingEntryId: entryId,
          })
          .where(eq(financialRecordsTable.id, invoice.id));

        totalResidual += residual;
        result.closed++;
        result.details.push({ invoiceId: invoice.id, status: "closed", residual });
      });
    } catch (err) {
      result.errors++;
      result.details.push({
        invoiceId: inv.id,
        status: "error",
        reason: err instanceof Error ? err.message : String(err),
      });
      console.error(
        `[endOfMonthRevenueClosure] falha ao fechar fatura #${inv.id}:`,
        err,
      );
    }
  }

  result.residualTotal = totalResidual.toFixed(2);
  return result;
}
