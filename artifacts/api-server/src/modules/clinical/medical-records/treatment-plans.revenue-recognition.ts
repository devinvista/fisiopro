/**
 * Reconhecimento de receita de fatura mensal de plano de tratamento.
 *
 * ─── Modelo "1ª Sessão = 100%" ────────────────────────────────────────────
 *
 * **Princípio contábil:**
 *   A mensalidade é uma receita de competência do mês contratado. No momento
 *   em que o paciente comparece pela primeira vez no mês (1ª sessão confirmada),
 *   toda a receita daquele mês é reconhecida integralmente.
 *   Sessões subsequentes são serviço entregue já coberto pela receita reconhecida.
 *
 * **Fluxo:**
 *   • A fatura mensal nasce `pendente` na materialização, sem journal.
 *   • Na 1ª confirmação de sessão (compareceu/concluido) do mês:
 *       1. Snapshota `recognitionCreditsTotal` = nº de appointments
 *          materializados (status NOT IN 'cancelado') ligados à fatura.
 *       2. Posta `share = remaining = amount` inteiro (D Adiantamentos / C Receita
 *          em modo P3, ou D Recebíveis / C Receita em modo legado pendente).
 *       3. Define `recognizedAmount = amount` e `recognitionCreditsConsumed = 1`.
 *   • Cada confirmação subsequente é no-op (remaining = 0, retorna cedo).
 *   • Cancelamentos/faltas NÃO estornam receita — geram crédito de sessão
 *     para o paciente, vinculado ao fato gerador original.
 *   • `endOfMonthRevenueClosure` é no-op para faturas já 100% reconhecidas;
 *     funciona como safety net para faturas sem nenhuma sessão confirmada
 *     (residual reconhecido ao final do mês por competência).
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
 *     `recognitionCreditsTotal IS NULL` foram reconhecidas antes desta versão.
 *     O serviço detecta esse estado e retorna no-op — não re-reconhecemos.
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

type ApptRow = { id: number; date: string };

/**
 * Busca todos os appointments não-cancelados ligados a uma `faturaPlano`,
 * ordenados por data e id. Esses são os "slots" a receber fragmentas de receita.
 * Faltas contam (o paciente tem direito à sessão; crédito de reposição não
 * altera a receita do mês já contabilizada).
 */
async function fetchInvoiceAppointments(
  tx: Tx,
  invoice: { id: number; transactionType: string | null; treatmentPlanProcedureId: number | null; planMonthRef: string | null },
): Promise<ApptRow[]> {
  if (
    invoice.transactionType === "faturaPlanoAvulsoMensal" &&
    invoice.treatmentPlanProcedureId &&
    invoice.planMonthRef
  ) {
    const monthStart = invoice.planMonthRef.length >= 10
      ? invoice.planMonthRef.slice(0, 10)
      : `${invoice.planMonthRef.slice(0, 7)}-01`;
    const rows = (await tx.execute(
      sql`SELECT id, date::text AS date
          FROM ${appointmentsTable}
          WHERE ${appointmentsTable.treatmentPlanProcedureId} = ${invoice.treatmentPlanProcedureId}
            AND ${appointmentsTable.date} >= ${monthStart}::date
            AND ${appointmentsTable.date} <  (${monthStart}::date + INTERVAL '1 month')
            AND ${appointmentsTable.status} <> 'cancelado'
          ORDER BY date ASC, id ASC`,
    )) as unknown as ApptRow[];
    return Array.isArray(rows) ? rows : (rows as any).rows ?? [];
  }

  const rows = await tx
    .select({ id: appointmentsTable.id, date: appointmentsTable.date })
    .from(appointmentsTable)
    .where(
      and(
        eq(appointmentsTable.monthlyInvoiceId, invoice.id),
        sql`${appointmentsTable.status} <> 'cancelado'`,
      ),
    )
    .orderBy(sql`${appointmentsTable.date} ASC, ${appointmentsTable.id} ASC`);
  return rows.map(r => ({ id: r.id, date: String(r.date) }));
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
 * Reconhece receita proporcional por sessão, disparada na 1ª confirmação do mês.
 *
 * Modelo "1ª sessão dispara tudo":
 *   • Na 1ª confirmação (consumed === 0): busca TODAS as sessões não-canceladas
 *     do mês, cria uma fragmenta de `amount / N` para CADA uma (datada na data
 *     de cada sessão), e marca a fatura como 100% reconhecida.
 *   • Confirmações subsequentes encontram a fragmenta já existente via
 *     idempotência (findExistingFragmentForAppointment) → no-op.
 *   • Cancelamentos/faltas posteriores NÃO estornam — créditos de sessão
 *     garantem o direito do paciente sem impacto no P&L do mês.
 *
 * Idempotência dupla:
 *   • Por sessão: `(financialRecordId, appointmentId)` → no-op se já postado.
 *   • Por fatura: `pg_advisory_xact_lock(invoiceId)` → serializa concorrência.
 *
 * Modelo LEGADO: faturas com `recognizedEntryId IS NOT NULL` e
 *   `recognitionCreditsTotal IS NULL` são no-op (não re-reconhecemos).
 *
 * O parâmetro `_tx` é mantido por retrocompatibilidade mas ignorado — a
 * função sempre gerencia sua própria transação para acoplar o advisory lock.
 */
export async function recognizeMonthlyInvoiceRevenuePartial(
  input: RecognizeRevenueInput,
  _tx: Tx = db,
): Promise<RecognizeRevenueResult> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${input.monthlyInvoiceId}::bigint)`,
    );

    const [invoice] = await tx
      .select()
      .from(financialRecordsTable)
      .where(eq(financialRecordsTable.id, input.monthlyInvoiceId))
      .limit(1);

    if (!invoice) return { recognized: false, reason: "Fatura não encontrada" };

    if (
      invoice.transactionType !== "faturaPlano" &&
      invoice.transactionType !== "faturaPlanoAvulsoMensal"
    ) {
      return { recognized: false, reason: "Fatura não é faturaPlano nem faturaPlanoAvulsoMensal" };
    }

    if (invoice.status === "cancelado" || invoice.status === "estornado") {
      return { recognized: false, reason: `Fatura em status ${invoice.status}` };
    }

    const amount = Number(invoice.amount);
    if (amount <= 0) return { recognized: false, reason: "Valor zero" };

    // ── Modelo LEGADO: já reconhecido integralmente antes desta versão ──────
    if (invoice.recognizedEntryId != null && invoice.recognitionCreditsTotal == null) {
      return {
        recognized: false,
        reason: "Receita já reconhecida (modelo legado integral)",
        entryId: invoice.recognizedEntryId,
      };
    }

    // ── Idempotência por sessão: fragmenta já existe para este appointment? ─
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
        recognitionCreditsTotal: invoice.recognitionCreditsTotal ?? undefined,
        recognitionCreditsConsumed: invoice.recognitionCreditsConsumed ?? undefined,
      };
    }

    // ── Se consumed > 0 a fatura foi reconhecida em bulk na 1ª sessão ───────
    // Esta sessão não tem fragmenta (criada depois do bulk? edge case).
    // Retorna no-op — a receita do mês já foi 100% reconhecida.
    const consumed = invoice.recognitionCreditsConsumed ?? 0;
    if (consumed > 0) {
      return {
        recognized: false,
        reason: "Receita já reconhecida em bulk na 1ª sessão do mês",
        recognitionCreditsTotal: invoice.recognitionCreditsTotal ?? undefined,
        recognitionCreditsConsumed: consumed,
      };
    }

    // ── 1ª sessão do mês: dispara reconhecimento proporcional para TODAS ────
    // Busca todas as sessões não-canceladas do mês ligadas a esta fatura.
    let allAppointments = await fetchInvoiceAppointments(
      tx as unknown as Tx,
      {
        id: invoice.id,
        transactionType: invoice.transactionType,
        treatmentPlanProcedureId: invoice.treatmentPlanProcedureId ?? null,
        planMonthRef: invoice.planMonthRef ?? null,
      },
    );

    // Safety: garante que a sessão disparadora está na lista (race condition).
    if (!allAppointments.some(a => a.id === input.appointmentId)) {
      allAppointments.push({ id: input.appointmentId, date: input.appointmentDate });
      allAppointments.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
    }

    const total = Math.max(1, allAppointments.length);
    const shareBase = round2(amount / total);

    // ── Sub-conta de receita e modo P3 ────────────────────────────────────
    let revenueAccountCode = "4.1.2";
    if (invoice.procedureId) {
      const [proc] = await tx
        .select({ accountingAccountId: proceduresTable.accountingAccountId })
        .from(proceduresTable)
        .where(eq(proceduresTable.id, invoice.procedureId))
        .limit(1);
      revenueAccountCode = await resolveAccountCodeById(
        proc?.accountingAccountId ?? null,
        "4.1.2",
        invoice.clinicId ?? null,
      );
    }

    // P3: aceite já postou D 1.1.2 / C 2.1.1 → fragmentas consomem adiantamento.
    // Legado pendente: fragmentas geram recebível + receita (D 1.1.2 / C 4.1.2).
    const [hasDeferred] = await tx
      .select({ id: accountingJournalEntriesTable.id })
      .from(accountingJournalEntriesTable)
      .where(
        and(
          eq(accountingJournalEntriesTable.sourceType, "financial_record"),
          eq(accountingJournalEntriesTable.sourceId, invoice.id),
          eq(accountingJournalEntriesTable.eventType, "deferred_receivable"),
          eq(accountingJournalEntriesTable.status, "posted"),
        ),
      )
      .limit(1);
    const isP3Mode = !!hasDeferred;

    // ── Cria uma fragmenta proporcional para cada sessão do mês ─────────────
    let firstEntryId: number | null = null;
    let triggerEntryId: number | null = null;
    let totalPosted = 0;

    for (let i = 0; i < allAppointments.length; i++) {
      const appt = allAppointments[i];
      const isLast = i === allAppointments.length - 1;
      // Última fragmenta absorve centavos de arredondamento.
      const share = isLast ? round2(amount - totalPosted) : shareBase;
      if (share <= 0) continue;

      const entryBase = {
        clinicId: invoice.clinicId ?? null,
        entryDate: appt.date,             // competência = data da PRÓPRIA sessão
        amount: share,
        description:
          `Receita ${i + 1}/${total} — fatura #${invoice.id} — sessão #${appt.id} — ${invoice.description}`,
        sourceType: "financial_record" as const,
        sourceId: invoice.id,
        patientId: invoice.patientId ?? null,
        appointmentId: appt.id,           // vinculada à sessão individual
        procedureId: invoice.procedureId ?? null,
        financialRecordId: invoice.id,
        revenueAccountCode,
      };

      let entryId: number;
      if (isP3Mode || invoice.status === "pago") {
        const entry = await postWalletUsage(entryBase, tx as any);
        entryId = entry.id;
      } else {
        const entry = await postReceivableRevenue(entryBase, tx as any);
        entryId = entry.id;
      }

      if (firstEntryId === null) firstEntryId = entryId;
      if (appt.id === input.appointmentId) triggerEntryId = entryId;
      totalPosted = round2(totalPosted + share);
    }

    // ── Atualiza fatura: 100% reconhecida, consumed = total ─────────────────
    await tx
      .update(financialRecordsTable)
      .set({
        recognizedAmount: amount.toFixed(2),
        recognitionCreditsTotal: total,
        recognitionCreditsConsumed: total,
        recognizedEntryId: invoice.recognizedEntryId ?? firstEntryId,
        accountingEntryId: triggerEntryId ?? firstEntryId ?? invoice.accountingEntryId,
      })
      .where(eq(financialRecordsTable.id, invoice.id));

    return {
      recognized: true,
      entryId: triggerEntryId ?? firstEntryId!,
      shareAmount: shareBase,
      recognitionCreditsTotal: total,
      recognitionCreditsConsumed: total,
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
