import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod/v4";
import { HttpError } from "../utils/httpError.js";
import { logger } from "../lib/logger.js";
import { captureException } from "../lib/sentry.js";

/**
 * Middleware central de erros. Registrar APÓS todas as rotas em app.ts.
 *
 * Formato uniforme da resposta:
 *   { error: string, message: string, details?: unknown }
 *
 * - HttpError → status configurado, `details` opcional via `httpError.issues`
 * - ZodError  → 400 Bad Request com lista de issues em `details`
 * - resto     → 500 Internal Server Error (mensagem só em dev)
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (res.headersSent) return;

  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: err.error,
      message: err.message,
      ...(err.issues !== undefined ? { details: err.issues } : {}),
    });
    return;
  }

  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    }));
    res.status(400).json({
      error: "Bad Request",
      message: details[0]?.message ?? "Dados inválidos",
      details,
    });
    return;
  }

  logger.error(
    { err, method: req.method, url: req.originalUrl },
    `[errorHandler] erro inesperado em ${req.method} ${req.originalUrl}`,
  );
  captureException(err, { method: req.method, url: req.originalUrl });

  const message =
    process.env.NODE_ENV === "production"
      ? "Erro interno do servidor"
      : err instanceof Error
        ? err.message
        : "Erro interno do servidor";

  res.status(500).json({ error: "Internal Server Error", message });
};
