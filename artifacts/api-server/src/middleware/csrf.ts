import { randomBytes, timingSafeEqual } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { AUTH_COOKIE, CSRF_COOKIE, setCsrfCookie } from "./cookies.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const SKIP_PREFIXES = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/public",
  "/api/health",
  "/healthz",
];

function generateCsrfToken(): string {
  return randomBytes(32).toString("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

type CookieRequest = Request & { cookies?: Record<string, string> };

/**
 * Middleware de CSRF (double-submit cookie + header de resposta).
 *
 * - Garante a presença do cookie `fisiogest_csrf` (não httpOnly) em qualquer request.
 * - Sempre expõe o token atual no header de resposta `X-CSRF-Token` para que o
 *   frontend possa armazená-lo em memória (resiliente a bloqueio de cookies em iframes).
 * - Em métodos mutadores (POST/PUT/PATCH/DELETE) aceita o token tanto via cookie
 *   quanto via header `x-csrf-token`.
 * - Pulado para rotas públicas (login, register, /api/public, etc.).
 */
export function csrfMiddleware(req: CookieRequest, res: Response, next: NextFunction): void {
  const cookies = req.cookies ?? {};
  let cookieToken = cookies[CSRF_COOKIE];

  if (!cookieToken) {
    cookieToken = generateCsrfToken();
    setCsrfCookie(res, cookieToken);
  }

  // Sempre expõe o token no header de resposta para o frontend cachear em memória.
  res.setHeader("X-CSRF-Token", cookieToken);

  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  if (SKIP_PREFIXES.some((p) => req.path.startsWith(p))) {
    next();
    return;
  }

  // Sem cookie de auth → request anônimo, sem ambient credentials → não há CSRF.
  if (!cookies[AUTH_COOKIE]) {
    next();
    return;
  }

  const headerToken = req.header("x-csrf-token");
  if (!headerToken || !safeEqual(headerToken, cookieToken)) {
    res.status(403).json({
      error: "Forbidden",
      code: "CSRF_INVALID",
      message: "Token CSRF ausente ou inválido. Recarregue a página e tente novamente.",
    });
    return;
  }

  next();
}
