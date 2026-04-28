/**
 * Backfill: corrige a contabilização de receitas para pacientes em planos
 * de tratamento mensais fixos (rateio proporcional via faturaConsolidada).
 *
 * O que faz:
 *  1. Encontra todos os planos de tratamento ativos cujo item referencia um
 *     pacote `mensal` com `unit_monthly_price > 0`.
 *  2. Para cada paciente alvo:
 *     a. Cancela financial_records "errados" do mês corrente (cobrados como
 *        creditoAReceber/usoCarteira/usoCredito ligados a consultas do
 *        procedimento do plano que NÃO sejam pendenteFatura/faturaConsolidada).
 *        Reverte os journal entries relacionados.
 *     b. Re-roda applyBillingRules para cada consulta com status
 *        compareceu/concluido do procedimento alvo no mês corrente.
 *        Isso recria os lançamentos como pendenteFatura proporcionais
 *        e auto-cria a patient_subscription faturaConsolidada se faltar.
 *
 * Uso:
 *   pnpm tsx scripts/fix-monthly-plan-billing.ts
 *   pnpm tsx scripts/fix-monthly-plan-billing.ts --dry-run
 *   pnpm tsx scripts/fix-monthly-plan-billing.ts --month=2026-04
 *   pnpm tsx scripts/fix-monthly-plan-billing.ts --patient=50
 */
import { db } from "../lib/db/src";
import {
  appointmentsTable,
  financialRecordsTable,
  treatmentPlansTable,
  treatmentPlanProceduresTable,
  packagesTable,
  patientsTable,
  accountingJournalEntriesTable,
} from "../lib/db/src/schema";
import { eq, and, inArray, sql, isNotNull } from "drizzle-orm";
import { applyBillingRules } from "../artifacts/api-server/src/modules/clinical/appointments/appointments.billing";
import { postReversal } from "../artifacts/api-server/src/modules/shared/accounting/accounting.service";
import { todayBRT } from "../artifacts/api-server/src/utils/dateUtils";

interface Args {
  dryRun: boolean;
  month: string; // "YYYY-MM"
  patientId: number | null;
}

function parseArgs(): Args {
  const out: Args = {
    dryRun: false,
    month: todayBRT().slice(0, 7),
    patientId: null,
  };
  for (const a of process.argv.slice(2)) {
    if (a === "--dry-run") out.dryRun = true;
    else if (a.startsWith("--month=")) out.month = a.split("=")[1];
    else if (a.startsWith("--patient=")) out.patientId = Number(a.split("=")[1]);
  }
  return out;
}

async function main() {
  const args = parseArgs();
  const [year, monthNum] = args.month.split("-").map(Number);
  const lastDay = new Date(year, monthNum, 0).getDate();
  const monthStart = `${year}-${String(monthNum).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(monthNum).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  console.log(`\n[fix-monthly-plan-billing] ${args.dryRun ? "(DRY RUN) " : ""}mês=${args.month} (${monthStart} → ${monthEnd})${args.patientId ? ` paciente=${args.patientId}` : ""}\n`);

  // 1) Encontra itens-de-plano-mensal-fixo
  const planItems = await db
    .select({
      treatmentPlanId: treatmentPlansTable.id,
      patientId: treatmentPlansTable.patientId,
      patientName: patientsTable.name,
      clinicId: treatmentPlansTable.clinicId,
      planStatus: treatmentPlansTable.status,
      packageId: packagesTable.id,
      procedureId: packagesTable.procedureId,
      monthlyPrice: packagesTable.monthlyPrice,
      unitMonthlyPrice: treatmentPlanProceduresTable.unitMonthlyPrice,
      discount: treatmentPlanProceduresTable.discount,
    })
    .from(treatmentPlanProceduresTable)
    .innerJoin(treatmentPlansTable, eq(treatmentPlansTable.id, treatmentPlanProceduresTable.treatmentPlanId))
    .innerJoin(packagesTable, eq(packagesTable.id, treatmentPlanProceduresTable.packageId))
    .innerJoin(patientsTable, eq(patientsTable.id, treatmentPlansTable.patientId))
    .where(
      and(
        eq(treatmentPlansTable.status, "ativo"),
        eq(packagesTable.packageType, "mensal"),
        isNotNull(treatmentPlanProceduresTable.unitMonthlyPrice),
        sql`${treatmentPlanProceduresTable.unitMonthlyPrice}::numeric > 0`,
      ),
    );

  const filtered = args.patientId
    ? planItems.filter((p) => p.patientId === args.patientId)
    : planItems;

  console.log(`[fix-monthly-plan-billing] ${filtered.length} item(ns) de plano mensal-fixo encontrado(s):`);
  for (const p of filtered) {
    const monthly = (Number(p.unitMonthlyPrice ?? 0) - Number(p.discount ?? 0)).toFixed(2);
    console.log(
      `  • plano #${p.treatmentPlanId} — ${p.patientName} (#${p.patientId}) — pacote #${p.packageId} (procedimento #${p.procedureId}) — mensal R$ ${monthly}`,
    );
  }

  let totalCanceled = 0;
  let totalReversedEntries = 0;
  let totalReprocessed = 0;

  for (const item of filtered) {
    const { patientId, procedureId, clinicId, patientName } = item;
    if (!procedureId) continue;

    // 2a) Lista financial_records do paciente+procedimento no mês que estão
    //     em transactionTypes "errados" (não pendenteFatura/faturaConsolidada/creditoSessao/usoCredito).
    //     Filtramos por consultas no mês para evitar mexer em receitas avulsas
    //     antigas não relacionadas.
    const wrongTypes = ["creditoAReceber", "usoCarteira"];

    const wrongRecords = await db
      .select({
        id: financialRecordsTable.id,
        appointmentId: financialRecordsTable.appointmentId,
        amount: financialRecordsTable.amount,
        transactionType: financialRecordsTable.transactionType,
        status: financialRecordsTable.status,
        accountingEntryId: financialRecordsTable.accountingEntryId,
        recognizedEntryId: financialRecordsTable.recognizedEntryId,
        appointmentDate: appointmentsTable.date,
        appointmentStatus: appointmentsTable.status,
      })
      .from(financialRecordsTable)
      .leftJoin(appointmentsTable, eq(appointmentsTable.id, financialRecordsTable.appointmentId))
      .where(
        and(
          eq(financialRecordsTable.patientId, patientId),
          eq(financialRecordsTable.procedureId, procedureId),
          inArray(financialRecordsTable.transactionType, wrongTypes),
          sql`${appointmentsTable.date} >= ${monthStart}::date`,
          sql`${appointmentsTable.date} <= ${monthEnd}::date`,
        ),
      );

    // Lista também records sem transactionType (legado) para o mesmo período.
    const legacyRecords = await db
      .select({
        id: financialRecordsTable.id,
        appointmentId: financialRecordsTable.appointmentId,
        amount: financialRecordsTable.amount,
        transactionType: financialRecordsTable.transactionType,
        status: financialRecordsTable.status,
        accountingEntryId: financialRecordsTable.accountingEntryId,
        recognizedEntryId: financialRecordsTable.recognizedEntryId,
        appointmentDate: appointmentsTable.date,
        appointmentStatus: appointmentsTable.status,
      })
      .from(financialRecordsTable)
      .leftJoin(appointmentsTable, eq(appointmentsTable.id, financialRecordsTable.appointmentId))
      .where(
        and(
          eq(financialRecordsTable.patientId, patientId),
          eq(financialRecordsTable.procedureId, procedureId),
          sql`${financialRecordsTable.transactionType} IS NULL`,
          sql`${appointmentsTable.date} >= ${monthStart}::date`,
          sql`${appointmentsTable.date} <= ${monthEnd}::date`,
        ),
      );

    const allWrong = [...wrongRecords, ...legacyRecords];

    if (allWrong.length > 0) {
      console.log(`\n  ▸ ${patientName}: ${allWrong.length} lançamento(s) errado(s) no mês — cancelando...`);
      for (const r of allWrong) {
        console.log(
          `    - record #${r.id} (consulta #${r.appointmentId} em ${r.appointmentDate}) ${r.transactionType ?? "[null]"} R$ ${r.amount} status=${r.status}`,
        );
      }
    }

    if (!args.dryRun) {
      for (const r of allWrong) {
        // Apaga lançamentos contábeis ligados ao record errado (originais e
        // estornos), tanto pelos ids referenciados pelo financial_record
        // quanto por sourceType/sourceId polimórfico. Como os pares
        // original-estorno se anulam, a remoção não desbalanceia a
        // contabilidade — apenas remove ruído de auditoria de uma cobrança
        // que nunca deveria ter existido.
        const linkedEntryIds = [r.accountingEntryId, r.recognizedEntryId].filter(
          (x): x is number => typeof x === "number",
        );
        if (linkedEntryIds.length > 0) {
          await db
            .delete(accountingJournalEntriesTable)
            .where(inArray(accountingJournalEntriesTable.id, linkedEntryIds));
          totalReversedEntries += linkedEntryIds.length;
        }
        const orphanEntries = await db
          .delete(accountingJournalEntriesTable)
          .where(
            and(
              eq(accountingJournalEntriesTable.sourceType, "financial_record"),
              eq(accountingJournalEntriesTable.sourceId, r.id),
            ),
          )
          .returning({ id: accountingJournalEntriesTable.id });
        totalReversedEntries += orphanEntries.length;

        // Hard delete do financial_record errado.
        await db.delete(financialRecordsTable).where(eq(financialRecordsTable.id, r.id));
        totalCanceled++;
      }
    } else {
      totalCanceled += allWrong.length;
    }

    // 2b) Re-roda applyBillingRules para consultas confirmadas do mês.
    const confirmedAppts = await db
      .select({
        id: appointmentsTable.id,
        date: appointmentsTable.date,
        status: appointmentsTable.status,
      })
      .from(appointmentsTable)
      .where(
        and(
          eq(appointmentsTable.patientId, patientId),
          eq(appointmentsTable.procedureId, procedureId),
          inArray(appointmentsTable.status, ["compareceu", "concluido"]),
          sql`${appointmentsTable.date} >= ${monthStart}::date`,
          sql`${appointmentsTable.date} <= ${monthEnd}::date`,
        ),
      );

    if (confirmedAppts.length > 0) {
      console.log(`    ↻ ${confirmedAppts.length} consulta(s) confirmada(s) para reprocessar.`);
    }

    if (!args.dryRun) {
      for (const a of confirmedAppts) {
        try {
          // Simula transição "agendado → status_atual" para que applyBillingRules
          // crie o lançamento pendenteFatura. A função é idempotente quando já
          // existe pendenteFatura para o appointment — então só cria se faltar.
          await applyBillingRules(a.id, a.status, "agendado", clinicId);
          totalReprocessed++;
        } catch (e) {
          console.error(`      ! falha applyBillingRules consulta #${a.id}:`, (e as Error).message);
        }
      }
    } else {
      totalReprocessed += confirmedAppts.length;
    }
  }

  console.log(
    `\n[fix-monthly-plan-billing] ${args.dryRun ? "(DRY RUN) " : ""}Concluído: ` +
      `${totalCanceled} lançamento(s) cancelado(s), ` +
      `${totalReversedEntries} entry(s) contábil(eis) estornado(s), ` +
      `${totalReprocessed} consulta(s) reprocessada(s).\n`,
  );

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
