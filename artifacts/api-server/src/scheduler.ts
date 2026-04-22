/**
 * scheduler — CRON de cobranças recorrentes e políticas de agendamento
 *
 * Cada job é instrumentado com logger estruturado (pino) capturando:
 *  - início (debug)
 *  - duração em ms (info)
 *  - sucesso/erro contável
 *  - falhas críticas via captureException (Sentry)
 */

import cron from "node-cron";
import { runBilling } from "./modules/financial/billing/billing.service.js";
import { runConsolidatedBilling } from "./modules/financial/billing/consolidated-billing.service.js";
import { runAutoConfirmPolicies, runEndOfDayPolicies } from "./modules/clinical/policies/policy.service.js";
import { runSubscriptionCheck } from "./modules/saas/subscriptions/subscription.service.js";
import { logger } from "./lib/logger.js";
import { captureException } from "./lib/sentry.js";

const TZ = "America/Sao_Paulo";

const BILLING_CRON              = "0 9 * * *";    // 09:00 UTC = 06:00 BRT
const CONSOLIDATED_BILLING_CRON = "5 9 * * *";    // 09:05 UTC = 06:05 BRT
const AUTO_CONFIRM_CRON         = "*/15 * * * *"; // a cada 15 minutos
const END_OF_DAY_CRON           = "0 22 * * *";   // 22:00 BRT
const SUBSCRIPTION_CHECK_CRON   = "0 10 * * *";   // 10:00 UTC = 07:00 BRT

interface JobOpts {
  name: string;
  cronExpr: string;
  silentSuccess?: boolean; // não loga sucessos com 0 efeito
  run: () => Promise<object>;
}

function registerJob({ name, cronExpr, run, silentSuccess }: JobOpts): void {
  if (!cron.validate(cronExpr)) {
    logger.error({ job: name, cronExpr }, `[scheduler] expressão CRON inválida para ${name}`);
    return;
  }
  cron.schedule(
    cronExpr,
    async () => {
      const startedAt = Date.now();
      logger.debug({ job: name }, `[scheduler] iniciando ${name}`);
      try {
        const result = (await run()) as Record<string, unknown>;
        const durationMs = Date.now() - startedAt;
        const errors = typeof result.errors === "number" ? result.errors : 0;
        const hasEffect = Object.entries(result).some(
          ([k, v]) => k !== "details" && k !== "errors" && typeof v === "number" && v > 0,
        );
        if (silentSuccess && !hasEffect && errors === 0) return;
        logger[errors > 0 ? "warn" : "info"](
          { job: name, durationMs, ...result, details: undefined },
          `[scheduler] ${name} concluído em ${durationMs}ms`,
        );
      } catch (err) {
        const durationMs = Date.now() - startedAt;
        logger.error({ job: name, durationMs, err }, `[scheduler] falha crítica em ${name}`);
        captureException(err, { job: name, durationMs });
      }
    },
    { timezone: TZ },
  );
  logger.info({ job: name, cronExpr, timezone: TZ }, `[scheduler] ${name} agendado (${cronExpr})`);
}

export function startScheduler(): void {
  registerJob({
    name: "billing",
    cronExpr: BILLING_CRON,
    run: () => runBilling({ toleranceDays: 3, triggeredBy: "scheduler" }),
  });

  registerJob({
    name: "consolidatedBilling",
    cronExpr: CONSOLIDATED_BILLING_CRON,
    run: () => runConsolidatedBilling({ toleranceDays: 3, triggeredBy: "scheduler" }),
  });

  registerJob({
    name: "autoConfirm",
    cronExpr: AUTO_CONFIRM_CRON,
    silentSuccess: true,
    run: () => runAutoConfirmPolicies(),
  });

  registerJob({
    name: "endOfDay",
    cronExpr: END_OF_DAY_CRON,
    run: () => runEndOfDayPolicies(),
  });

  registerJob({
    name: "subscriptionCheck",
    cronExpr: SUBSCRIPTION_CHECK_CRON,
    run: () => runSubscriptionCheck(),
  });
}
