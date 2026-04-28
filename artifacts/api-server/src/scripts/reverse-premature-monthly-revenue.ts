/**
 * reverse-premature-monthly-revenue.ts
 *
 * Migração one-shot: estorna receitas de fatura mensal de plano que foram
 * reconhecidas indevidamente na materialização (regra antiga) e cuja 1ª
 * sessão do mês AINDA NÃO foi confirmada.
 *
 * Critério:
 *   • financial_records.transactionType = 'faturaPlano'
 *   • financial_records.status = 'pendente'
 *   • financial_records.recognizedEntryId IS NOT NULL
 *   • Não existe nenhum appointment com monthlyInvoiceId = invoice.id
 *     em status 'compareceu' ou 'concluido'.
 *
 * Ação por fatura:
 *   1. postReversal(recognizedEntryId)  → estorna D: Recebíveis / C: Receita
 *   2. UPDATE financial_records SET recognizedEntryId=NULL,
 *      accountingEntryId=NULL WHERE id=invoice.id
 *
 * Execução:
 *   pnpm --filter @workspace/api-server exec tsx \
 *     src/scripts/reverse-premature-monthly-revenue.ts [--dry-run]
 */
import { db } from "@workspace/db";
import {
  financialRecordsTable,
  appointmentsTable,
  accountingJournalEntriesTable,
} from "@workspace/db";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { postReversal } from "../modules/shared/accounting/accounting.service.js";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log(`\n🔄 Reverse premature monthly revenue (${DRY_RUN ? "DRY RUN" : "REAL"})\n`);

  // 1) Lista candidatos: faturas mensais de plano, pendentes, com receita já reconhecida.
  const candidates = await db
    .select({
      id: financialRecordsTable.id,
      clinicId: financialRecordsTable.clinicId,
      patientId: financialRecordsTable.patientId,
      procedureId: financialRecordsTable.procedureId,
      amount: financialRecordsTable.amount,
      description: financialRecordsTable.description,
      recognizedEntryId: financialRecordsTable.recognizedEntryId,
      accountingEntryId: financialRecordsTable.accountingEntryId,
      planMonthRef: financialRecordsTable.planMonthRef,
    })
    .from(financialRecordsTable)
    .where(and(
      eq(financialRecordsTable.transactionType, "faturaPlano"),
      eq(financialRecordsTable.status, "pendente"),
      isNotNull(financialRecordsTable.recognizedEntryId),
    ));

  console.log(`Candidatos (pendentes + receita reconhecida): ${candidates.length}`);

  if (candidates.length === 0) {
    console.log("Nada a fazer. Encerrando.");
    return;
  }

  const ids = candidates.map((c) => c.id);

  // 2) Para cada candidato, descobre se já houve sessão confirmada do mês.
  const consumedRows = await db
    .select({
      monthlyInvoiceId: appointmentsTable.monthlyInvoiceId,
      cnt: sql<number>`count(*)`.as("cnt"),
    })
    .from(appointmentsTable)
    .where(and(
      inArray(appointmentsTable.monthlyInvoiceId, ids),
      inArray(appointmentsTable.status, ["compareceu", "concluido"]),
    ))
    .groupBy(appointmentsTable.monthlyInvoiceId);

  const consumedSet = new Set(
    consumedRows
      .filter((r) => Number(r.cnt) > 0 && r.monthlyInvoiceId != null)
      .map((r) => Number(r.monthlyInvoiceId)),
  );

  const toReverse = candidates.filter((c) => !consumedSet.has(c.id));
  const skipped = candidates.length - toReverse.length;

  console.log(`A estornar (sem sessão confirmada): ${toReverse.length}`);
  console.log(`Mantidos (já há sessão confirmada): ${skipped}`);

  let totalReversed = 0;
  let amountReversed = 0;
  const errors: Array<{ invoiceId: number; error: string }> = [];

  for (const inv of toReverse) {
    if (!inv.recognizedEntryId) continue;

    const headLine =
      `[${inv.id}] ${inv.description} | mês=${inv.planMonthRef ?? "?"} | R$ ${inv.amount}`;

    if (DRY_RUN) {
      console.log(`DRY: ESTORNARIA ${headLine}`);
      totalReversed++;
      amountReversed += Number(inv.amount);
      continue;
    }

    try {
      await db.transaction(async (tx) => {
        // Verifica se já não foi estornado
        const [origin] = await tx
          .select({ status: accountingJournalEntriesTable.status })
          .from(accountingJournalEntriesTable)
          .where(eq(accountingJournalEntriesTable.id, inv.recognizedEntryId!))
          .limit(1);

        if (!origin) {
          throw new Error(`Lançamento original ${inv.recognizedEntryId} não encontrado`);
        }
        if (origin.status === "reversed") {
          // Já estornado por outro processo; apenas zera as referências
          await tx
            .update(financialRecordsTable)
            .set({ recognizedEntryId: null, accountingEntryId: null })
            .where(eq(financialRecordsTable.id, inv.id));
          return;
        }

        await postReversal(inv.recognizedEntryId!, {
          clinicId: inv.clinicId ?? null,
          entryDate: new Date().toISOString().slice(0, 10),
          amount: Number(inv.amount),
          description:
            `Estorno de receita prematura — ${inv.description} (1ª sessão ainda não ocorreu)`,
          sourceType: "financial_record",
          sourceId: inv.id,
          patientId: inv.patientId ?? null,
          procedureId: inv.procedureId ?? null,
          financialRecordId: inv.id,
          eventType: "premature_revenue_reversal",
        }, tx as any);

        await tx
          .update(financialRecordsTable)
          .set({ recognizedEntryId: null, accountingEntryId: null })
          .where(eq(financialRecordsTable.id, inv.id));
      });

      console.log(`OK ESTORNADO ${headLine}`);
      totalReversed++;
      amountReversed += Number(inv.amount);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`ERRO ${headLine}: ${msg}`);
      errors.push({ invoiceId: inv.id, error: msg });
    }
  }

  console.log(`\n=========================================`);
  console.log(`Total estornados: ${totalReversed}`);
  console.log(`Valor total estornado: R$ ${amountReversed.toFixed(2)}`);
  if (errors.length) {
    console.log(`Erros: ${errors.length}`);
    for (const e of errors) console.log(`  - invoice ${e.invoiceId}: ${e.error}`);
  }
  console.log(`=========================================\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Falha geral:", err);
    process.exit(1);
  });
