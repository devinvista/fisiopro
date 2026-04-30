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
import {
  financialRecordsTable,
  accountingJournalEntriesTable,
  accountingJournalLinesTable,
} from "@workspace/db";
import { and, eq, sql, isNull, inArray } from "drizzle-orm";
import { allocateReceivable, postReversal } from "../../shared/accounting/accounting.service.js";
import { todayBRT } from "../../../utils/dateUtils.js";

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

// ─── PR-FIN8-2 — Cascata de ESTORNO mãe → filhos ──────────────────────────

export interface CascadeReversalInput {
  /** Transação aberta (Drizzle Tx). */
  tx: any;
  /** ID do parent (`faturaMensalAvulso`) sendo estornado. */
  parentId: number;
  /** Data do estorno (string `YYYY-MM-DD`); default: hoje BRT. */
  reversalDate?: string;
  /** Motivo (auditoria contábil) — propagado para descrição do journal. */
  reversalReason: string;
  /** Usuário responsável (audit trail). */
  reversedBy?: number | null;
  /** ClinicId pai (propagado para o journal entry de estorno). */
  parentClinicId: number | null;
}

export interface CascadeReversalResult {
  /** IDs dos filhos estornados. */
  reversedChildIds: number[];
  /** IDs dos journal entries de estorno gerados. */
  reversalEntryIds: number[];
  /** Soma dos `amount` estornados (string com 2 casas). */
  totalReversed: string;
}

/**
 * Estorna em cascata todos os filhos de uma `faturaMensalAvulso` mãe.
 *
 * - Para cada filho `pago/pendente` que NÃO está `estornado/cancelado`:
 *     • posta `postReversal(child.recognizedEntryId)` (espelha o reconhecimento);
 *     • marca o filho como `estornado` com trilha (`reversalReason`,
 *       `reversedBy`, `reversedAt`, `originalAmount`).
 * - Filhos sem `recognizedEntryId` são ignorados (caso raro, legado).
 * - Idempotente: filhos já estornados são pulados pelo filtro.
 *
 * NÃO estorna a mãe — quem chama (handler de DELETE/estorno/status) já cuida
 * disso. Esta função cobre apenas o "efeito dominó" para baixo.
 */
export async function cascadeReversalForFaturaMensalAvulso(
  input: CascadeReversalInput,
): Promise<CascadeReversalResult> {
  const { tx, parentId, parentClinicId, reversalReason, reversedBy } = input;
  const reversalDate = input.reversalDate ?? todayBRT();

  const children = await tx
    .select({
      id: financialRecordsTable.id,
      amount: financialRecordsTable.amount,
      originalAmount: financialRecordsTable.originalAmount,
      status: financialRecordsTable.status,
      description: financialRecordsTable.description,
      recognizedEntryId: financialRecordsTable.recognizedEntryId,
      accountingEntryId: financialRecordsTable.accountingEntryId,
      clinicId: financialRecordsTable.clinicId,
      patientId: financialRecordsTable.patientId,
      appointmentId: financialRecordsTable.appointmentId,
      procedureId: financialRecordsTable.procedureId,
    })
    .from(financialRecordsTable)
    .where(
      and(
        eq(financialRecordsTable.parentRecordId, parentId),
        sql`${financialRecordsTable.status} NOT IN ('estornado','cancelado')`,
      ),
    );

  if (children.length === 0) {
    return { reversedChildIds: [], reversalEntryIds: [], totalReversed: "0.00" };
  }

  const reversedAt = new Date();
  const reversalEntryIds: number[] = [];
  const reversedChildIds: number[] = [];
  let total = 0;

  for (const child of children) {
    const entryId = child.recognizedEntryId ?? child.accountingEntryId;
    if (entryId) {
      const reversal = await postReversal(
        entryId,
        {
          clinicId: child.clinicId ?? parentClinicId,
          entryDate: reversalDate,
          description:
            `[Cascata mãe→filho] Estorno de receita filha — ${child.description} ` +
            `(motivo: ${reversalReason})`,
          sourceType: "financial_record",
          sourceId: child.id,
          patientId: child.patientId,
          appointmentId: child.appointmentId,
          procedureId: child.procedureId,
          financialRecordId: child.id,
          createdBy: reversedBy ?? null,
        },
        tx,
      );
      reversalEntryIds.push(reversal.id);
    }

    await tx
      .update(financialRecordsTable)
      .set({
        status: "estornado",
        originalAmount: child.originalAmount ?? child.amount,
        reversalReason: `[cascata #${parentId}] ${reversalReason}`,
        reversedBy: reversedBy ?? null,
        reversedAt,
      })
      .where(eq(financialRecordsTable.id, child.id));

    reversedChildIds.push(child.id);
    total += Number(child.amount ?? 0);
  }

  return {
    reversedChildIds,
    reversalEntryIds,
    totalReversed: total.toFixed(2),
  };
}

// ─── Sprint Financeiro 10 (P2) — Estorno de TODAS as fragmentas ────────────
// de uma `faturaPlano` no MODELO FRACIONADO.

export interface ReverseFaturaPlanoFragmentsInput {
  /** Transação aberta (Drizzle Tx). */
  tx: any;
  /** Linha da `faturaPlano` sendo estornada. */
  invoice: {
    id: number;
    clinicId: number | null;
    patientId: number | null;
    procedureId: number | null;
    appointmentId: number | null;
    description: string;
  };
  /** Data do estorno (`YYYY-MM-DD`); default: hoje BRT. */
  reversalDate?: string;
  /** Motivo (auditoria contábil). */
  reversalReason: string;
  /** Usuário responsável (audit trail). */
  reversedBy?: number | null;
}

export interface ReverseFaturaPlanoFragmentsResult {
  /** IDs dos `journal_entries` originais estornados nesta chamada. */
  reversedEntryIds: number[];
  /** IDs dos `journal_entries` de estorno gerados. */
  reversalEntryIds: number[];
  /** Soma dos valores estornados (string com 2 casas). */
  totalReversed: string;
}

/**
 * Estorna em cascata TODAS as fragmentas de receita de uma `faturaPlano` no
 * MODELO FRACIONADO. Para cada `journal_entry` de evento
 * `receivable_revenue` ou `wallet_usage_revenue` ligado à fatura
 * (`financialRecordId=invoice.id`) que ainda NÃO foi estornado, posta um
 * `postReversal` espelhado.
 *
 * Idempotente: entries com `reversalOfEntryId` já apontado por outro
 * journal_entry são excluídas via LEFT JOIN antirredundância.
 *
 * Não atualiza o registro financeiro — quem chama (handler de PATCH/DELETE)
 * já cuida do `status='estornado'`, `originalAmount`, `reversalReason`, etc.
 */
export async function reverseFaturaPlanoFragments(
  input: ReverseFaturaPlanoFragmentsInput,
): Promise<ReverseFaturaPlanoFragmentsResult> {
  const { tx, invoice, reversalReason, reversedBy } = input;
  const reversalDate = input.reversalDate ?? todayBRT();

  // Busca fragmentas vivas (não estornadas). Usa NOT EXISTS para excluir
  // entries que já têm um reversal apontando para elas.
  const fragments = await tx
    .select({
      id: accountingJournalEntriesTable.id,
      amount: sql<string>`(
        SELECT COALESCE(SUM(debit_amount), 0)::text
        FROM ${accountingJournalLinesTable}
        WHERE entry_id = ${accountingJournalEntriesTable.id}
      )`,
    })
    .from(accountingJournalEntriesTable)
    .where(and(
      eq(accountingJournalEntriesTable.financialRecordId, invoice.id),
      inArray(
        accountingJournalEntriesTable.eventType,
        ["receivable_revenue", "wallet_usage_revenue", "end_of_month_closure"],
      ),
      isNull(accountingJournalEntriesTable.reversalOfEntryId),
      sql`NOT EXISTS (
        SELECT 1 FROM ${accountingJournalEntriesTable} r
        WHERE r.reversal_of_entry_id = ${accountingJournalEntriesTable.id}
      )`,
    ));

  if (fragments.length === 0) {
    return { reversedEntryIds: [], reversalEntryIds: [], totalReversed: "0.00" };
  }

  const reversalEntryIds: number[] = [];
  const reversedEntryIds: number[] = [];
  let total = 0;

  for (const frag of fragments) {
    const reversal = await postReversal(
      frag.id,
      {
        clinicId: invoice.clinicId,
        entryDate: reversalDate,
        description:
          `[Estorno faturaPlano fracionado] ${invoice.description} ` +
          `(motivo: ${reversalReason})`,
        sourceType: "financial_record",
        sourceId: invoice.id,
        patientId: invoice.patientId,
        appointmentId: invoice.appointmentId,
        procedureId: invoice.procedureId,
        financialRecordId: invoice.id,
        createdBy: reversedBy ?? null,
      },
      tx,
    );
    reversalEntryIds.push(reversal.id);
    reversedEntryIds.push(frag.id);
    total += Number(frag.amount ?? 0);
  }

  return {
    reversedEntryIds,
    reversalEntryIds,
    totalReversed: total.toFixed(2),
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
