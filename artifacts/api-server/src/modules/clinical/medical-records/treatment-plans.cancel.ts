/**
 * Sprint Financeiro 12 (P3) — Cancelamento de plano de tratamento.
 *
 * Estorna apenas as faturas mensais FUTURAS não consumidas (recebíveis
 * antecipados que ainda não viraram receita), preservando tudo que já foi
 * reconhecido. Cada `deferred_receivable` ainda vivo é estornado via
 * `postReversal` e a fatura correspondente é marcada como `cancelado`.
 *
 * Critério de "não consumido": `recognitionCreditsConsumed = 0` (nenhuma
 * sessão da fatura foi reconhecida) e `status NOT IN ('pago',
 * 'parcialmentePago', 'estornado', 'cancelado')`.
 *
 * **Fora do escopo (P3):**
 *   - Ressarcimento de meses já PAGOS (operação manual; alerta no retorno).
 *   - Recálculo de avulsos por preço de tabela (será P4 com `?recalculate=true`).
 *
 * Idempotente: chamar duas vezes não duplica estornos (verifica
 * `status='posted'` antes de `postReversal`).
 */
import { db } from "@workspace/db";
import {
  financialRecordsTable,
  treatmentPlansTable,
  accountingJournalEntriesTable,
} from "@workspace/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { postReversal } from "../../shared/accounting/accounting.service.js";
import { todayBRT } from "../../../utils/dateUtils.js";

export interface CancelTreatmentPlanInput {
  planId: number;
  reason: string;
  cancelledBy?: number | null;
  /** Override para testes — defaults para hoje BRT. */
  today?: string;
}

export interface CancelTreatmentPlanResult {
  planId: number;
  invoicesCancelled: number;
  reversalsPosted: number;
  paidInvoicesSkipped: number;
  /**
   * IDs de faturas que ficaram fora do estorno (já pagas/parcialmente
   * pagas). UI deve avisar que requerem operação manual de ressarcimento.
   */
  paidInvoiceIds: number[];
  reason: string;
}

const CANCELABLE_INVOICE_STATUSES = ["pendente", "vencido"];

export async function cancelTreatmentPlan(
  input: CancelTreatmentPlanInput,
): Promise<CancelTreatmentPlanResult> {
  const { planId, reason } = input;
  if (!reason || reason.trim().length < 3) {
    throw new Error("Motivo do cancelamento é obrigatório (mínimo 3 caracteres).");
  }

  const today = input.today ?? todayBRT();

  return db.transaction(async (tx) => {
    const [plan] = await tx
      .select()
      .from(treatmentPlansTable)
      .where(eq(treatmentPlansTable.id, planId))
      .limit(1);
    if (!plan) throw new Error(`Plano #${planId} não encontrado.`);
    if (plan.status === "cancelado") {
      // Idempotência: retorno consistente, sem trabalho.
      return {
        planId,
        invoicesCancelled: 0,
        reversalsPosted: 0,
        paidInvoicesSkipped: 0,
        paidInvoiceIds: [],
        reason: plan.cancellationReason ?? reason,
      };
    }

    // 1) Lista TODAS as faturas mensais vivas do plano.
    const allInvoices = await tx
      .select()
      .from(financialRecordsTable)
      .where(
        and(
          eq(financialRecordsTable.treatmentPlanId, planId),
          eq(financialRecordsTable.transactionType, "faturaPlano"),
        ),
      );

    let invoicesCancelled = 0;
    let reversalsPosted = 0;
    const paidInvoiceIds: number[] = [];

    for (const inv of allInvoices) {
      const consumed = inv.recognitionCreditsConsumed ?? 0;
      const isPaid =
        inv.status === "pago" ||
        inv.status === "parcialmentePago";

      // Já paga ou parcialmente paga → fora de escopo (ressarcimento manual).
      if (isPaid) {
        paidInvoiceIds.push(inv.id);
        continue;
      }

      // Status não cancelável (cancelado/estornado já tratados) → skip.
      if (!CANCELABLE_INVOICE_STATUSES.includes(inv.status as string)) {
        continue;
      }

      // Receita já parcialmente reconhecida nesta fatura → ainda cancelamos
      // o que sobrou do recebível antecipado, mas não estornamos as
      // fragmentas de receita (regime de competência: serviço prestado fica).
      // Em P3 puro o consumed=0 é o caso comum; consumed>0 só ocorre se
      // sessões avulsas foram realizadas (raro no fluxo P3, mas possível).
      // Estratégia: estorna o `deferred_receivable` apenas se a receita
      // restante > 0. Como o deferred_receivable é o lançamento ÚNICO do
      // valor total da fatura, o estorno integral pode "desfazer" algo já
      // consumido. Para o MVP, se consumed > 0, deixamos passar (será
      // tratado em ajuste manual + alerta no retorno).
      if (consumed > 0) {
        paidInvoiceIds.push(inv.id);
        continue;
      }

      // 2) Estorna o `deferred_receivable` ainda vivo (status='posted').
      const [deferred] = await tx
        .select({
          id: accountingJournalEntriesTable.id,
          clinicId: accountingJournalEntriesTable.clinicId,
        })
        .from(accountingJournalEntriesTable)
        .where(
          and(
            eq(accountingJournalEntriesTable.sourceType, "financial_record"),
            eq(accountingJournalEntriesTable.sourceId, inv.id),
            eq(accountingJournalEntriesTable.eventType, "deferred_receivable"),
            eq(accountingJournalEntriesTable.status, "posted"),
            isNull(accountingJournalEntriesTable.reversalOfEntryId),
          ),
        )
        .limit(1);

      if (deferred) {
        await postReversal(
          deferred.id,
          {
            clinicId: deferred.clinicId,
            entryDate: today,
            description:
              `Estorno por cancelamento do plano #${planId} — ` +
              `fatura #${inv.id} — motivo: ${reason}`,
            sourceType: "financial_record",
            sourceId: inv.id,
            patientId: inv.patientId,
            procedureId: inv.procedureId,
            financialRecordId: inv.id,
            createdBy: input.cancelledBy ?? null,
          } as any,
          tx as any,
        );
        reversalsPosted++;
      }

      // 3) Marca a fatura como cancelada (motivo persistido no journal entry
      // de estorno via `description` em postReversal).
      await tx
        .update(financialRecordsTable)
        .set({ status: "cancelado" })
        .where(eq(financialRecordsTable.id, inv.id));
      invoicesCancelled++;
    }

    // 4) Marca o plano como cancelado (campo + motivo + timestamp).
    await tx
      .update(treatmentPlansTable)
      .set({
        status: "cancelado",
        cancellationReason: reason,
        cancelledAt: new Date(),
        cancelledBy: input.cancelledBy ?? null,
      } as any)
      .where(eq(treatmentPlansTable.id, planId));

    return {
      planId,
      invoicesCancelled,
      reversalsPosted,
      paidInvoicesSkipped: paidInvoiceIds.length,
      paidInvoiceIds,
      reason,
    };
  });
}
