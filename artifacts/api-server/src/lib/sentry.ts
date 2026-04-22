import * as Sentry from "@sentry/node";
import { logger } from "./logger.js";

let initialized = false;

/**
 * Inicializa Sentry no backend.
 * Sem efeito se SENTRY_DSN_BACKEND não estiver definido (ex.: dev local).
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN_BACKEND;
  if (!dsn) {
    logger.info("[sentry] DSN ausente — observabilidade Sentry desativada");
    return;
  }
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  });
  initialized = true;
  logger.info("[sentry] inicializado");
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

export { Sentry };
