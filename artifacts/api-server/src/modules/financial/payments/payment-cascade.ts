/**
 * Sprint 4 — Cascateamento de pagamento de faturas consolidadoras (`parent`)
 * para suas linhas-filhas (`parent_record_id`).
 *
 * Hoje há dois tipos de "fatura agrupadora" usando o padrão `parent_record_id`:
 *
 * 1) `faturaMensalAvulso` (`closeAvulsoMonth`) — agrupa N `creditoAReceber`
 *    de sessões avulsas do mês de um plano. Por construção,
 *    `parent.amount = SUM(filhos.amount)`. Cada filho JÁ reconheceu
 *    receita no momento da sessão (D: Recebíveis / C: Receita), então o
 *    parent NÃO deve re-reconhecer (evita receita dobrada).
 *
 *    Tratamento correto no pagamento do parent:
 *      • posta UM `postReceivableSettlement` para `parent.amount`
 *        (D: Caixa / C: Recebíveis) — feito pelo handler do payment loop;
 *      • aloca o pagamento contra o `recognizedEntryId` de CADA filho
 *        (em vez do parent, que não tem reconhecimento próprio);
 *      • marca todos os filhos como `pago` em cascata (mesmos
 *        `paymentDate`, `paymentMethod`, `settlementEntryId`).
 *
 * 2) `faturaPlano` com filhos `creditoAReceber` (Sprint 3) — o `parent.amount`
 *    é apenas a mensalidade fixa do plano; os filhos têm valor próprio (sessões
 *    avulsas extras). NÃO há cascade automático nesse caso: cada filho continua
 *    como recebível independente e é processado nas iterações subsequentes do
 *    payment loop. O `parent_record_id` aqui serve apenas para agrupamento
 *    visual / extrato unificado do mês.
 *
 * Esta função cobre exclusivamente o caso (1).
 */
import { financialRecordsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { allocateReceivable } from "../../shared/accounting/accounting.service.js";

export interface CascadeAvulsoPaymentInput {
  /** Transação aberta (Drizzle Tx). */
  tx: any;
  /** Linha do parent (`faturaMensalAvulso`) sendo paga. */
  parent: {
    id: number;
    clinicId: number | null;
    patientId: number | null;
    amount: string | number;
  };
  /** Data do pagamento (string `YYYY-MM-DD`). */
  paymentDate: string;
  /** Método informado pelo operador (pode ser null). */
  paymentMethod: string | null;
  /** ID do `journal_entry` do `postReceivableSettlement` que zerou o parent. */
  settlementEntryId: number;
}

export interface CascadeAvulsoPaymentResult {
  /** IDs dos filhos cascateados (status `pendente` → `pago`). */
  cascadedChildIds: number[];
  /** Soma dos `amount` dos filhos cascateados (string com 2 casas). */
  totalCascaded: string;
}

/**
 * Marca filhos de uma `faturaMensalAvulso` como `pago` e aloca o
 * `paymentEntry` do parent contra o `recognizedEntryId` de cada filho.
 *
 * Idempotente: se chamada duas vezes, a 2ª retorna `cascadedChildIds=[]`
 * porque o filtro exige `status='pendente'`.
 */
export async function cascadeFaturaMensalAvulsoPayment(
  input: CascadeAvulsoPaymentInput,
): Promise<CascadeAvulsoPaymentResult> {
  const { tx, parent, paymentDate, paymentMethod, settlementEntryId } = input;

  const children = await tx
    .select({
      id: financialRecordsTable.id,
      amount: financialRecordsTable.amount,
      recognizedEntryId: financialRecordsTable.recognizedEntryId,
      accountingEntryId: financialRecordsTable.accountingEntryId,
    })
    .from(financialRecordsTable)
    .where(
      and(
        eq(financialRecordsTable.parentRecordId, parent.id),
        eq(financialRecordsTable.status, "pendente"),
      ),
    );

  if (children.length === 0) {
    return { cascadedChildIds: [], totalCascaded: "0.00" };
  }

  let total = 0;
  for (const child of children) {
    const childAmount = Number(child.amount ?? 0);
    total += childAmount;

    // Aloca o pagamento do parent contra o reconhecimento de receita
    // do filho (que foi feito no momento da confirmação da sessão).
    // Sem `recognizedEntryId` (caso raro de filho criado fora do fluxo
    // padrão), apenas marca como pago — o reconciliador contábil pega
    // o resíduo via reconciliação manual.
    const receivableEntryId = child.recognizedEntryId ?? child.accountingEntryId;
    if (receivableEntryId && parent.patientId != null) {
      await allocateReceivable(
        {
          clinicId: parent.clinicId ?? null,
          paymentEntryId: settlementEntryId,
          receivableEntryId,
          patientId: parent.patientId,
          amount: childAmount,
          allocatedAt: paymentDate,
        },
        tx,
      );
    }

    await tx
      .update(financialRecordsTable)
      .set({
        status: "pago",
        paymentDate,
        paymentMethod: paymentMethod || null,
        settlementEntryId,
      })
      .where(eq(financialRecordsTable.id, child.id));
  }

  return {
    cascadedChildIds: children.map((c: { id: number }) => c.id),
    totalCascaded: total.toFixed(2),
  };
}

/**
 * Conta filhos pendentes (`parent_record_id = parentId`, `status='pendente'`)
 * de um financialRecord. Útil para decidir se o handler de pagamento deve
 * pular a etapa de "reconhecer receita do parent" (faturas consolidadoras
 * com filhos não devem reconhecer receita própria).
 */
export async function countPendingChildren(tx: any, parentId: number): Promise<number> {
  const [{ count }] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(financialRecordsTable)
    .where(
      and(
        eq(financialRecordsTable.parentRecordId, parentId),
        eq(financialRecordsTable.status, "pendente"),
      ),
    );
  return Number(count ?? 0);
}
