import { db } from "@workspace/db";
import {
  patientPackagesTable,
  financialRecordsTable,
  patientsTable,
  proceduresTable,
  billingRunLogsTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { todayBRT, nowBRT, lastDayOfMonth } from "../../../utils/dateUtils.js";
import {
  calcNextBillingDate,
  effectiveBillingDay,
  isWithinBillingWindow,
} from "./billing-date-utils.js";
import { withPackageBillingLock } from "./billing-lock.js";

export interface BillingResult {
  processed: number;
  generated: number;
  skipped: number;
  errors: number;
  recordIds: number[];
  details: BillingDetail[];
}

interface BillingDetail {
  subscriptionId: number;
  source: "patient_package";
  patientName: string;
  procedureName: string;
  amount: number;
  action: "generated" | "skipped_already_billed" | "skipped_wrong_day" | "error";
  reason?: string;
}

export async function runBilling(options: {
  clinicId?: number;
  toleranceDays?: number;
  dryRun?: boolean;
  triggeredBy?: "scheduler" | "manual";
} = {}): Promise<BillingResult> {
  const { clinicId, toleranceDays = 3, dryRun = false, triggeredBy = "scheduler" } = options;

  const todayStr = todayBRT();
  const brtToday = nowBRT();
  const { year, month } = brtToday;
  const monthStr = String(month).padStart(2, "0");
  const monthStart = `${year}-${monthStr}-01`;
  const lastDay = lastDayOfMonth(year, month);
  const monthEnd = `${year}-${monthStr}-${String(lastDay).padStart(2, "0")}`;

  console.log(`[billing] Iniciando ${dryRun ? "(DRY RUN) " : ""}em ${todayStr} — janela: ${toleranceDays} dias${clinicId ? ` — clínica ${clinicId}` : " — todas as clínicas"} — origem: ${triggeredBy}`);

  const result: BillingResult = {
    processed: 0,
    generated: 0,
    skipped: 0,
    errors: 0,
    recordIds: [],
    details: [],
  };

  const baseConditions = [
    eq(patientPackagesTable.recurrenceStatus, "ativa"),
    eq(patientPackagesTable.recurrenceType, "mensal"),
  ];
  if (clinicId) baseConditions.push(eq(patientPackagesTable.clinicId, clinicId));

  const activePackages = await db
    .select({
      pkg: patientPackagesTable,
      patientName: patientsTable.name,
      procedureName: proceduresTable.name,
      procedureCategory: proceduresTable.category,
    })
    .from(patientPackagesTable)
    .leftJoin(patientsTable, eq(patientPackagesTable.patientId, patientsTable.id))
    .leftJoin(proceduresTable, eq(patientPackagesTable.procedureId, proceduresTable.id))
    .where(and(...baseConditions));

  console.log(`[billing] ${activePackages.length} pacote(s) recorrente(s) mensal(is) ativo(s) encontrado(s)`);

  for (const row of activePackages) {
    const pkg = row.pkg;
    result.processed++;

    const patientName = row.patientName ?? `Paciente #${pkg.patientId}`;
    const procedureName = row.procedureName ?? `Procedimento #${pkg.procedureId}`;
    const billingDay = pkg.billingDay;
    const monthlyAmount = pkg.monthlyAmount;

    if (!billingDay || !monthlyAmount) {
      result.skipped++;
      result.details.push({
        subscriptionId: pkg.id,
        source: "patient_package",
        patientName,
        procedureName,
        amount: 0,
        action: "skipped_wrong_day",
        reason: "Pacote recorrente sem billingDay/monthlyAmount — configuração inválida",
      });
      console.warn(`[billing] Pacote #${pkg.id} (${patientName}) — sem billingDay/monthlyAmount, pulando`);
      continue;
    }

    try {
      if (!isWithinBillingWindow(billingDay, brtToday, toleranceDays)) {
        const effective = effectiveBillingDay(billingDay, year, month);
        result.skipped++;
        result.details.push({
          subscriptionId: pkg.id,
          source: "patient_package",
          patientName,
          procedureName,
          amount: Number(monthlyAmount),
          action: "skipped_wrong_day",
          reason: `Dia efetivo de cobrança: ${effective}, hoje (BRT): ${brtToday.day}`,
        });
        continue;
      }

      const existing = await db
        .select({ id: financialRecordsTable.id })
        .from(financialRecordsTable)
        .where(
          and(
            eq(financialRecordsTable.patientPackageId, pkg.id),
            eq(financialRecordsTable.transactionType, "creditoAReceber"),
            sql`${financialRecordsTable.createdAt} >= ${monthStart}::date`,
            sql`${financialRecordsTable.createdAt} < (${monthEnd}::date + interval '1 day')`
          )
        )
        .limit(1);

      if (existing.length > 0) {
        result.skipped++;
        result.details.push({
          subscriptionId: pkg.id,
          source: "patient_package",
          patientName,
          procedureName,
          amount: Number(monthlyAmount),
          action: "skipped_already_billed",
          reason: `Já existe registro #${existing[0].id} para ${monthStr}/${year}`,
        });
        console.log(`[billing] Pacote #${pkg.id} (${patientName}) — já cobrado em ${monthStr}/${year}, pulando`);
        continue;
      }

      if (dryRun) {
        result.generated++;
        result.details.push({
          subscriptionId: pkg.id,
          source: "patient_package",
          patientName,
          procedureName,
          amount: Number(monthlyAmount),
          action: "generated",
          reason: "dry-run: nenhum registro criado",
        });
        console.log(`[billing] [DRY RUN] Pacote #${pkg.id} (${patientName}) — geraria cobrança de R$ ${Number(monthlyAmount).toFixed(2)}`);
        continue;
      }

      const txOutcome = await withPackageBillingLock(pkg.id, year, month, async (tx) => {
        const recheck = await tx
          .select({ id: financialRecordsTable.id })
          .from(financialRecordsTable)
          .where(
            and(
              eq(financialRecordsTable.patientPackageId, pkg.id),
              eq(financialRecordsTable.transactionType, "creditoAReceber"),
              sql`${financialRecordsTable.createdAt} >= ${monthStart}::date`,
              sql`${financialRecordsTable.createdAt} < (${monthEnd}::date + interval '1 day')`,
            ),
          )
          .limit(1);

        if (recheck.length > 0) {
          return { duplicate: true as const, existingId: recheck[0].id };
        }

        const [record] = await tx
          .insert(financialRecordsTable)
          .values({
            type: "receita",
            amount: monthlyAmount,
            description: `Mensalidade ${procedureName} — ${patientName}`,
            category: row.procedureCategory ?? "Mensalidade",
            patientId: pkg.patientId,
            procedureId: pkg.procedureId,
            clinicId: pkg.clinicId ?? null,
            transactionType: "creditoAReceber",
            status: "pendente",
            dueDate: todayStr,
            patientPackageId: pkg.id,
          })
          .returning();

        const nextBillingDate = calcNextBillingDate(billingDay, year, month);
        await tx
          .update(patientPackagesTable)
          .set({ nextBillingDate })
          .where(eq(patientPackagesTable.id, pkg.id));

        return { duplicate: false as const, recordId: record.id, nextBillingDate };
      });

      if (txOutcome.duplicate) {
        result.skipped++;
        result.details.push({
          subscriptionId: pkg.id,
          source: "patient_package",
          patientName,
          procedureName,
          amount: Number(monthlyAmount),
          action: "skipped_already_billed",
          reason: `Race detectado — registro #${txOutcome.existingId} já existia para ${monthStr}/${year}`,
        });
        console.log(`[billing] Pacote #${pkg.id} (${patientName}) — race no lock, registro #${txOutcome.existingId} já existia`);
        continue;
      }

      result.generated++;
      result.recordIds.push(txOutcome.recordId);
      result.details.push({
        subscriptionId: pkg.id,
        source: "patient_package",
        patientName,
        procedureName,
        amount: Number(monthlyAmount),
        action: "generated",
        reason: `Registro #${txOutcome.recordId} criado — próxima cobrança: ${txOutcome.nextBillingDate}`,
      });

      console.log(`[billing] Pacote #${pkg.id} (${patientName}) — cobrança R$ ${Number(monthlyAmount).toFixed(2)} gerada → registro #${txOutcome.recordId} | próxima: ${txOutcome.nextBillingDate}`);

    } catch (err) {
      result.errors++;
      result.details.push({
        subscriptionId: pkg.id,
        source: "patient_package",
        patientName,
        procedureName,
        amount: Number(monthlyAmount ?? 0),
        action: "error",
        reason: err instanceof Error ? err.message : String(err),
      });
      console.error(`[billing] ERRO no pacote #${pkg.id} (${patientName}):`, err);
    }
  }

  console.log(
    `[billing] Concluído: ${result.generated} geradas, ${result.skipped} puladas, ${result.errors} erros`
  );

  if (!dryRun) {
    try {
      await db.insert(billingRunLogsTable).values({
        triggeredBy,
        clinicId: clinicId ?? null,
        processed: result.processed,
        generated: result.generated,
        skipped: result.skipped,
        errors: result.errors,
        dryRun: false,
      });
    } catch (logErr) {
      console.error("[billing] Falha ao gravar log de execução:", logErr);
    }
  }

  return result;
}
