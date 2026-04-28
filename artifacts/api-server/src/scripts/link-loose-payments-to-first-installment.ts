/**
 * link-loose-payments-to-first-installment.ts
 *
 * Migração one-shot: vincula pagamentos avulsos (transactionType='pagamento')
 * já registrados como sendo a quitação da PRIMEIRA parcela do plano de
 * tratamento do mesmo paciente, quando o valor confere.
 *
 * Para cada pagamento avulso pareável:
 *   1. Reverte o accountingEntry do avulso (postReversal).
 *   2. Marca a primeira parcela como `pago` (preserva paymentDate +
 *      paymentMethod do avulso).
 *   3. Se a fatura ainda não tem reconhecimento de receita
 *      (recognizedEntryId IS NULL), lança postCashAdvance
 *      (D: Caixa / C: Adiantamentos de Cliente).
 *      Caso contrário, lança postReceivableSettlement
 *      (D: Caixa / C: Recebíveis).
 *   4. Promove créditos prepago do mês (se aplicável).
 *   5. Hard-delete do registro avulso.
 *
 * Critério de pareamento (auto-match seguro):
 *   • Mesmo patient_id
 *   • Avulso.amount == primeira_parcela.amount (exato, em centavos)
 *   • Primeira parcela = transactionType='faturaPlano' com plan_month_ref
 *     mais antigo do paciente; status='pendente'
 *
 * Casos com diferença de valor (ex: -R$10) ou múltiplos pagamentos não
 * são processados — devem ser tratados manualmente.
 *
 * Execução:
 *   pnpm --filter @workspace/api-server exec tsx \
 *     src/scripts/link-loose-payments-to-first-installment.ts [--dry-run]
 */
import { db } from "@workspace/db";
import {
  financialRecordsTable,
  accountingJournalEntriesTable,
} from "@workspace/db";
import { and, eq, sql, isNull } from "drizzle-orm";
import {
  postCashAdvance,
  postReceivableSettlement,
  postReversal,
  allocateReceivable,
} from "../modules/shared/accounting/accounting.service.js";
import { promotePrepaidCreditsForFinancialRecord } from "../modules/clinical/medical-records/treatment-plans.materialization.js";

const DRY_RUN = process.argv.includes("--dry-run");

interface PairCandidate {
  paymentId: number;
  paymentAmount: number;
  paymentDate: string;
  paymentMethod: string | null;
  paymentAccountingEntryId: number | null;
  paymentClinicId: number | null;
  invoiceId: number;
  invoiceAmount: number;
  invoiceClinicId: number | null;
  invoiceProcedureId: number | null;
  invoiceAppointmentId: number | null;
  invoiceSubscriptionId: number | null;
  invoiceRecognizedEntryId: number | null;
  patientId: number;
  patientName: string;
}

async function findPairs(): Promise<PairCandidate[]> {
  // Para cada paciente, pega a primeira parcela do plano (menor plan_month_ref)
  // pendente, e tenta parear com pagamento avulso de mesmo valor exato.
  const rows = await db.execute<any>(sql`
    WITH first_invoice AS (
      SELECT DISTINCT ON (fr.patient_id)
        fr.id AS invoice_id,
        fr.patient_id,
        fr.amount AS invoice_amount,
        fr.clinic_id AS invoice_clinic_id,
        fr.procedure_id AS invoice_procedure_id,
        fr.appointment_id AS invoice_appointment_id,
        fr.subscription_id AS invoice_subscription_id,
        fr.recognized_entry_id AS invoice_recognized_entry_id,
        fr.plan_month_ref
      FROM financial_records fr
      WHERE fr.transaction_type = 'faturaPlano'
        AND fr.status = 'pendente'
      ORDER BY fr.patient_id, fr.plan_month_ref ASC, fr.id ASC
    ),
    payment_count AS (
      SELECT patient_id, ROUND(amount,2) AS amt, COUNT(*) AS qty
      FROM financial_records
      WHERE transaction_type='pagamento' AND status='pago'
      GROUP BY patient_id, ROUND(amount,2)
    )
    SELECT
      pay.id AS payment_id,
      pay.amount AS payment_amount,
      pay.payment_date AS payment_date,
      pay.payment_method AS payment_method,
      pay.accounting_entry_id AS payment_accounting_entry_id,
      pay.clinic_id AS payment_clinic_id,
      fi.invoice_id,
      fi.invoice_amount,
      fi.invoice_clinic_id,
      fi.invoice_procedure_id,
      fi.invoice_appointment_id,
      fi.invoice_subscription_id,
      fi.invoice_recognized_entry_id,
      pay.patient_id,
      p.name AS patient_name
    FROM financial_records pay
    JOIN first_invoice fi ON fi.patient_id = pay.patient_id
    LEFT JOIN patients p ON p.id = pay.patient_id
    JOIN payment_count pc
      ON pc.patient_id = pay.patient_id
     AND pc.amt = ROUND(pay.amount,2)
    WHERE pay.transaction_type = 'pagamento'
      AND pay.status = 'pago'
      AND ROUND(pay.amount, 2) = ROUND(fi.invoice_amount, 2)
      AND pc.qty = 1
    ORDER BY pay.patient_id, pay.id;
  `);
  return (rows.rows ?? rows).map((r: any) => ({
    paymentId: Number(r.payment_id),
    paymentAmount: Number(r.payment_amount),
    paymentDate: r.payment_date,
    paymentMethod: r.payment_method,
    paymentAccountingEntryId: r.payment_accounting_entry_id != null ? Number(r.payment_accounting_entry_id) : null,
    paymentClinicId: r.payment_clinic_id != null ? Number(r.payment_clinic_id) : null,
    invoiceId: Number(r.invoice_id),
    invoiceAmount: Number(r.invoice_amount),
    invoiceClinicId: r.invoice_clinic_id != null ? Number(r.invoice_clinic_id) : null,
    invoiceProcedureId: r.invoice_procedure_id != null ? Number(r.invoice_procedure_id) : null,
    invoiceAppointmentId: r.invoice_appointment_id != null ? Number(r.invoice_appointment_id) : null,
    invoiceSubscriptionId: r.invoice_subscription_id != null ? Number(r.invoice_subscription_id) : null,
    invoiceRecognizedEntryId: r.invoice_recognized_entry_id != null ? Number(r.invoice_recognized_entry_id) : null,
    patientId: Number(r.patient_id),
    patientName: r.patient_name ?? "?",
  }));
}

async function main() {
  console.log(`\n🔗 Link loose payments to first installment (${DRY_RUN ? "DRY RUN" : "REAL"})\n`);

  const pairs = await findPairs();
  console.log(`Pagamentos pareados (auto-match): ${pairs.length}`);

  if (pairs.length === 0) {
    console.log("Nada a fazer. Encerrando.");
    return;
  }

  let processed = 0;
  let totalAmount = 0;
  const errors: Array<{ paymentId: number; error: string }> = [];

  for (const pair of pairs) {
    const head =
      `pgto#${pair.paymentId} (R$ ${pair.paymentAmount.toFixed(2)}, ${pair.paymentMethod ?? "?"}, ${pair.paymentDate}) ` +
      `→ fatura#${pair.invoiceId} | ${pair.patientName}`;

    if (DRY_RUN) {
      console.log(`DRY: ${head}`);
      processed++;
      totalAmount += pair.paymentAmount;
      continue;
    }

    try {
      await db.transaction(async (tx) => {
        // 1) Reverter o accounting entry do avulso (se houver e ainda
        //    estiver "posted").
        if (pair.paymentAccountingEntryId) {
          const [origin] = await tx
            .select({ status: accountingJournalEntriesTable.status })
            .from(accountingJournalEntriesTable)
            .where(eq(accountingJournalEntriesTable.id, pair.paymentAccountingEntryId))
            .limit(1);
          if (origin?.status === "posted") {
            await postReversal(pair.paymentAccountingEntryId, {
              clinicId: pair.paymentClinicId,
              entryDate: pair.paymentDate,
              description: `Estorno de pagamento avulso re-vinculado à fatura mensal #${pair.invoiceId}`,
              sourceType: "financial_record",
              sourceId: pair.paymentId,
              patientId: pair.patientId,
              eventType: "loose_payment_relink_reversal",
            }, tx as any);
          }
        }

        // 2) Lançar o pagamento da fatura no journal.
        let settlementEntryId: number;
        if (pair.invoiceRecognizedEntryId) {
          // Já tem receita reconhecida (sessão confirmada). D: Caixa / C: Recebíveis.
          const settlement = await postReceivableSettlement({
            clinicId: pair.invoiceClinicId,
            entryDate: pair.paymentDate,
            amount: pair.paymentAmount,
            description: `Baixa de recebível — fatura mensal #${pair.invoiceId} (relinked)`,
            sourceType: "financial_record",
            sourceId: pair.invoiceId,
            patientId: pair.patientId,
            appointmentId: pair.invoiceAppointmentId,
            procedureId: pair.invoiceProcedureId,
            subscriptionId: pair.invoiceSubscriptionId,
            financialRecordId: pair.invoiceId,
          }, tx as any);
          settlementEntryId = settlement.id;
          await allocateReceivable({
            clinicId: pair.invoiceClinicId,
            paymentEntryId: settlement.id,
            receivableEntryId: pair.invoiceRecognizedEntryId,
            patientId: pair.patientId,
            amount: pair.paymentAmount,
            allocatedAt: pair.paymentDate,
          }, tx as any);
        } else {
          // Pagamento antecipado — vai para Adiantamentos de Cliente.
          // D: Caixa / C: Adiantamentos.
          const advance = await postCashAdvance({
            clinicId: pair.invoiceClinicId,
            entryDate: pair.paymentDate,
            amount: pair.paymentAmount,
            description: `Pagamento antecipado de fatura mensal #${pair.invoiceId} (relinked)`,
            sourceType: "financial_record",
            sourceId: pair.invoiceId,
            patientId: pair.patientId,
            appointmentId: pair.invoiceAppointmentId,
            procedureId: pair.invoiceProcedureId,
            subscriptionId: pair.invoiceSubscriptionId,
            financialRecordId: pair.invoiceId,
          }, tx as any);
          settlementEntryId = advance.id;
        }

        // 3) Marcar a fatura como paga (preserva data e método do avulso).
        await tx
          .update(financialRecordsTable)
          .set({
            status: "pago",
            paymentDate: pair.paymentDate,
            paymentMethod: pair.paymentMethod,
            settlementEntryId,
          })
          .where(eq(financialRecordsTable.id, pair.invoiceId));

        // 4) Promover pool de créditos prepago (se aplicável).
        await promotePrepaidCreditsForFinancialRecord(pair.invoiceId);

        // 5) Hard-delete do pagamento avulso (já estornado).
        await tx
          .delete(financialRecordsTable)
          .where(eq(financialRecordsTable.id, pair.paymentId));
      });

      console.log(`OK ${head}`);
      processed++;
      totalAmount += pair.paymentAmount;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`ERRO ${head}: ${msg}`);
      errors.push({ paymentId: pair.paymentId, error: msg });
    }
  }

  console.log(`\n=========================================`);
  console.log(`Total processados: ${processed}`);
  console.log(`Valor total vinculado: R$ ${totalAmount.toFixed(2)}`);
  if (errors.length) {
    console.log(`Erros: ${errors.length}`);
    for (const e of errors) console.log(`  - pagamento ${e.paymentId}: ${e.error}`);
  }
  console.log(`=========================================\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Falha geral:", err);
    process.exit(1);
  });
