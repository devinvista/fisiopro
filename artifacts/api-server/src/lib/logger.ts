import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import pino, { type Logger } from "pino";

interface RequestContext {
  requestId: string;
  userId?: number;
  clinicId?: number;
}

const requestContext = new AsyncLocalStorage<RequestContext>();

const isProduction = process.env.NODE_ENV === "production";

const baseLogger: Logger = pino({
  level: process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug"),
  base: { service: "api-server" },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:HH:MM:ss.l",
            ignore: "pid,hostname,service",
          },
        },
      }),
  redact: {
    paths: [
      "password",
      "passwordHash",
      "token",
      "*.password",
      "*.passwordHash",
      "*.token",
      "req.headers.authorization",
      "req.headers.cookie",
    ],
    remove: true,
  },
});

/**
 * Logger estruturado com correlation ID automático.
 * Sempre que chamado dentro de um request HTTP, anexa o requestId ao log.
 */
const LEVEL_METHODS = new Set(["info", "warn", "error", "debug", "trace", "fatal"]);

export const logger = new Proxy(baseLogger, {
  get(target, prop: string | symbol) {
    const value = (target as unknown as Record<string | symbol, unknown>)[prop];
    // Para métodos de log de nível, injeta o requestContext (se existir) via child logger.
    if (typeof prop === "string" && LEVEL_METHODS.has(prop)) {
      const ctx = requestContext.getStore();
      if (ctx) {
        const child = target.child({
          requestId: ctx.requestId,
          userId: ctx.userId,
          clinicId: ctx.clinicId,
        });
        const childMethod = (child as unknown as Record<string, unknown>)[prop];
        return typeof childMethod === "function" ? (childMethod as (...args: unknown[]) => unknown).bind(child) : value;
      }
    }
    // Para qualquer outro método/prop (notavelmente `child`, usado por pino-http para anexar
    // serializers de req/res), preserva o `this` correto via bind no target original.
    // Sem isso, pino-http cria um child logger sem serializers e o log dump de cada request
    // serializa o objeto req/res inteiro (centenas de linhas).
    if (typeof value === "function") return (value as (...args: unknown[]) => unknown).bind(target);
    return value;
  },
}) as Logger;

export function runWithRequestContext<T>(ctx: Partial<RequestContext>, fn: () => T): T {
  const requestId = ctx.requestId ?? randomUUID();
  return requestContext.run({ ...ctx, requestId }, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return requestContext.getStore();
}

export function updateRequestContext(patch: Partial<RequestContext>): void {
  const current = requestContext.getStore();
  if (current) Object.assign(current, patch);
}
