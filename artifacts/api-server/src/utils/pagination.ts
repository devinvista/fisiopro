/**
 * Helpers de paginação cursor-based.
 *
 * Estratégia: cursor opaco em base64url contendo `{ v, id }`, onde `v` é o
 * valor da coluna primária de ordenação (ISO date para timestamps, número
 * para ids puros) e `id` é o desempate determinístico.
 *
 * O envelope de resposta padronizado é:
 *   { data: T[], page: { limit, hasMore, nextCursor: string | null, total?: number } }
 */

export const DEFAULT_LIST_LIMIT = 20;
export const MAX_LIST_LIMIT = 100;

export interface PageInfo {
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
  /** Opcional — só enviado quando o endpoint puder calcular sem custo proibitivo. */
  total?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  page: PageInfo;
}

export interface CursorPayload {
  /** Valor da coluna primária de ordenação (string ISO, número, etc.). */
  v: string | number;
  /** ID de desempate (PK numérica). */
  id: number;
}

export function encodeCursor(payload: CursorPayload): string {
  const json = JSON.stringify(payload);
  return Buffer.from(json, "utf-8").toString("base64url");
}

export function decodeCursor(cursor: string | undefined | null): CursorPayload | null {
  if (!cursor) return null;
  try {
    const json = Buffer.from(cursor, "base64url").toString("utf-8");
    const parsed = JSON.parse(json) as Partial<CursorPayload>;
    if (
      (typeof parsed.v === "string" || typeof parsed.v === "number") &&
      typeof parsed.id === "number"
    ) {
      return { v: parsed.v, id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}

export function clampLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit)) return DEFAULT_LIST_LIMIT;
  return Math.max(1, Math.min(MAX_LIST_LIMIT, Math.trunc(limit)));
}

/**
 * Constrói o envelope `{ data, page }` a partir de uma query que pediu
 * `limit + 1` linhas. Se vierem `limit + 1`, há próxima página.
 */
export function buildPage<T>(
  rows: T[],
  limit: number,
  cursorOf: (row: T) => CursorPayload,
  total?: number,
): PaginatedResponse<T> {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data[data.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(cursorOf(last)) : null;
  const page: PageInfo = { limit, hasMore, nextCursor };
  if (total !== undefined) page.total = total;
  return { data, page };
}
