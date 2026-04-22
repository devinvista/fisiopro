import cron from "node-cron";
import { logger } from "../lib/logger.js";
import { captureException } from "../lib/sentry.js";

export const TZ = "America/Sao_Paulo";

export interface JobOpts {
  name: string;
  cronExpr: string;
  silentSuccess?: boolean;
  run: () => Promise<object>;
}

export function registerJob({ name, cronExpr, run, silentSuccess }: JobOpts): void {
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
