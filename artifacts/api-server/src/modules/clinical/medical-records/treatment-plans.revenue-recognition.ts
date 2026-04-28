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
 */
import { db } from "@workspace/db";
import {
  financialRecordsTable,
  proceduresTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
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
 */
export async function recognizeMonthlyInvoiceRevenue(
  input: RecognizeRevenueInput,
  tx: Tx = db,
): Promise<RecognizeRevenueResult> {
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
}
