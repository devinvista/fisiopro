import * as Sentry from "@sentry/react";

let initialized = false;

/**
 * Inicializa Sentry no frontend.
 * Sem efeito se VITE_SENTRY_DSN não estiver definido (ex.: dev local).
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) {
    if (import.meta.env.DEV) {
      console.info("[sentry] DSN ausente — observabilidade Sentry desativada");
    }
    return;
  }
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE as string | undefined,
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  });
  initialized = true;
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

export { Sentry };
