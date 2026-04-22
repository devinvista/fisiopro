import type { RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { runWithRequestContext } from "../lib/logger.js";

const HEADER = "x-request-id";

/**
 * Anexa um requestId a cada requisição (gerado ou herdado do header X-Request-Id)
 * e propaga via AsyncLocalStorage para o logger e qualquer código no escopo da request.
 * Também ecoa o header na resposta.
 */
export const requestContextMiddleware: RequestHandler = (req, res, next) => {
  const incoming = req.header(HEADER);
  const requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader(HEADER, requestId);
  runWithRequestContext({ requestId }, () => next());
};
