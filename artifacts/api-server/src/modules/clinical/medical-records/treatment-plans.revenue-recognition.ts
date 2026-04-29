/**
 * Reconhecimento de receita de fatura mensal de plano de tratamento.
 *
 * Regra de negócio:
 *   • A fatura mensal nasce `pendente` na materialização, sem journal entry.
 *   • Na 1ª confirmação de sessão (compareceu/concluido) do mês, a receita
 *     é reconhecida pelo VALOR INTEGRAL da fatura mensal:
 *       - Se a fatura está `pendente`: D: Recebíveis / C: Receita.
 *       - Se a fatura está `pago` (prepago já pagou via postCashAdvance):
 *         D: Adiantamentos de Cliente / C: Receita.
 *   • Sentinel de idempotência: `financial_records.recognizedEntryId`.
 *     Se preenchida, não relança.
 *
 * PR-FIN7-2 (B10): advisory lock via `pg_advisory_xact_lock(invoiceId)` dentro
 * de uma transação dedicada. Previne reconhecimento duplicado em confirmações
 * concorrentes do mesmo mês (ex.: dois fisioterapeutas confirmando sessões
 * simultaneamente). A lock é liberada automaticamente ao fim da transação.
 */
import { db } from "@workspace/db";
import {
  financialRecordsTable,
  proceduresTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
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
}

/**
 * Reconhece a receita da fatura mensal se ainda não foi reconhecida.
 * Idempotente — chamadas repetidas para a mesma fatura são no-op.
 *
 * PR-FIN7-2 (B10): sempre executa dentro de uma transação própria com
 * advisory lock. O parâmetro `_tx` é mantido por compatibilidade retroativa
 * mas ignorado — a função gerencia seu próprio contexto transacional.
 */
export async function recognizeMonthlyInvoiceRevenue(
  input: RecognizeRevenueInput,
  _tx: Tx = db,
): Promise<RecognizeRevenueResult> {
  // Sempre cria uma transação dedicada para acoplar a advisory lock ao
  // ciclo de vida correto (lock liberada quando a tx commita/aborta).
  return db.transaction(async (tx) => {
    // Serializa reconhecimentos concorrentes da MESMA fatura.
    // Sessões de faturas diferentes não se bloqueiam entre si.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${input.monthlyInvoiceId}::bigint)`,
    );

    // Re-lê a fatura DENTRO do lock para checar o sentinel com dado fresco.
    // Sem isso, dois requests poderiam ler recognizedEntryId=null antes de
    // qualquer um inserir o journal entry.
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

    if (invoice.recognizedEntryId) {
      return { recognized: false, reason: "Receita já reconhecida", entryId: invoice.recognizedEntryId };
    }

    const amount = Number(invoice.amount);
    if (amount <= 0) {
      return { recognized: false, reason: "Valor zero" };
    }

    // Resolve o código contábil da receita (sub-conta do procedimento se houver)
    let revenueAccountCode = "4.1.1";
    if (invoice.procedureId) {
      const [proc] = await tx
        .select({ accountingAccountId: (proceduresTable as any).accountingAccountId })
        .from(proceduresTable)
        .where(eq(proceduresTable.id, invoice.procedureId))
        .limit(1);
      revenueAccountCode = await resolveAccountCodeById(
        proc?.accountingAccountId ?? null,
        "4.1.1",
        invoice.clinicId ?? null,
      );
    }

    const baseEntry = {
      clinicId: invoice.clinicId ?? null,
      entryDate: input.appointmentDate,
      amount,
      description:
        `Receita do mês reconhecida (1ª sessão) — fatura #${invoice.id} — ${invoice.description}`,
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
      // Fatura já paga via postCashAdvance (Adiantamento). Consome o
      // adiantamento ao reconhecer a receita.
      const entry = await postWalletUsage(baseEntry, tx as any);
      entryId = entry.id;
    } else {
      // Fatura pendente. Reconhece como recebível + receita.
      const entry = await postReceivableRevenue(baseEntry, tx as any);
      entryId = entry.id;
    }

    await tx
      .update(financialRecordsTable)
      .set({ recognizedEntryId: entryId, accountingEntryId: entryId })
      .where(eq(financialRecordsTable.id, invoice.id));

    return { recognized: true, entryId };
  });
}
