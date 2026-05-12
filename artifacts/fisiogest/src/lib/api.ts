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
const CSRF_RESPONSE_HEADER = "x-csrf-token";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
/** Base path para chamadas REST. Ex.: "" em dev/raiz ou "/fisiogest" em deploy. */
export const API_BASE = BASE.replace(/\/[^/]+$/, "");

/**
 * Token CSRF em memória — mais confiável que `document.cookie` em contextos de
 * iframe cross-origin onde o acesso a cookies pode ser bloqueado pelo browser.
 * Atualizado automaticamente a partir do header `X-CSRF-Token` de qualquer resposta.
 */
let _csrfTokenMemory: string | null = null;

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

/** Retorna o token CSRF — preferindo o valor em memória ao cookie. */
export function getCsrfToken(): string | null {
  return _csrfTokenMemory ?? readCookie(CSRF_COOKIE);
}

/** Extrai o token CSRF do header de resposta e o armazena em memória. */
function saveCsrfFromResponse(res: Response): void {
  const token = res.headers.get(CSRF_RESPONSE_HEADER);
  if (token) {
    _csrfTokenMemory = token;
  }
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const REQUEST_ID_HEADER = "x-request-id";

function genRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Wrapper de baixo nível: anexa CSRF + x-request-id e usa cookies httpOnly de auth. */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const method = (init?.method ?? "GET").toUpperCase();

  if (MUTATING_METHODS.has(method)) {
    const csrf = getCsrfToken();
    if (csrf && !headers.has("x-csrf-token")) {
      headers.set("x-csrf-token", csrf);
    }
  }

  if (!headers.has(REQUEST_ID_HEADER)) {
    headers.set(REQUEST_ID_HEADER, genRequestId());
  }

  const res = await fetch(input, { ...init, headers, credentials: init?.credentials ?? "include" });

  // Salva o token CSRF em memória para uso em próximas requisições.
  saveCsrfFromResponse(res);

  // Auto-retry em erro CSRF: faz um GET para obter token fresco, depois retenta.
  if (res.status === 403 && MUTATING_METHODS.has(method)) {
    let isCsrf = false;
    try {
      const body = await res.clone().json();
      isCsrf = body?.code === "CSRF_INVALID" || String(body?.message ?? "").toLowerCase().includes("csrf");
    } catch {
      /* ignore */
    }

    if (isCsrf) {
      // Busca um token CSRF fresco via GET (sem efeitos colaterais).
      try {
        const refresh = await fetch(`${API_BASE}/api/health`, {
          method: "GET",
          credentials: "include",
        });
        saveCsrfFromResponse(refresh);
      } catch {
        /* ignore — retenta de qualquer forma */
      }

      // Retenta a requisição original com o token atualizado.
      const retryHeaders = new Headers(init?.headers);
      const freshCsrf = getCsrfToken();
      if (freshCsrf) retryHeaders.set("x-csrf-token", freshCsrf);
      if (!retryHeaders.has(REQUEST_ID_HEADER)) retryHeaders.set(REQUEST_ID_HEADER, genRequestId());

      const retryRes = await fetch(input, {
        ...init,
        headers: retryHeaders,
        credentials: init?.credentials ?? "include",
      });
      saveCsrfFromResponse(retryRes);
      return retryRes;
    }
  }

  return res;
}

/**
 * Erro lançado quando o backend retorna 402 com `limitReached: true`. Carrega
 * todos os dados necessários para o frontend exibir o diálogo contextual de
 * upgrade sem precisar de um round-trip extra para descobrir plano alvo.
 */
export interface PlanLimitInfo {
  resource: "patients" | "users" | "professionals" | "schedules";
  limit: number;
  current: number;
  planName: string;
  planDisplayName: string;
  requiredPlan: {
    name: string;
    displayName: string;
    price: string | number;
    limit: number | null;
  } | null;
  message: string;
}

export class PlanLimitError extends Error {
  readonly info: PlanLimitInfo;
  constructor(info: PlanLimitInfo) {
    super(info.message);
    this.name = "PlanLimitError";
    this.info = info;
  }
}

export function isPlanLimitPayload(body: unknown): body is PlanLimitInfo {
  return (
    !!body &&
    typeof body === "object" &&
    (body as { limitReached?: unknown }).limitReached === true &&
    typeof (body as { resource?: unknown }).resource === "string"
  );
}

async function readErrorBody(res: Response): Promise<{ body: unknown; reqId: string | null }> {
  const reqId = res.headers.get(REQUEST_ID_HEADER);
  try {
    return { body: await res.json(), reqId };
  } catch {
    return { body: null, reqId };
  }
}

function formatErrorMessage(body: unknown, status: number, reqId: string | null): string {
  const suffix = reqId ? ` [reqId=${reqId}]` : "";
  if (body && typeof body === "object" && "message" in body && (body as { message: unknown }).message) {
    return `${String((body as { message: unknown }).message)}${suffix}`;
  }
  return `HTTP ${status}${suffix}`;
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
    const { body, reqId } = await readErrorBody(res);
    if (res.status === 402 && isPlanLimitPayload(body)) {
      throw new PlanLimitError(body);
    }
    throw new Error(formatErrorMessage(body, res.status, reqId));
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
