/**
 * billingService — geração automatizada de cobranças mensais
 *
 * Regras implementadas:
 * 1. Janela de tolerância de 3 dias: se o dia de cobrança caiu nos últimos
 *    3 dias e ainda não foi gerado registro este mês, processa agora.
 * 2. Meses curtos: billingDay 29/30/31 usa o último dia do mês quando
 *    o mês não tem esse dia.
 * 3. Idempotência segura: verifica por (sourceId + mês/ano de
 *    created_at), nunca por dueDate (nullable).
 * 4. Isolamento por clínica: filtra por clinicId quando fornecido.
 * 5. Logging completo em cada etapa para auditoria.
 * 6. Grava log de cada execução em billing_run_logs para exibição na UI.
 *
 * ── Sprint 1 — Unificação ───────────────────────────────────────────────────
 * O job tem dois caminhos selecionáveis pela env `BILLING_FROM_PACKAGES`:
 *
 *   • `BILLING_FROM_PACKAGES=1` (default, cutover Sprint 1):
 *     itera em `patient_packages WHERE recurrence_status='ativa' AND
 *     recurrence_type='mensal'`. Vincula o `financial_record` via
 *     `patientPackageId` e atualiza `patient_packages.next_billing_date`.
 *
 *   • `BILLING_FROM_PACKAGES=0` (legado, fallback reversível):
 *     itera em `patient_subscriptions` (comportamento antigo). Útil enquanto
 *     a tabela ainda existe como espelho, antes da remoção no Sprint 6.
 */

import { db } from "@workspace/db";
import {
  patientSubscriptionsTable,
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
import { withSubscriptionBillingLock, withPackageBillingLock } from "./billing-lock.js";

export interface BillingResult {
  processed: number;
  generated: number;
  skipped: number;
  errors: number;
  recordIds: number[];
  details: BillingDetail[];
}

interface BillingDetail {
  /** Identifica a fonte da cobrança. Pode ser `patient_package.id` no novo regime. */
  subscriptionId: number;
  /** Origem da cobrança (qual tabela alimentou o job). */
  source: "patient_package" | "patient_subscription";
  patientName: string;
  procedureName: string;
  amount: number;
  action: "generated" | "skipped_already_billed" | "skipped_wrong_day" | "error";
  reason?: string;
}

function billingFromPackagesEnabled(): boolean {
  return process.env.BILLING_FROM_PACKAGES !== "0";
}

export async function runBilling(options: {
  clinicId?: number;
  toleranceDays?: number;
  dryRun?: boolean;
  triggeredBy?: "scheduler" | "manual";
} = {}): Promise<BillingResult> {
  const fromPackages = billingFromPackagesEnabled();
  const result = fromPackages
    ? await runBillingFromPackages(options)
    : await runBillingFromSubscriptions(options);

  // Grava log da execução (exceto dry-runs não geram log permanente)
  const { clinicId, dryRun = false, triggeredBy = "scheduler" } = options;
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

// ─── Novo regime: itera em patient_packages ─────────────────────────────────
async function runBillingFromPackages(options: {
  clinicId?: number;
  toleranceDays?: number;
  dryRun?: boolean;
  triggeredBy?: "scheduler" | "manual";
}): Promise<BillingResult> {
  const { clinicId, toleranceDays = 3, dryRun = false, triggeredBy = "scheduler" } = options;

  const todayStr = todayBRT();
  const brtToday = nowBRT();
  const { year, month } = brtToday;
  const monthStr = String(month).padStart(2, "0");
  const monthStart = `${year}-${monthStr}-01`;
  const lastDay = lastDayOfMonth(year, month);
  const monthEnd = `${year}-${monthStr}-${String(lastDay).padStart(2, "0")}`;

  console.log(`[billing] (packages) Iniciando ${dryRun ? "(DRY RUN) " : ""}em ${todayStr} — janela: ${toleranceDays} dias${clinicId ? ` — clínica ${clinicId}` : " — todas as clínicas"} — origem: ${triggeredBy}`);

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

    // Sem billingDay/monthlyAmount o pacote está mal configurado — pula com aviso.
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
    `[billing] (packages) Concluído: ${result.generated} geradas, ${result.skipped} puladas, ${result.errors} erros`
  );

  return result;
}

// ─── Caminho legado: itera em patient_subscriptions ─────────────────────────
async function runBillingFromSubscriptions(options: {
  clinicId?: number;
  toleranceDays?: number;
  dryRun?: boolean;
  triggeredBy?: "scheduler" | "manual";
}): Promise<BillingResult> {
  const { clinicId, toleranceDays = 3, dryRun = false, triggeredBy = "scheduler" } = options;

  const todayStr = todayBRT();
  const brtToday = nowBRT();
  const { year, month } = brtToday;
  const monthStr = String(month).padStart(2, "0");
  const monthStart = `${year}-${monthStr}-01`;
  const lastDay = lastDayOfMonth(year, month);
  const monthEnd = `${year}-${monthStr}-${String(lastDay).padStart(2, "0")}`;

  console.log(`[billing] (subscriptions, LEGADO) Iniciando ${dryRun ? "(DRY RUN) " : ""}em ${todayStr} — janela: ${toleranceDays} dias${clinicId ? ` — clínica ${clinicId}` : " — todas as clínicas"} — origem: ${triggeredBy}`);

  const result: BillingResult = {
    processed: 0,
    generated: 0,
    skipped: 0,
    errors: 0,
    recordIds: [],
    details: [],
  };

  const whereClause = clinicId
    ? and(
        eq(patientSubscriptionsTable.status, "ativa"),
        eq(patientSubscriptionsTable.subscriptionType, "mensal"),
        eq(patientSubscriptionsTable.clinicId, clinicId)
      )
    : and(
        eq(patientSubscriptionsTable.status, "ativa"),
        eq(patientSubscriptionsTable.subscriptionType, "mensal")
      );

  const activeSubscriptions = await db
    .select({
      subscription: patientSubscriptionsTable,
      patientName: patientsTable.name,
      procedureName: proceduresTable.name,
      procedureCategory: proceduresTable.category,
    })
    .from(patientSubscriptionsTable)
    .leftJoin(patientsTable, eq(patientSubscriptionsTable.patientId, patientsTable.id))
    .leftJoin(proceduresTable, eq(patientSubscriptionsTable.procedureId, proceduresTable.id))
    .where(whereClause);

  console.log(`[billing] ${activeSubscriptions.length} assinatura(s) ativa(s) encontrada(s)`);

  for (const row of activeSubscriptions) {
    const sub = row.subscription;
    result.processed++;

    const patientName = row.patientName ?? `Paciente #${sub.patientId}`;
    const procedureName = row.procedureName ?? `Procedimento #${sub.procedureId}`;

    try {
      if (!isWithinBillingWindow(sub.billingDay, brtToday, toleranceDays)) {
        const effective = effectiveBillingDay(sub.billingDay, year, month);
        result.skipped++;
        result.details.push({
          subscriptionId: sub.id,
          source: "patient_subscription",
          patientName,
          procedureName,
          amount: Number(sub.monthlyAmount),
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
            eq(financialRecordsTable.subscriptionId, sub.id),
            sql`${financialRecordsTable.createdAt} >= ${monthStart}::date`,
            sql`${financialRecordsTable.createdAt} < (${monthEnd}::date + interval '1 day')`
          )
        )
        .limit(1);

      if (existing.length > 0) {
        result.skipped++;
        result.details.push({
          subscriptionId: sub.id,
          source: "patient_subscription",
          patientName,
          procedureName,
          amount: Number(sub.monthlyAmount),
          action: "skipped_already_billed",
          reason: `Já existe registro #${existing[0].id} para ${monthStr}/${year}`,
        });
        console.log(`[billing] Sub #${sub.id} (${patientName}) — já cobrada em ${monthStr}/${year}, pulando`);
        continue;
      }

      if (dryRun) {
        result.generated++;
        result.details.push({
          subscriptionId: sub.id,
          source: "patient_subscription",
          patientName,
          procedureName,
          amount: Number(sub.monthlyAmount),
          action: "generated",
          reason: "dry-run: nenhum registro criado",
        });
        console.log(`[billing] [DRY RUN] Sub #${sub.id} (${patientName}) — geraria cobrança de R$ ${Number(sub.monthlyAmount).toFixed(2)}`);
        continue;
      }

      const txOutcome = await withSubscriptionBillingLock(sub.id, year, month, async (tx) => {
        const recheck = await tx
          .select({ id: financialRecordsTable.id })
          .from(financialRecordsTable)
          .where(
            and(
              eq(financialRecordsTable.subscriptionId, sub.id),
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
            amount: sub.monthlyAmount,
            description: `Mensalidade ${procedureName} — ${patientName}`,
            category: row.procedureCategory ?? "Mensalidade",
            patientId: sub.patientId,
            procedureId: sub.procedureId,
            clinicId: sub.clinicId ?? null,
            transactionType: "creditoAReceber",
            status: "pendente",
            dueDate: todayStr,
            subscriptionId: sub.id,
          })
          .returning();

        const nextBillingDate = calcNextBillingDate(sub.billingDay, year, month);
        await tx
          .update(patientSubscriptionsTable)
          .set({ nextBillingDate })
          .where(eq(patientSubscriptionsTable.id, sub.id));

        return { duplicate: false as const, recordId: record.id, nextBillingDate };
      });

      if (txOutcome.duplicate) {
        result.skipped++;
        result.details.push({
          subscriptionId: sub.id,
          source: "patient_subscription",
          patientName,
          procedureName,
          amount: Number(sub.monthlyAmount),
          action: "skipped_already_billed",
          reason: `Race detectado — registro #${txOutcome.existingId} já existia para ${monthStr}/${year}`,
        });
        console.log(`[billing] Sub #${sub.id} (${patientName}) — race no lock, registro #${txOutcome.existingId} já existia`);
        continue;
      }

      result.generated++;
      result.recordIds.push(txOutcome.recordId);
      result.details.push({
        subscriptionId: sub.id,
        source: "patient_subscription",
        patientName,
        procedureName,
        amount: Number(sub.monthlyAmount),
        action: "generated",
        reason: `Registro #${txOutcome.recordId} criado — próxima cobrança: ${txOutcome.nextBillingDate}`,
      });

      console.log(`[billing] Sub #${sub.id} (${patientName}) — cobrança R$ ${Number(sub.monthlyAmount).toFixed(2)} gerada → registro #${txOutcome.recordId} | próxima: ${txOutcome.nextBillingDate}`);

    } catch (err) {
      result.errors++;
      result.details.push({
        subscriptionId: sub.id,
        source: "patient_subscription",
        patientName,
        procedureName,
        amount: Number(sub.monthlyAmount),
        action: "error",
        reason: err instanceof Error ? err.message : String(err),
      });
      console.error(`[billing] ERRO na sub #${sub.id} (${patientName}):`, err);
    }
  }

  console.log(
    `[billing] (subscriptions, LEGADO) Concluído: ${result.generated} geradas, ${result.skipped} puladas, ${result.errors} erros`
  );

  return result;
}
