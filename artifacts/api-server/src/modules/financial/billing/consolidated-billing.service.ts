/**
 * consolidatedBillingService — gera faturas consolidadas mensais
 *
 * Fluxo:
 * 1. Busca fontes ativas do tipo "faturaConsolidada"
 *    (patient_packages no novo regime / patient_subscriptions no legado)
 * 2. Verifica se hoje está na janela de faturamento (billingDay ± toleranceDays)
 * 3. Idempotência: não gera se já existe faturaConsolidada para o mês
 * 4. Soma todos os lançamentos "pendenteFatura" do período para aquela fonte
 * 5. Cria um único registro financeiro "faturaConsolidada" com o total
 * 6. Cancela os lançamentos individuais (já incluídos na fatura)
 * 7. Atualiza nextBillingDate da fonte
 *
 * ── Sprint 1 — Unificação ───────────────────────────────────────────────────
 * Igual a `runBilling`, o job pode rodar lendo de `patient_packages` (default
 * via `BILLING_FROM_PACKAGES=1`) ou no caminho legado de `patient_subscriptions`
 * (`BILLING_FROM_PACKAGES=0`).
 */

import { db } from "@workspace/db";
import {
  patientSubscriptionsTable,
  patientPackagesTable,
  financialRecordsTable,
  patientsTable,
  proceduresTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { todayBRT, nowBRT, lastDayOfMonth } from "../../../utils/dateUtils.js";
import {
  calcNextBillingDate,
  effectiveBillingDay,
  isWithinBillingWindow,
} from "./billing-date-utils.js";
import { withSubscriptionBillingLock, withPackageBillingLock } from "./billing-lock.js";

export interface ConsolidatedBillingResult {
  processed: number;
  generated: number;
  skipped: number;
  empty: number;
  errors: number;
  details: Array<{
    subscriptionId: number;
    source: "patient_package" | "patient_subscription";
    patientName: string;
    procedureName: string;
    totalAmount: number;
    sessionCount: number;
    action: "generated" | "skipped_already_billed" | "skipped_wrong_day" | "skipped_no_sessions" | "error";
    reason?: string;
  }>;
}

function billingFromPackagesEnabled(): boolean {
  return process.env.BILLING_FROM_PACKAGES !== "0";
}

export async function runConsolidatedBilling(options: {
  clinicId?: number;
  toleranceDays?: number;
  dryRun?: boolean;
  triggeredBy?: "scheduler" | "manual";
} = {}): Promise<ConsolidatedBillingResult> {
  return billingFromPackagesEnabled()
    ? runConsolidatedFromPackages(options)
    : runConsolidatedFromSubscriptions(options);
}

// ─── Novo regime: itera em patient_packages ─────────────────────────────────
async function runConsolidatedFromPackages(options: {
  clinicId?: number;
  toleranceDays?: number;
  dryRun?: boolean;
  triggeredBy?: "scheduler" | "manual";
}): Promise<ConsolidatedBillingResult> {
  const { clinicId, toleranceDays = 3, dryRun = false, triggeredBy = "scheduler" } = options;

  const todayStr = todayBRT();
  const brtToday = nowBRT();
  const { year, month } = brtToday;
  const monthStr   = String(month).padStart(2, "0");
  const monthStart = `${year}-${monthStr}-01`;
  const lastDay    = lastDayOfMonth(year, month);
  const monthEnd   = `${year}-${monthStr}-${String(lastDay).padStart(2, "0")}`;

  console.log(`[consolidated-billing] (packages) Iniciando ${dryRun ? "(DRY RUN) " : ""}em ${todayStr}${clinicId ? ` — clínica ${clinicId}` : ""} — origem: ${triggeredBy}`);

  const result: ConsolidatedBillingResult = {
    processed: 0,
    generated: 0,
    skipped: 0,
    empty: 0,
    errors: 0,
    details: [],
  };

  const baseConditions = [
    eq(patientPackagesTable.recurrenceStatus, "ativa"),
    eq(patientPackagesTable.recurrenceType, "faturaConsolidada"),
  ];
  if (clinicId) baseConditions.push(eq(patientPackagesTable.clinicId, clinicId));

  const activePackages = await db
    .select({
      pkg:               patientPackagesTable,
      patientName:       patientsTable.name,
      procedureName:     proceduresTable.name,
      procedureCategory: proceduresTable.category,
    })
    .from(patientPackagesTable)
    .leftJoin(patientsTable,   eq(patientPackagesTable.patientId,   patientsTable.id))
    .leftJoin(proceduresTable, eq(patientPackagesTable.procedureId, proceduresTable.id))
    .where(and(...baseConditions));

  console.log(`[consolidated-billing] ${activePackages.length} pacote(s) recorrente(s) consolidado(s) encontrado(s)`);

  for (const row of activePackages) {
    const pkg = row.pkg;
    result.processed++;

    const patientName   = row.patientName   ?? `Paciente #${pkg.patientId}`;
    const procedureName = row.procedureName ?? `Procedimento #${pkg.procedureId}`;
    const billingDay = pkg.billingDay;

    if (!billingDay) {
      result.skipped++;
      result.details.push({
        subscriptionId: pkg.id,
        source: "patient_package",
        patientName,
        procedureName,
        totalAmount: 0,
        sessionCount: 0,
        action: "skipped_wrong_day",
        reason: "Pacote consolidado sem billingDay — configuração inválida",
      });
      console.warn(`[consolidated-billing] Pacote #${pkg.id} (${patientName}) — sem billingDay, pulando`);
      continue;
    }

    try {
      // Janela de faturamento
      if (!isWithinBillingWindow(billingDay, brtToday, toleranceDays)) {
        result.skipped++;
        result.details.push({
          subscriptionId: pkg.id,
          source: "patient_package",
          patientName,
          procedureName,
          totalAmount: 0,
          sessionCount: 0,
          action: "skipped_wrong_day",
          reason: `Dia de faturamento: ${effectiveBillingDay(billingDay, year, month)}, hoje BRT: ${brtToday.day}`,
        });
        continue;
      }

      // Idempotência: já gerou fatura consolidada este mês para este pacote?
      const existing = await db
        .select({ id: financialRecordsTable.id })
        .from(financialRecordsTable)
        .where(
          and(
            eq(financialRecordsTable.patientPackageId, pkg.id),
            eq(financialRecordsTable.transactionType, "faturaConsolidada"),
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
          totalAmount: 0,
          sessionCount: 0,
          action: "skipped_already_billed",
          reason: `Já existe fatura consolidada #${existing[0].id} para ${monthStr}/${year}`,
        });
        console.log(`[consolidated-billing] Pacote #${pkg.id} (${patientName}) — já faturado em ${monthStr}/${year}, pulando`);
        continue;
      }

      // Lançamentos pendenteFatura linkados a este pacote
      const pendingRecords = await db
        .select()
        .from(financialRecordsTable)
        .where(
          and(
            eq(financialRecordsTable.patientPackageId, pkg.id),
            eq(financialRecordsTable.transactionType, "pendenteFatura"),
            eq(financialRecordsTable.status, "pendente")
          )
        );

      if (pendingRecords.length === 0) {
        result.empty++;
        result.details.push({
          subscriptionId: pkg.id,
          source: "patient_package",
          patientName,
          procedureName,
          totalAmount: 0,
          sessionCount: 0,
          action: "skipped_no_sessions",
          reason: "Nenhuma sessão pendente no período",
        });
        console.log(`[consolidated-billing] Pacote #${pkg.id} (${patientName}) — nenhuma sessão acumulada no período`);
        continue;
      }

      const accruedAmount = pendingRecords.reduce((sum, r) => sum + Number(r.amount), 0);
      const sessionCount = pendingRecords.length;
      // Para planos mensais fixos (faturaConsolidada com monthly_amount > 0)
      // o valor da fatura é o **valor contratual mensal**, não a soma das
      // parcelas acumuladas (que podem divergir por arredondamento ou por
      // mudanças no número de sessões agendadas durante o mês).
      const contractedMonthly = Number(pkg.monthlyAmount ?? 0);
      const totalAmount = contractedMonthly > 0 ? contractedMonthly : accruedAmount;

      if (dryRun) {
        result.generated++;
        result.details.push({
          subscriptionId: pkg.id,
          source: "patient_package",
          patientName,
          procedureName,
          totalAmount,
          sessionCount,
          action: "generated",
          reason: `dry-run: ${sessionCount} sessões, R$ ${totalAmount.toFixed(2)}`,
        });
        console.log(`[consolidated-billing] [DRY RUN] Pacote #${pkg.id} (${patientName}) — geraria fatura de R$ ${totalAmount.toFixed(2)} (${sessionCount} sessões)`);
        continue;
      }

      const txOutcome = await withPackageBillingLock(pkg.id, year, month, async (tx) => {
        const recheck = await tx
          .select({ id: financialRecordsTable.id })
          .from(financialRecordsTable)
          .where(
            and(
              eq(financialRecordsTable.patientPackageId, pkg.id),
              eq(financialRecordsTable.transactionType, "faturaConsolidada"),
              sql`${financialRecordsTable.createdAt} >= ${monthStart}::date`,
              sql`${financialRecordsTable.createdAt} < (${monthEnd}::date + interval '1 day')`,
            ),
          )
          .limit(1);

        if (recheck.length > 0) {
          return { duplicate: true as const, existingId: recheck[0].id };
        }

        const [invoiceRecord] = await tx
          .insert(financialRecordsTable)
          .values({
            type:             "receita",
            amount:           String(totalAmount.toFixed(2)),
            description:      `Fatura consolidada ${monthStr}/${year} — ${procedureName} (${sessionCount} sess.) — ${patientName}`,
            category:         row.procedureCategory ?? "Fatura Consolidada",
            patientId:        pkg.patientId,
            procedureId:      pkg.procedureId,
            clinicId:         pkg.clinicId ?? null,
            transactionType:  "faturaConsolidada",
            status:           "pendente",
            dueDate:          todayStr,
            patientPackageId: pkg.id,
          })
          .returning();

        await tx
          .update(financialRecordsTable)
          .set({ status: "cancelado" })
          .where(
            and(
              eq(financialRecordsTable.patientPackageId, pkg.id),
              eq(financialRecordsTable.transactionType, "pendenteFatura"),
              eq(financialRecordsTable.status, "pendente")
            )
          );

        const nextBillingDate = calcNextBillingDate(billingDay, year, month);
        await tx
          .update(patientPackagesTable)
          .set({ nextBillingDate })
          .where(eq(patientPackagesTable.id, pkg.id));

        return { duplicate: false as const, invoiceId: invoiceRecord.id, nextBillingDate };
      });

      if (txOutcome.duplicate) {
        result.skipped++;
        result.details.push({
          subscriptionId: pkg.id,
          source: "patient_package",
          patientName,
          procedureName,
          totalAmount: 0,
          sessionCount: 0,
          action: "skipped_already_billed",
          reason: `Race detectado — fatura #${txOutcome.existingId} já existia para ${monthStr}/${year}`,
        });
        console.log(`[consolidated-billing] Pacote #${pkg.id} (${patientName}) — race no lock, fatura #${txOutcome.existingId} já existia`);
        continue;
      }

      result.generated++;
      result.details.push({
        subscriptionId: pkg.id,
        source: "patient_package",
        patientName,
        procedureName,
        totalAmount,
        sessionCount,
        action: "generated",
        reason: `Fatura #${txOutcome.invoiceId} criada — ${sessionCount} sessões, R$ ${totalAmount.toFixed(2)} — próxima: ${txOutcome.nextBillingDate}`,
      });

      console.log(`[consolidated-billing] Pacote #${pkg.id} (${patientName}) — fatura #${txOutcome.invoiceId} gerada: R$ ${totalAmount.toFixed(2)} (${sessionCount} sessões)`);

    } catch (err) {
      result.errors++;
      result.details.push({
        subscriptionId: pkg.id,
        source: "patient_package",
        patientName,
        procedureName,
        totalAmount: 0,
        sessionCount: 0,
        action: "error",
        reason: err instanceof Error ? err.message : String(err),
      });
      console.error(`[consolidated-billing] ERRO no pacote #${pkg.id} (${patientName}):`, err);
    }
  }

  console.log(
    `[consolidated-billing] (packages) Concluído: ${result.generated} faturas geradas, ` +
    `${result.skipped} puladas, ${result.empty} sem sessões, ${result.errors} erros`
  );

  return result;
}

// ─── Caminho legado: itera em patient_subscriptions ─────────────────────────
async function runConsolidatedFromSubscriptions(options: {
  clinicId?: number;
  toleranceDays?: number;
  dryRun?: boolean;
  triggeredBy?: "scheduler" | "manual";
}): Promise<ConsolidatedBillingResult> {
  const { clinicId, toleranceDays = 3, dryRun = false, triggeredBy = "scheduler" } = options;

  const todayStr = todayBRT();
  const brtToday = nowBRT();
  const { year, month } = brtToday;
  const monthStr   = String(month).padStart(2, "0");
  const monthStart = `${year}-${monthStr}-01`;
  const lastDay    = lastDayOfMonth(year, month);
  const monthEnd   = `${year}-${monthStr}-${String(lastDay).padStart(2, "0")}`;

  console.log(`[consolidated-billing] (subscriptions, LEGADO) Iniciando ${dryRun ? "(DRY RUN) " : ""}em ${todayStr}${clinicId ? ` — clínica ${clinicId}` : ""} — origem: ${triggeredBy}`);

  const result: ConsolidatedBillingResult = {
    processed: 0,
    generated: 0,
    skipped: 0,
    empty: 0,
    errors: 0,
    details: [],
  };

  const whereClause = clinicId
    ? and(
        eq(patientSubscriptionsTable.status, "ativa"),
        eq(patientSubscriptionsTable.subscriptionType, "faturaConsolidada"),
        eq(patientSubscriptionsTable.clinicId, clinicId)
      )
    : and(
        eq(patientSubscriptionsTable.status, "ativa"),
        eq(patientSubscriptionsTable.subscriptionType, "faturaConsolidada")
      );

  const activeSubs = await db
    .select({
      subscription:    patientSubscriptionsTable,
      patientName:     patientsTable.name,
      procedureName:   proceduresTable.name,
      procedureCategory: proceduresTable.category,
    })
    .from(patientSubscriptionsTable)
    .leftJoin(patientsTable,    eq(patientSubscriptionsTable.patientId,   patientsTable.id))
    .leftJoin(proceduresTable,  eq(patientSubscriptionsTable.procedureId, proceduresTable.id))
    .where(whereClause);

  console.log(`[consolidated-billing] ${activeSubs.length} assinatura(s) de fatura consolidada encontrada(s)`);

  for (const row of activeSubs) {
    const sub = row.subscription;
    result.processed++;

    const patientName    = row.patientName    ?? `Paciente #${sub.patientId}`;
    const procedureName  = row.procedureName  ?? `Procedimento #${sub.procedureId}`;

    try {
      if (!isWithinBillingWindow(sub.billingDay, brtToday, toleranceDays)) {
        result.skipped++;
        result.details.push({
          subscriptionId: sub.id,
          source: "patient_subscription",
          patientName,
          procedureName,
          totalAmount: 0,
          sessionCount: 0,
          action: "skipped_wrong_day",
          reason: `Dia de faturamento: ${effectiveBillingDay(sub.billingDay, year, month)}, hoje BRT: ${brtToday.day}`,
        });
        continue;
      }

      const existing = await db
        .select({ id: financialRecordsTable.id })
        .from(financialRecordsTable)
        .where(
          and(
            eq(financialRecordsTable.subscriptionId, sub.id),
            eq(financialRecordsTable.transactionType, "faturaConsolidada"),
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
          totalAmount: 0,
          sessionCount: 0,
          action: "skipped_already_billed",
          reason: `Já existe fatura consolidada #${existing[0].id} para ${monthStr}/${year}`,
        });
        console.log(`[consolidated-billing] Sub #${sub.id} (${patientName}) — já faturada em ${monthStr}/${year}, pulando`);
        continue;
      }

      const pendingRecords = await db
        .select()
        .from(financialRecordsTable)
        .where(
          and(
            eq(financialRecordsTable.subscriptionId, sub.id),
            eq(financialRecordsTable.transactionType, "pendenteFatura"),
            eq(financialRecordsTable.status, "pendente")
          )
        );

      if (pendingRecords.length === 0) {
        result.empty++;
        result.details.push({
          subscriptionId: sub.id,
          source: "patient_subscription",
          patientName,
          procedureName,
          totalAmount: 0,
          sessionCount: 0,
          action: "skipped_no_sessions",
          reason: "Nenhuma sessão pendente no período",
        });
        console.log(`[consolidated-billing] Sub #${sub.id} (${patientName}) — nenhuma sessão acumulada no período`);
        continue;
      }

      const accruedAmount = pendingRecords.reduce((sum, r) => sum + Number(r.amount), 0);
      const sessionCount = pendingRecords.length;
      const contractedMonthly = Number(sub.monthlyAmount ?? 0);
      const totalAmount = contractedMonthly > 0 ? contractedMonthly : accruedAmount;

      if (dryRun) {
        result.generated++;
        result.details.push({
          subscriptionId: sub.id,
          source: "patient_subscription",
          patientName,
          procedureName,
          totalAmount,
          sessionCount,
          action: "generated",
          reason: `dry-run: ${sessionCount} sessões, R$ ${totalAmount.toFixed(2)}`,
        });
        console.log(`[consolidated-billing] [DRY RUN] Sub #${sub.id} (${patientName}) — geraria fatura de R$ ${totalAmount.toFixed(2)} (${sessionCount} sessões)`);
        continue;
      }

      const txOutcome = await withSubscriptionBillingLock(sub.id, year, month, async (tx) => {
        const recheck = await tx
          .select({ id: financialRecordsTable.id })
          .from(financialRecordsTable)
          .where(
            and(
              eq(financialRecordsTable.subscriptionId, sub.id),
              eq(financialRecordsTable.transactionType, "faturaConsolidada"),
              sql`${financialRecordsTable.createdAt} >= ${monthStart}::date`,
              sql`${financialRecordsTable.createdAt} < (${monthEnd}::date + interval '1 day')`,
            ),
          )
          .limit(1);

        if (recheck.length > 0) {
          return { duplicate: true as const, existingId: recheck[0].id };
        }

        const [invoiceRecord] = await tx
          .insert(financialRecordsTable)
          .values({
            type:            "receita",
            amount:          String(totalAmount.toFixed(2)),
            description:     `Fatura consolidada ${monthStr}/${year} — ${procedureName} (${sessionCount} sess.) — ${patientName}`,
            category:        row.procedureCategory ?? "Fatura Consolidada",
            patientId:       sub.patientId,
            procedureId:     sub.procedureId,
            clinicId:        sub.clinicId ?? null,
            transactionType: "faturaConsolidada",
            status:          "pendente",
            dueDate:         todayStr,
            subscriptionId:  sub.id,
          })
          .returning();

        await tx
          .update(financialRecordsTable)
          .set({ status: "cancelado" })
          .where(
            and(
              eq(financialRecordsTable.subscriptionId, sub.id),
              eq(financialRecordsTable.transactionType, "pendenteFatura"),
              eq(financialRecordsTable.status, "pendente")
            )
          );

        const nextBillingDate = calcNextBillingDate(sub.billingDay, year, month);
        await tx
          .update(patientSubscriptionsTable)
          .set({ nextBillingDate })
          .where(eq(patientSubscriptionsTable.id, sub.id));

        return { duplicate: false as const, invoiceId: invoiceRecord.id, nextBillingDate };
      });

      if (txOutcome.duplicate) {
        result.skipped++;
        result.details.push({
          subscriptionId: sub.id,
          source: "patient_subscription",
          patientName,
          procedureName,
          totalAmount: 0,
          sessionCount: 0,
          action: "skipped_already_billed",
          reason: `Race detectado — fatura #${txOutcome.existingId} já existia para ${monthStr}/${year}`,
        });
        console.log(`[consolidated-billing] Sub #${sub.id} (${patientName}) — race no lock, fatura #${txOutcome.existingId} já existia`);
        continue;
      }

      result.generated++;
      result.details.push({
        subscriptionId: sub.id,
        source: "patient_subscription",
        patientName,
        procedureName,
        totalAmount,
        sessionCount,
        action: "generated",
        reason: `Fatura #${txOutcome.invoiceId} criada — ${sessionCount} sessões, R$ ${totalAmount.toFixed(2)} — próxima: ${txOutcome.nextBillingDate}`,
      });

      console.log(`[consolidated-billing] Sub #${sub.id} (${patientName}) — fatura #${txOutcome.invoiceId} gerada: R$ ${totalAmount.toFixed(2)} (${sessionCount} sessões)`);

    } catch (err) {
      result.errors++;
      result.details.push({
        subscriptionId: sub.id,
        source: "patient_subscription",
        patientName,
        procedureName,
        totalAmount: 0,
        sessionCount: 0,
        action: "error",
        reason: err instanceof Error ? err.message : String(err),
      });
      console.error(`[consolidated-billing] ERRO na sub #${sub.id} (${patientName}):`, err);
    }
  }

  console.log(
    `[consolidated-billing] (subscriptions, LEGADO) Concluído: ${result.generated} faturas geradas, ` +
    `${result.skipped} puladas, ${result.empty} sem sessões, ${result.errors} erros`
  );

  return result;
}
