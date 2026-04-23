import type { CookieOptions, Response } from "express";

export const AUTH_COOKIE = "fisiogest_auth";
export const CSRF_COOKIE = "fisiogest_csrf";

const isProd = process.env.NODE_ENV === "production";

export const AUTH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const baseAuthCookie: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: "lax",
  path: "/",
  maxAge: AUTH_COOKIE_MAX_AGE_MS,
};

const baseCsrfCookie: CookieOptions = {
  httpOnly: false,
  secure: isProd,
  sameSite: "lax",
  path: "/",
  maxAge: AUTH_COOKIE_MAX_AGE_MS,
};

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE, token, baseAuthCookie);
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE, { ...baseAuthCookie, maxAge: undefined });
}

export function setCsrfCookie(res: Response, value: string): void {
  res.cookie(CSRF_COOKIE, value, baseCsrfCookie);
}

export function clearCsrfCookie(res: Response): void {
  res.clearCookie(CSRF_COOKIE, { ...baseCsrfCookie, maxAge: undefined });
}
