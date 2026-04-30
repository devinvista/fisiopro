/**
 * Reconhecimento de receita de fatura mensal de plano de tratamento.
 *
 * ─── Sprint Financeiro 10 (P2) ─── Reconhecimento FRACIONADO ──────────────
 *
 * **Modelo NOVO (fracionado):**
 *   • A fatura mensal nasce `pendente` na materialização, sem journal.
 *   • Na 1ª confirmação de sessão (compareceu/concluido) do mês:
 *       1. Snapshota `recognitionCreditsTotal` = nº de appointments
 *          materializados (status NOT IN 'cancelado') ligados à fatura.
 *       2. Posta uma fragmenta `share = amount / total` (D Recebíveis ou
 *          D Adiantamentos / C Receita).
 *       3. Acumula `recognizedAmount` e incrementa `recognitionCreditsConsumed`.
 *   • Cada confirmação subsequente repete (2)+(3) — uma fragmenta por sessão.
 *   • A última fragmenta (consumed+1 == total) recebe o resíduo de centavos
 *     para garantir que a soma das fragmentas == amount exato.
 *   • Sessões não consumidas no fim do mês têm o resíduo apropriado pelo job
 *     `endOfMonthRevenueClosure` (cláusula contratual de reagendamento
 *     intramensal — receita do mês contratada não retorna).
 *
 * **Idempotência:**
 *   • Por sessão: busca journal entry existente para
 *     `(financialRecordId, appointmentId, eventType IN ('receivable_revenue',
 *     'wallet_usage_revenue'), reversalOfEntryId IS NULL)` antes de postar.
 *   • Por fatura: advisory lock `pg_advisory_xact_lock(invoiceId)` serializa
 *     reconhecimentos concorrentes da MESMA fatura.
 *
 * **Modelo LEGADO (preservado, sem migração):**
 *   • Faturas com `recognizedEntryId IS NOT NULL` e
 *     `recognitionCreditsTotal IS NULL` foram reconhecidas integralmente
 *     antes do P2. O serviço detecta esse estado e retorna no-op — não
 *     fragmentamos nem re-reconhecemos.
 */
import { db } from "@workspace/db";
import {
  appointmentsTable,
  financialRecordsTable,
  proceduresTable,
  accountingJournalEntriesTable,
} from "@workspace/db";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  postReceivableRevenue,
  postWalletUsage,
  resolveAccountCodeById,
} from "../../shared/accounting/accounting.service.js";

type Tx = typeof db;

export interface RecognizeRevenueInput {
  monthlyInvoiceId: number;
  appointmentId: number;
  appointmentDate: string;
}

export interface RecognizeRevenueResult {
  recognized: boolean;
  reason?: string;
  entryId?: number;
  /** Valor da fragmenta postada (`undefined` quando recognized=false). */
  shareAmount?: number;
  /** Pool snapshotado nesta fatura (após o bootstrap, se houve). */
  recognitionCreditsTotal?: number;
  /** Quantos créditos já foram apropriados nesta fatura (após o update). */
  recognitionCreditsConsumed?: number;
}

const RECOGNITION_EVENT_TYPES = [
  "receivable_revenue",
  "wallet_usage_revenue",
] as const;

/** Arredonda para 2 casas decimais ao centavo (half-away-from-zero). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Conta appointments materializados ligados a esta fatura mensal e elegíveis
 * a consumir um crédito (qualquer status exceto `cancelado`). Faltas contam
 * pois geram crédito de reposição que será consumido depois.
 */
async function countInvoiceCredits(tx: Tx, monthlyInvoiceId: number): Promise<number> {
  const [{ total }] = (await tx.execute(
    sql`SELECT COUNT(*)::int AS total
        FROM ${appointmentsTable}
        WHERE ${appointmentsTable.monthlyInvoiceId} = ${monthlyInvoiceId}
          AND ${appointmentsTable.status} <> 'cancelado'`,
  )) as unknown as Array<{ total: number }>;
  return Number(total ?? 0);
}

/**
 * Busca uma fragmenta de reconhecimento já postada para esta sessão nesta
 * fatura, garantindo idempotência por (fatura, sessão).
 */
async function findExistingFragmentForAppointment(
  tx: Tx,
  invoiceId: number,
  appointmentId: number,
): Promise<{ id: number; amount: string } | null> {
  const rows = await tx
    .select({
      id: accountingJournalEntriesTable.id,
      amount: sql<string>`(
        SELECT COALESCE(SUM(debit_amount), 0)::text
        FROM accounting_journal_lines
        WHERE entry_id = ${accountingJournalEntriesTable.id}
      )`,
    })
    .from(accountingJournalEntriesTable)
    .where(
      and(
        eq(accountingJournalEntriesTable.financialRecordId, invoiceId),
        eq(accountingJournalEntriesTable.appointmentId, appointmentId),
        inArray(
          accountingJournalEntriesTable.eventType,
          RECOGNITION_EVENT_TYPES as unknown as string[],
        ),
        isNull(accountingJournalEntriesTable.reversalOfEntryId),
      ),
    )
    .limit(1);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Reconhece UMA fragmenta de receita da fatura mensal correspondente a uma
 * sessão concluída. Idempotente — chamadas repetidas para o mesmo
 * `(monthlyInvoiceId, appointmentId)` são no-op.
 *
 * Para o modelo legado (faturas anteriores ao P2 já reconhecidas integralmente)
 * retorna `{ recognized: false, reason: 'Receita legada já reconhecida' }`.
 *
 * O parâmetro `_tx` é mantido por compatibilidade retroativa com o callsite
 * anterior em `appointments.billing.ts` mas é ignorado — a função sempre
 * gerencia sua própria transação para acoplar o advisory lock corretamente.
 */
export async function recognizeMonthlyInvoiceRevenuePartial(
  input: RecognizeRevenueInput,
  _tx: Tx = db,
): Promise<RecognizeRevenueResult> {
  return db.transaction(async (tx) => {
    // Serializa reconhecimentos concorrentes da MESMA fatura. Sessões de
    // faturas diferentes não se bloqueiam entre si.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${input.monthlyInvoiceId}::bigint)`,
    );

    const [invoice] = await tx
      .select()
      .from(financialRecordsTable)
      .where(eq(financialRecordsTable.id, input.monthlyInvoiceId))
      .limit(1);

    if (!invoice) {
      return { recognized: false, reason: "Fatura não encontrada" };
    }

    if (invoice.transactionType !== "faturaPlano") {
      return { recognized: false, reason: "Fatura não é faturaPlano" };
    }

    if (invoice.status === "cancelado" || invoice.status === "estornado") {
      return { recognized: false, reason: `Fatura em status ${invoice.status}` };
    }

    const amount = Number(invoice.amount);
    if (amount <= 0) {
      return { recognized: false, reason: "Valor zero" };
    }

    // ── Compatibilidade com modelo LEGADO ──────────────────────────────────
    // Faturas reconhecidas integralmente antes do P2 (sentinel populado e
    // pool de créditos NÃO snapshotado) seguem o modelo antigo. NÃO migramos
    // automaticamente — o B12 ainda sabe estornar entry inteira nesse caso.
    if (invoice.recognizedEntryId != null && invoice.recognitionCreditsTotal == null) {
      return {
        recognized: false,
        reason: "Receita já reconhecida (modelo legado integral)",
        entryId: invoice.recognizedEntryId,
      };
    }

    // ── Bootstrap do pool ──────────────────────────────────────────────────
    let creditsTotal = invoice.recognitionCreditsTotal;
    if (creditsTotal == null) {
      const counted = await countInvoiceCredits(tx as unknown as Tx, invoice.id);
      // Mínimo 1: garantimos que esta sessão (que nos chamou) ao menos esteja
      // contada. Cobre cenário de borda em que o COUNT da própria sessão
      // ainda não materializou (race com o INSERT do appointment).
      creditsTotal = Math.max(1, counted);
    }

    // ── Idempotência por (fatura, sessão) ──────────────────────────────────
    const existingFragment = await findExistingFragmentForAppointment(
      tx as unknown as Tx,
      invoice.id,
      input.appointmentId,
    );
    if (existingFragment) {
      return {
        recognized: false,
        reason: "Fragmenta já postada para esta sessão",
        entryId: existingFragment.id,
        shareAmount: Number(existingFragment.amount),
        recognitionCreditsTotal: creditsTotal,
        recognitionCreditsConsumed: invoice.recognitionCreditsConsumed,
      };
    }

    const consumed = invoice.recognitionCreditsConsumed ?? 0;
    if (consumed >= creditsTotal) {
      // Pool já esgotado e esta sessão ainda não tem fragmenta — significa
      // que o pool foi estimado por baixo (sessão extra criada após bootstrap).
      // Expande o pool em +1 para acomodar e procede.
      creditsTotal = consumed + 1;
    }

    const recognized = Number(invoice.recognizedAmount ?? 0);
    const remaining = round2(amount - recognized);
    if (remaining <= 0) {
      return {
        recognized: false,
        reason: "Receita já totalmente apropriada",
        recognitionCreditsTotal: creditsTotal,
        recognitionCreditsConsumed: consumed,
      };
    }

    // ── Calcula o share desta fragmenta ────────────────────────────────────
    // Última fragmenta absorve o resíduo de centavos para zerar saldo.
    const isLastFragment = consumed + 1 >= creditsTotal;
    let share = isLastFragment ? remaining : round2(amount / creditsTotal);
    if (share > remaining) share = remaining;
    if (share <= 0) {
      return {
        recognized: false,
        reason: "Share calculado <= 0",
        recognitionCreditsTotal: creditsTotal,
        recognitionCreditsConsumed: consumed,
      };
    }

    // ── Sub-conta de receita pelo procedimento (4.1.2 default fracionado) ─
    let revenueAccountCode = "4.1.2";
    if (invoice.procedureId) {
      const [proc] = await tx
        .select({ accountingAccountId: (proceduresTable as any).accountingAccountId })
        .from(proceduresTable)
        .where(eq(proceduresTable.id, invoice.procedureId))
        .limit(1);
      revenueAccountCode = await resolveAccountCodeById(
        proc?.accountingAccountId ?? null,
        "4.1.2",
        invoice.clinicId ?? null,
      );
    }

    const fragmentNumber = consumed + 1;
    const baseEntry = {
      clinicId: invoice.clinicId ?? null,
      entryDate: input.appointmentDate,
      amount: share,
      description:
        `Receita parcial ${fragmentNumber}/${creditsTotal} — ` +
        `fatura #${invoice.id} — sessão #${input.appointmentId} — ${invoice.description}`,
      sourceType: "financial_record" as const,
      sourceId: invoice.id,
      patientId: invoice.patientId ?? null,
      appointmentId: input.appointmentId,
      procedureId: invoice.procedureId ?? null,
      financialRecordId: invoice.id,
      revenueAccountCode,
    };

    let entryId: number;
    if (invoice.status === "pago") {
      // Fatura já paga via postCashAdvance (Adiantamentos). Cada fragmenta
      // consome do passivo. D 2.1.1 / C 4.1.2.
      const entry = await postWalletUsage(baseEntry, tx as any);
      entryId = entry.id;
    } else {
      // Fatura pendente. Cada fragmenta gera recebível + receita.
      // D 1.1.2 / C 4.1.2.
      const entry = await postReceivableRevenue(baseEntry, tx as any);
      entryId = entry.id;
    }

    const newRecognized = round2(recognized + share);
    const newConsumed = consumed + 1;

    await tx
      .update(financialRecordsTable)
      .set({
        recognizedAmount: newRecognized.toFixed(2),
        recognitionCreditsTotal: creditsTotal,
        recognitionCreditsConsumed: newConsumed,
        // Sentinel agregado: aponta para a 1ª fragmenta. Mantém compatibilidade
        // com leitura antiga (cascade de pagamento, conciliação) que assume
        // 1 entry por fatura. Para estorno fracionado o B12 busca por
        // (financialRecordId, appointmentId).
        recognizedEntryId: invoice.recognizedEntryId ?? entryId,
        accountingEntryId: entryId,
      })
      .where(eq(financialRecordsTable.id, invoice.id));

    return {
      recognized: true,
      entryId,
      shareAmount: share,
      recognitionCreditsTotal: creditsTotal,
      recognitionCreditsConsumed: newConsumed,
    };
  });
}

/**
 * Alias retrocompatível para call sites pré-P2. Delega para o algoritmo
 * fracionado — faturas legadas (sentinel populado, pool NULL) continuam
 * sendo no-op como antes.
 *
 * @deprecated Use `recognizeMonthlyInvoiceRevenuePartial` em código novo.
 */
export async function recognizeMonthlyInvoiceRevenue(
  input: RecognizeRevenueInput,
  _tx: Tx = db,
): Promise<RecognizeRevenueResult> {
  return recognizeMonthlyInvoiceRevenuePartial(input, _tx);
}
