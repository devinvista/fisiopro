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
 * Middleware de CSRF (double-submit cookie).
 *
 * - Garante a presença do cookie `fisiogest_csrf` (não httpOnly) em qualquer request.
 * - Em métodos mutadores (POST/PUT/PATCH/DELETE) exige o header `x-csrf-token`
 *   com o mesmo valor do cookie.
 * - Pulado para rotas públicas (login, register, /api/public, etc.) e para
 *   chamadas autenticadas via `Authorization: Bearer ...` (não vulneráveis a CSRF).
 */
export function csrfMiddleware(req: CookieRequest, res: Response, next: NextFunction): void {
  const cookies = req.cookies ?? {};
  let cookieToken = cookies[CSRF_COOKIE];

  if (!cookieToken) {
    cookieToken = generateCsrfToken();
    setCsrfCookie(res, cookieToken);
  }

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
    // Mas se vier Bearer token explícito, também não há CSRF (não é cookie).
    next();
    return;
  }

  const headerToken = req.header("x-csrf-token");
  if (!headerToken || !safeEqual(headerToken, cookieToken)) {
    res.status(403).json({
      error: "Forbidden",
      message: "Token CSRF ausente ou inválido. Recarregue a página e tente novamente.",
    });
    return;
  }

  next();
}
