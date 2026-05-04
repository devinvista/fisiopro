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
  treatmentPlanProceduresTable,
  accountingJournalEntriesTable,
  appointmentsTable,
  proceduresTable,
} from "@workspace/db";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  postReversal,
  postReceivableRevenue,
  postPartialDeferredReversal,
  resolveAccountCodeById,
} from "../../shared/accounting/accounting.service.js";
import { todayBRT } from "../../../utils/dateUtils.js";

export interface CancelTreatmentPlanInput {
  planId: number;
  reason: string;
  cancelledBy?: number | null;
  /** Override para testes — defaults para hoje BRT. */
  today?: string;
  /**
   * Sprint Financeiro 13 (P4) — quando `true` e a cláusula
   * `PRECO_DIFERENCIADO` está aceita no plano, posta a diferença
   * `(preço_de_tabela − preço_efetivo) × sessões_consumidas` como
   * receita por sessão (D 1.1.2 / C 4.1.1) por appointment confirmado/concluído
   * cujo preço foi diferenciado.
   */
  recalculate?: boolean;
}

export interface CancelTreatmentPlanResult {
  planId: number;
  invoicesCancelled: number;
  reversalsPosted: number;
  /** Sprint Financeiro 14 (Hardening) — estornos parciais postados (D 2.1.1 / C 1.1.2). */
  partialReversalsPosted: number;
  paidInvoicesSkipped: number;
  /**
   * IDs de faturas que ficaram fora do estorno (já pagas/parcialmente
   * pagas). UI deve avisar que requerem operação manual de ressarcimento.
   */
  paidInvoiceIds: number[];
  /**
   * Sprint Financeiro 14 (Hardening) — IDs de faturas com sessões
   * parcialmente reconhecidas (`recognitionCreditsConsumed > 0`) que NÃO
   * estavam pagas. O sistema postou estorno parcial automaticamente pelo
   * saldo restante (`amount − recognizedAmount`), preservando as fragmentas
   * já reconhecidas (regime de competência: serviço prestado fica).
   * O paciente continua devendo o `recognizedAmount` proporcional aos
   * serviços já prestados; cobrança manual ou via fluxo padrão de pagamento.
   */
  partiallyConsumedInvoiceIds: number[];
  reason: string;
  /**
   * Sprint Financeiro 13 (P4) — totais do recálculo de preço diferenciado.
   * `recalculatedAppointments` = sessões com `diff > 0` postadas.
   * `priceDifferenceTotal` = soma das diferenças cobradas (R$).
   * `recalculateSkippedReason` = se `recalculate=true` foi pedido mas a
   * cláusula `PRECO_DIFERENCIADO` não está aceita, vem `'clause_not_accepted'`.
   */
  recalculatedAppointments: number;
  priceDifferenceTotal: string;
  recalculateSkippedReason: string | null;
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
        partialReversalsPosted: 0,
        paidInvoicesSkipped: 0,
        paidInvoiceIds: [],
        partiallyConsumedInvoiceIds: [],
        reason: plan.cancellationReason ?? reason,
        recalculatedAppointments: 0,
        priceDifferenceTotal: "0.00",
        recalculateSkippedReason: null,
      };
    }

    // 1) Lista TODAS as faturas mensais vivas do plano (mensalidades P3 +
    // faturas mensais estimadas de itens avulso P4).
    const allInvoices = await tx
      .select()
      .from(financialRecordsTable)
      .where(
        and(
          eq(financialRecordsTable.treatmentPlanId, planId),
          inArray(
            financialRecordsTable.transactionType,
            ["faturaPlano", "faturaPlanoAvulsoMensal"],
          ),
        ),
      );

    let invoicesCancelled = 0;
    let reversalsPosted = 0;
    let partialReversalsPosted = 0;
    const paidInvoiceIds: number[] = [];
    const partiallyConsumedInvoiceIds: number[] = [];

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

      // Busca o `deferred_receivable` original (status='posted', não estornado).
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

      // Sprint Financeiro 14 (Hardening) — Bifurcação por consumo:
      //
      //   • consumed = 0  → fatura intocada → estorno INTEGRAL do deferred
      //     (postReversal). 1.1.2 e 2.1.1 zeram. Fatura → cancelado.
      //
      //   • consumed > 0  → algumas sessões já foram reconhecidas via
      //     fragmentas (D 2.1.1 / C 4.1.2). Receita por serviço prestado
      //     fica (regime de competência). Posta-se um estorno PARCIAL
      //     (D 2.1.1 / C 1.1.2) pelo SALDO restante (`amount − recognized`),
      //     anulando a expectativa de cobrar e a obrigação de prestar serviço
      //     futuro. Fatura ainda assim → cancelado (cobrança do recognized
      //     remanescente é manual e fica como saldo devedor do paciente).
      if (consumed > 0) {
        const amount = Number(inv.amount ?? 0);
        const recognized = Number(inv.recognizedAmount ?? 0);
        const residual = Math.max(0, Math.round((amount - recognized) * 100) / 100);
        if (residual > 0 && deferred) {
          await postPartialDeferredReversal(
            {
              clinicId: deferred.clinicId,
              entryDate: today,
              amount: residual,
              description:
                `Estorno parcial por cancelamento do plano #${planId} — ` +
                `fatura #${inv.id} (saldo de ${residual.toFixed(2)} não consumido) — ` +
                `motivo: ${reason}`,
              sourceType: "financial_record",
              sourceId: inv.id,
              patientId: inv.patientId,
              procedureId: inv.procedureId,
              financialRecordId: inv.id,
              createdBy: input.cancelledBy ?? null,
            } as any,
            tx as any,
          );
          partialReversalsPosted++;
        }
        partiallyConsumedInvoiceIds.push(inv.id);

        // Marca a fatura como cancelada (saldo já apropriado fica como
        // receita reconhecida; cobrança do recognized é manual).
        await tx
          .update(financialRecordsTable)
          .set({ status: "cancelado" })
          .where(eq(financialRecordsTable.id, inv.id));
        invoicesCancelled++;
        continue;
      }

      // consumed === 0: estorno integral do deferred_receivable.
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

      // Marca a fatura como cancelada (motivo persistido no journal entry
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

    // 5) Sprint Financeiro 13 (P4) — Recálculo de preço diferenciado.
    //
    // Para cada appointment confirmado/concluído ligado ao plano, calcula
    // `diff = preço_de_tabela − preço_efetivo_do_item`. Quando `diff > 0`,
    // posta `D 1.1.2 / C 4.1.1` (receita por sessão a receber) e cria um
    // `financial_record` com `transactionType='priceDifference'` para
    // tracking. Idempotente por (appointmentId, eventType='price_difference').
    let recalculatedAppointments = 0;
    let priceDifferenceTotal = 0;
    let recalculateSkippedReason: string | null = null;

    if (input.recalculate) {
      // Verifica se a cláusula `PRECO_DIFERENCIADO` está aceita no snapshot.
      let clauseAccepted = false;
      if (plan.acceptedClausesJson) {
        try {
          const parsed = JSON.parse(plan.acceptedClausesJson) as {
            items?: Array<{ code?: string }>;
          };
          clauseAccepted = !!parsed?.items?.some(
            (it) => it?.code === "PRECO_DIFERENCIADO",
          );
        } catch {
          clauseAccepted = false;
        }
      }

      if (!clauseAccepted) {
        recalculateSkippedReason = "clause_not_accepted";
      } else {
        // Carrega itens do plano com effectivePrice e procedure.price.
        const items = await tx
          .select({
            itemId: treatmentPlanProceduresTable.id,
            kind: treatmentPlanProceduresTable.kind,
            procedureId: treatmentPlanProceduresTable.procedureId,
            unitPrice: treatmentPlanProceduresTable.unitPrice,
            unitMonthlyPrice: treatmentPlanProceduresTable.unitMonthlyPrice,
            discount: treatmentPlanProceduresTable.discount,
            tablePrice: proceduresTable.price,
            procedureName: proceduresTable.name,
            accountingAccountId: sql<number | null>`${(proceduresTable as any).accountingAccountId}`,
          })
          .from(treatmentPlanProceduresTable)
          .leftJoin(
            proceduresTable,
            eq(proceduresTable.id, treatmentPlanProceduresTable.procedureId),
          )
          .where(eq(treatmentPlanProceduresTable.treatmentPlanId, planId));

        for (const item of items) {
          if (!item.procedureId) continue;
          const tablePrice = Number(item.tablePrice ?? 0);
          // O effective_price é o que o paciente "pagou" por sessão. Para
          // avulso usa unitPrice; para mensalidade usa unitMonthlyPrice; com
          // discount sempre subtraído. Normalizamos para "por sessão" só
          // para itens com unitPrice (avulso). Mensalidades P3 não fazem
          // sentido recalcular por sessão (o produto vendido foi o mês),
          // então pulamos.
          const kind = item.kind as string | null;
          if (kind !== "avulso") continue;

          const unit = Number(item.unitPrice ?? 0);
          const discount = Math.max(0, Number(item.discount ?? 0));
          const effective = Math.max(0, unit - discount);
          const diff = tablePrice - effective;
          if (diff <= 0) continue;

          const revenueAccountCode = await resolveAccountCodeById(
            (item as any).accountingAccountId ?? null,
            "4.1.1",
            plan.clinicId ?? null,
            tx as any,
          );

          // Sessões consumidas deste item (compareceu/concluido).
          const consumed = await tx
            .select({
              id: appointmentsTable.id,
              date: appointmentsTable.date,
              clinicId: appointmentsTable.clinicId,
              patientId: appointmentsTable.patientId,
            })
            .from(appointmentsTable)
            .where(
              and(
                eq(appointmentsTable.treatmentPlanProcedureId, item.itemId),
                inArray(appointmentsTable.status, ["compareceu", "concluido"] as any),
              ),
            );

          for (const appt of consumed) {
            // Idempotência: já existe price_difference postado para esta sessão?
            const [existingDiff] = await tx
              .select({ id: accountingJournalEntriesTable.id })
              .from(accountingJournalEntriesTable)
              .where(
                and(
                  eq(accountingJournalEntriesTable.appointmentId, appt.id),
                  eq(accountingJournalEntriesTable.eventType, "price_difference"),
                  isNull(accountingJournalEntriesTable.reversalOfEntryId),
                ),
              )
              .limit(1);
            if (existingDiff) continue;

            const [diffRecord] = await tx
              .insert(financialRecordsTable)
              .values({
                type: "receita",
                amount: diff.toFixed(2),
                description:
                  `Diferença de preço por cancelamento — plano #${planId} — ` +
                  `${item.procedureName ?? "procedimento"} — ` +
                  `sessão #${appt.id} em ${appt.date}`,
                category: "Diferença de preço",
                appointmentId: appt.id,
                patientId: appt.patientId,
                procedureId: item.procedureId,
                clinicId: appt.clinicId ?? plan.clinicId ?? null,
                transactionType: "priceDifference",
                status: "pendente",
                dueDate: today,
                treatmentPlanId: planId,
                treatmentPlanProcedureId: item.itemId,
                priceSource: "tabela",
                originalUnitPrice: String(tablePrice),
              } as any)
              .returning({ id: financialRecordsTable.id });

            const entry = await postReceivableRevenue(
              {
                clinicId: appt.clinicId ?? plan.clinicId ?? null,
                entryDate: today,
                amount: diff,
                description:
                  `Diferença de preço — plano #${planId} — sessão #${appt.id}`,
                sourceType: "financial_record",
                sourceId: diffRecord.id,
                patientId: appt.patientId,
                appointmentId: appt.id,
                procedureId: item.procedureId,
                financialRecordId: diffRecord.id,
                eventType: "price_difference",
                revenueAccountCode,
                createdBy: input.cancelledBy ?? null,
              } as any,
              tx as any,
            );

            await tx
              .update(financialRecordsTable)
              .set({ recognizedEntryId: entry.id, accountingEntryId: entry.id })
              .where(eq(financialRecordsTable.id, diffRecord.id));

            recalculatedAppointments++;
            priceDifferenceTotal += diff;
          }
        }
      }
    }

    return {
      planId,
      invoicesCancelled,
      reversalsPosted,
      partialReversalsPosted,
      paidInvoicesSkipped: paidInvoiceIds.length,
      paidInvoiceIds,
      partiallyConsumedInvoiceIds,
      reason,
      recalculatedAppointments,
      priceDifferenceTotal: priceDifferenceTotal.toFixed(2),
      recalculateSkippedReason,
    };
  });
}
