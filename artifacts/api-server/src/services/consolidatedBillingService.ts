/**
 * consolidatedBillingService — gera faturas consolidadas mensais
 *
 * Fluxo:
 * 1. Busca assinaturas ativas do tipo "faturaConsolidada"
 * 2. Verifica se hoje está na janela de faturamento (billingDay ± toleranceDays)
 * 3. Idempotência: não gera se já existe faturaConsolidada para o mês
 * 4. Soma todos os lançamentos "pendenteFatura" do período para aquela assinatura
 * 5. Cria um único registro financeiro "faturaConsolidada" com o total
 * 6. Cancela os lançamentos individuais (já incluídos na fatura)
 * 7. Atualiza nextBillingDate da assinatura
 */

import { db } from "@workspace/db";
import {
  patientSubscriptionsTable,
  financialRecordsTable,
  patientsTable,
  proceduresTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { todayBRT, nowBRT, lastDayOfMonth } from "../utils/dateUtils.js";
import {
  calcNextBillingDate,
  effectiveBillingDay,
  isWithinBillingWindow,
} from "./billing/billingDateUtils.js";

export interface ConsolidatedBillingResult {
  processed: number;
  generated: number;
  skipped: number;
  empty: number;
  errors: number;
  details: Array<{
    subscriptionId: number;
    patientName: string;
    procedureName: string;
    totalAmount: number;
    sessionCount: number;
    action: "generated" | "skipped_already_billed" | "skipped_wrong_day" | "skipped_no_sessions" | "error";
    reason?: string;
  }>;
}

export async function runConsolidatedBilling(options: {
  clinicId?: number;
  toleranceDays?: number;
  dryRun?: boolean;
  triggeredBy?: "scheduler" | "manual";
} = {}): Promise<ConsolidatedBillingResult> {
  const { clinicId, toleranceDays = 3, dryRun = false, triggeredBy = "scheduler" } = options;

  const todayStr = todayBRT();
  const brtToday = nowBRT();
  const { year, month } = brtToday;
  const monthStr   = String(month).padStart(2, "0");
  const monthStart = `${year}-${monthStr}-01`;
  const lastDay    = lastDayOfMonth(year, month);
  const monthEnd   = `${year}-${monthStr}-${String(lastDay).padStart(2, "0")}`;

  console.log(`[consolidated-billing] Iniciando ${dryRun ? "(DRY RUN) " : ""}em ${todayStr}${clinicId ? ` — clínica ${clinicId}` : ""}`);

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
      // Verifica janela de faturamento
      if (!isWithinBillingWindow(sub.billingDay, brtToday, toleranceDays)) {
        result.skipped++;
        result.details.push({
          subscriptionId: sub.id,
          patientName,
          procedureName,
          totalAmount: 0,
          sessionCount: 0,
          action: "skipped_wrong_day",
          reason: `Dia de faturamento: ${effectiveBillingDay(sub.billingDay, year, month)}, hoje BRT: ${brtToday.day}`,
        });
        continue;
      }

      // Idempotência: já gerou fatura consolidada este mês?
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

      // Busca lançamentos pendenteFatura do período (desde início da assinatura até hoje)
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

      const totalAmount = pendingRecords.reduce((sum, r) => sum + Number(r.amount), 0);
      const sessionCount = pendingRecords.length;

      if (dryRun) {
        result.generated++;
        result.details.push({
          subscriptionId: sub.id,
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

      await db.transaction(async (tx) => {
        // Cria a fatura consolidada
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

        // Cancela os lançamentos individuais (já consolidados na fatura)
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

        // Atualiza nextBillingDate
        const nextBillingDate = calcNextBillingDate(sub.billingDay, year, month);
        await tx
          .update(patientSubscriptionsTable)
          .set({ nextBillingDate })
          .where(eq(patientSubscriptionsTable.id, sub.id));

        result.generated++;
        result.details.push({
          subscriptionId: sub.id,
          patientName,
          procedureName,
          totalAmount,
          sessionCount,
          action: "generated",
          reason: `Fatura #${invoiceRecord.id} criada — ${sessionCount} sessões, R$ ${totalAmount.toFixed(2)} — próxima: ${nextBillingDate}`,
        });

        console.log(`[consolidated-billing] Sub #${sub.id} (${patientName}) — fatura #${invoiceRecord.id} gerada: R$ ${totalAmount.toFixed(2)} (${sessionCount} sessões)`);
      });

    } catch (err) {
      result.errors++;
      result.details.push({
        subscriptionId: sub.id,
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
    `[consolidated-billing] Concluído: ${result.generated} faturas geradas, ` +
    `${result.skipped} puladas, ${result.empty} sem sessões, ${result.errors} erros`
  );

  return result;
}
