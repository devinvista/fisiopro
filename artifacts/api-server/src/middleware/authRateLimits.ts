import rateLimit from "express-rate-limit";
import type { Request } from "express";
import { PgRateLimitStore } from "./rateLimitStore.js";

/**
 * Per-email rate limit for /api/auth/forgot-password.
 * Protects a single victim from being email-bombed by attackers rotating IPs.
 * Keyed by the lowercased e-mail in the request body.
 */
export const forgotPasswordEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: new PgRateLimitStore("auth:forgot-email"),
  keyGenerator: (req: Request) => {
    const email = typeof req.body?.email === "string" ? req.body.email : "";
    const normalized = email.trim().toLowerCase();
    // Fall back to IP when the body has no e-mail — let Zod reject the request.
    return normalized || `ip:${req.ip ?? "unknown"}`;
  },
  // Don't count requests where validation will fail anyway.
  skip: (req) => typeof req.body?.email !== "string" || req.body.email.trim() === "",
  message: {
    error: "Too Many Requests",
    message:
      "Muitas solicitações de redefinição para este e-mail. Aguarde alguns minutos antes de tentar novamente.",
  },
});

/**
 * Per-token rate limit for /api/auth/reset-password.
 * Caps brute-force attempts against a single token. Tokens are 32 random
 * bytes so brute force is already infeasible, but this is defense in depth.
 * Keyed by the submitted token (truncated so long garbage doesn't bloat keys).
 */
export const resetPasswordTokenLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: new PgRateLimitStore("auth:reset-token"),
  keyGenerator: (req: Request) => {
    const token = typeof req.body?.token === "string" ? req.body.token : "";
    const trimmed = token.slice(0, 64);
    return trimmed || `ip:${req.ip ?? "unknown"}`;
  },
  skip: (req) => typeof req.body?.token !== "string" || req.body.token.length < 10,
  message: {
    error: "Too Many Requests",
    message:
      "Muitas tentativas com este token. Solicite um novo link de redefinição.",
  },
});
