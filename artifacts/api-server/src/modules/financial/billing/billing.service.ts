import { randomUUID } from "node:crypto";
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
import { logger } from "../../../lib/logger.js";

export interface BillingResult {
  processed: number;
  generated: number;
  skipped: number;
  errors: number;
  recordIds: number[];
  details: BillingDetail[];
}

interface BillingDetail {
  packageId: number;
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
  // PR-FIN7-2 (B6): monthStart is the canonical idempotency key stored in
  // financial_records.plan_month_ref — timezone-safe, no createdAt range.
  const monthStart = `${year}-${monthStr}-01`;
  const lastDay = lastDayOfMonth(year, month);
  const monthEnd = `${year}-${monthStr}-${String(lastDay).padStart(2, "0")}`;

  logger.info(
    { dryRun, todayStr, toleranceDays, clinicId, triggeredBy },
    `[billing] Iniciando${dryRun ? " (DRY RUN)" : ""} — janela: ${toleranceDays} dias`,
  );

  const result: BillingResult = {
    processed: 0,
    generated: 0,
    skipped: 0,
    errors: 0,
    recordIds: [],
    details: [],
  };

  // PR-FIN7-3 (B7): Fase 1 — insere log com status='running' antes de processar.
  // Em caso de crash/kill, o log permanece 'running' para diagnóstico.
  const runId = randomUUID();
  let logId: number | null = null;
  if (!dryRun) {
    try {
      const [logRow] = await db
        .insert(billingRunLogsTable)
        .values({
          runId,
          triggeredBy,
          clinicId: clinicId ?? null,
          processed: 0,
          generated: 0,
          skipped: 0,
          errors: 0,
          dryRun: false,
          status: "running",
        })
        .returning({ id: billingRunLogsTable.id });
      logId = logRow?.id ?? null;
      logger.debug({ logId, runId }, "[billing] Log de início criado");
    } catch (logErr) {
      logger.error({ err: logErr }, "[billing] Falha ao criar log de início — prosseguindo sem log");
    }
  }

  try {
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

    logger.info({ count: activePackages.length }, "[billing] Pacotes recorrentes mensais ativos encontrados");

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
          packageId: pkg.id,
          source: "patient_package",
          patientName,
          procedureName,
          amount: 0,
          action: "skipped_wrong_day",
          reason: "Pacote recorrente sem billingDay/monthlyAmount — configuração inválida",
        });
        logger.warn({ packageId: pkg.id, patientName }, "[billing] Pacote sem billingDay/monthlyAmount, pulando");
        continue;
      }

      try {
        if (!isWithinBillingWindow(billingDay, brtToday, toleranceDays)) {
          const effective = effectiveBillingDay(billingDay, year, month);
          result.skipped++;
          result.details.push({
            packageId: pkg.id,
            source: "patient_package",
            patientName,
            procedureName,
            amount: Number(monthlyAmount),
            action: "skipped_wrong_day",
            reason: `Dia efetivo de cobrança: ${effective}, hoje (BRT): ${brtToday.day}`,
          });
          continue;
        }

        // PR-FIN7-2 (B6): idempotência por plan_month_ref, não por createdAt.
        // Elimina falsos negativos de fuso horário quando createdAt cai fora
        // da janela de datas local mas o registro pertence ao mês correto.
        const existing = await db
          .select({ id: financialRecordsTable.id })
          .from(financialRecordsTable)
          .where(
            and(
              eq(financialRecordsTable.patientPackageId, pkg.id),
              eq(financialRecordsTable.transactionType, "creditoAReceber"),
              eq(financialRecordsTable.planMonthRef, monthStart),
            )
          )
          .limit(1);

        if (existing.length > 0) {
          result.skipped++;
          result.details.push({
            packageId: pkg.id,
            source: "patient_package",
            patientName,
            procedureName,
            amount: Number(monthlyAmount),
            action: "skipped_already_billed",
            reason: `Já existe registro #${existing[0].id} para ${monthStr}/${year}`,
          });
          logger.debug({ packageId: pkg.id, patientName, existingId: existing[0].id }, "[billing] Já cobrado neste mês, pulando");
          continue;
        }

        if (dryRun) {
          result.generated++;
          result.details.push({
            packageId: pkg.id,
            source: "patient_package",
            patientName,
            procedureName,
            amount: Number(monthlyAmount),
            action: "generated",
            reason: "dry-run: nenhum registro criado",
          });
          logger.info({ packageId: pkg.id, patientName, amount: Number(monthlyAmount) }, "[billing] [DRY RUN] Geraria cobrança");
          continue;
        }

        const txOutcome = await withPackageBillingLock(pkg.id, year, month, async (tx) => {
          // PR-FIN7-2 (B6): inner recheck usa planMonthRef — mesma chave do outer.
          const recheck = await tx
            .select({ id: financialRecordsTable.id })
            .from(financialRecordsTable)
            .where(
              and(
                eq(financialRecordsTable.patientPackageId, pkg.id),
                eq(financialRecordsTable.transactionType, "creditoAReceber"),
                eq(financialRecordsTable.planMonthRef, monthStart),
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
              // PR-FIN7-2 (B6): marca o mês de referência para idempotência
              // timezone-safe. Imutável após criação.
              planMonthRef: monthStart,
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
            packageId: pkg.id,
            source: "patient_package",
            patientName,
            procedureName,
            amount: Number(monthlyAmount),
            action: "skipped_already_billed",
            reason: `Race detectado — registro #${txOutcome.existingId} já existia para ${monthStr}/${year}`,
          });
          logger.warn({ packageId: pkg.id, existingId: txOutcome.existingId }, "[billing] Race no lock, já existia");
          continue;
        }

        result.generated++;
        result.recordIds.push(txOutcome.recordId);
        result.details.push({
          packageId: pkg.id,
          source: "patient_package",
          patientName,
          procedureName,
          amount: Number(monthlyAmount),
          action: "generated",
          reason: `Registro #${txOutcome.recordId} criado — próxima cobrança: ${txOutcome.nextBillingDate}`,
        });

        logger.info(
          { packageId: pkg.id, recordId: txOutcome.recordId, nextBillingDate: txOutcome.nextBillingDate, amount: Number(monthlyAmount) },
          "[billing] Cobrança gerada com sucesso",
        );

      } catch (err) {
        result.errors++;
        result.details.push({
          packageId: pkg.id,
          source: "patient_package",
          patientName,
          procedureName,
          amount: Number(monthlyAmount ?? 0),
          action: "error",
          reason: err instanceof Error ? err.message : String(err),
        });
        logger.error({ err, packageId: pkg.id, patientName }, "[billing] ERRO ao processar pacote");
      }
    }

    logger.info(
      { generated: result.generated, skipped: result.skipped, errors: result.errors },
      "[billing] Processamento concluído",
    );

  } finally {
    // PR-FIN7-3 (B7): Fase 2 — atualiza o log com contadores finais e status
    // real. Sempre executa mesmo em caso de exceção não tratada.
    if (!dryRun && logId !== null) {
      const finalStatus = result.errors > 0 ? "failed" : "ok";
      try {
        await db
          .update(billingRunLogsTable)
          .set({
            status: finalStatus,
            processed: result.processed,
            generated: result.generated,
            skipped: result.skipped,
            errors: result.errors,
          })
          .where(eq(billingRunLogsTable.id, logId));
        logger.debug({ logId, status: finalStatus }, "[billing] Log de execução atualizado");
      } catch (logErr) {
        logger.error({ err: logErr, logId }, "[billing] Falha ao atualizar log de execução");
      }
    }
  }

  return result;
}
