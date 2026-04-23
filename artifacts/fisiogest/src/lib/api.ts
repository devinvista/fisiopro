type UnauthorizedHandler = (url: string) => void;

let _onUnauthorized: UnauthorizedHandler | null = null;

/**
 * Registra um callback chamado quando o servidor responder 401.
 * Permite logout automático sem monkey-patching do `window.fetch`.
 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  _onUnauthorized = handler;
}

const CSRF_COOKIE = "fisiogest_csrf";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
/** Base path para chamadas REST. Ex.: "" em dev/raiz ou "/fisiogest" em deploy. */
export const API_BASE = BASE.replace(/\/[^/]+$/, "");

/**
 * Compatibilidade: alguns componentes legados ainda chamam `getAuthToken()`.
 * Com o JWT em cookie httpOnly, o token não é mais acessível pelo JS — sempre
 * retornamos `null`. Esses chamadores devem migrar para `apiFetch*`.
 */
export function getAuthToken(): string | null {
  return null;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const target = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(target)) {
      return decodeURIComponent(trimmed.substring(target.length));
    }
  }
  return null;
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Wrapper de baixo nível: anexa CSRF e usa cookies httpOnly de auth. */
export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const method = (init?.method ?? "GET").toUpperCase();
  if (MUTATING_METHODS.has(method)) {
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf && !headers.has("x-csrf-token")) {
      headers.set("x-csrf-token", csrf);
    }
  }
  return fetch(input, { ...init, headers, credentials: init?.credentials ?? "include" });
}

async function extractError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body === "object" && "message" in body && body.message) {
      return String((body as { message: unknown }).message);
    }
  } catch {
    /* ignore */
  }
  return `HTTP ${res.status}`;
}

/**
 * GET autenticado que devolve o JSON tipado. Lança `Error` em status != 2xx
 * com a mensagem do backend (campo `message`) quando disponível.
 * Retorna `undefined` em respostas 204 No Content.
 */
export async function apiFetchJson<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const res = await apiFetch(input, init);
  if (!res.ok) {
    if (res.status === 401 && _onUnauthorized) {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
      _onUnauthorized(url);
    }
    throw new Error(await extractError(res));
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/**
 * Atalho para POST/PUT/PATCH/DELETE com body JSON. Já adiciona o header
 * `Content-Type` e serializa o `body` recebido. Compartilha o mesmo tratamento
 * de erro de `apiFetchJson`.
 */
export async function apiSendJson<T = unknown>(
  url: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return apiFetchJson<T>(url, init);
}
