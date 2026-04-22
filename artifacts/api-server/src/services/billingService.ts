/**
 * billingService — geração automatizada de cobranças mensais
 *
 * Regras implementadas:
 * 1. Janela de tolerância de 3 dias: se o dia de cobrança caiu nos últimos
 *    3 dias e ainda não foi gerado registro este mês, processa agora.
 * 2. Meses curtos: billingDay 29/30/31 usa o último dia do mês quando
 *    o mês não tem esse dia.
 * 3. Idempotência segura: verifica por (subscription_id + mês/ano de
 *    created_at), nunca por dueDate (nullable).
 * 4. Isolamento por clínica: filtra por clinicId quando fornecido.
 * 5. Logging completo em cada etapa para auditoria.
 * 6. Grava log de cada execução em billing_run_logs para exibição na UI.
 */

import { db } from "@workspace/db";
import {
  patientSubscriptionsTable,
  financialRecordsTable,
  patientsTable,
  proceduresTable,
  billingRunLogsTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { todayBRT, nowBRT, lastDayOfMonth } from "../utils/dateUtils.js";
import {
  calcNextBillingDate,
  effectiveBillingDay,
  isWithinBillingWindow,
} from "./billing/billingDateUtils.js";

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
          patientName,
          procedureName,
          amount: Number(sub.monthlyAmount),
          action: "generated",
          reason: "dry-run: nenhum registro criado",
        });
        console.log(`[billing] [DRY RUN] Sub #${sub.id} (${patientName}) — geraria cobrança de R$ ${Number(sub.monthlyAmount).toFixed(2)}`);
        continue;
      }

      const [record] = await db
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
      await db
        .update(patientSubscriptionsTable)
        .set({ nextBillingDate })
        .where(eq(patientSubscriptionsTable.id, sub.id));

      result.generated++;
      result.recordIds.push(record.id);
      result.details.push({
        subscriptionId: sub.id,
        patientName,
        procedureName,
        amount: Number(sub.monthlyAmount),
        action: "generated",
        reason: `Registro #${record.id} criado — próxima cobrança: ${nextBillingDate}`,
      });

      console.log(`[billing] Sub #${sub.id} (${patientName}) — cobrança R$ ${Number(sub.monthlyAmount).toFixed(2)} gerada → registro #${record.id} | próxima: ${nextBillingDate}`);

    } catch (err) {
      result.errors++;
      result.details.push({
        subscriptionId: sub.id,
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
    `[billing] Concluído: ${result.generated} geradas, ${result.skipped} puladas, ${result.errors} erros`
  );

  // Grava log da execução (exceto dry-runs não geram log permanente)
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
