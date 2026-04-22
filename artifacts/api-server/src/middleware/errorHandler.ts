import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod/v4";
import { HttpError } from "../utils/httpError.js";
import { logger } from "../lib/logger.js";
import { captureException } from "../lib/sentry.js";

/**
 * Middleware central de erros.
 * Deve ser registrado APÓS todas as rotas em app.ts.
 *
 * Converte:
 *  - HttpError       → status configurado + JSON { error, message, issues? }
 *  - ZodError        → 400 Bad Request com lista de issues
 *  - qualquer outro  → 500 Internal Server Error (mensagem só em desenvolvimento)
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (res.headersSent) return;

  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: err.error,
      message: err.message,
      ...(err.issues !== undefined ? { issues: err.issues } : {}),
    });
    return;
  }

  if (err instanceof ZodError) {
    const issues = err.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    }));
    res.status(400).json({
      error: "Bad Request",
      message: issues[0]?.message ?? "Dados inválidos",
      issues,
    });
    return;
  }

  // Log apenas erros inesperados — HttpError/ZodError são fluxo normal.
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
