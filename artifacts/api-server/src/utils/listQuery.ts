import { z } from "zod/v4";

/**
 * Schema base para query string de endpoints de listagem.
 *
 * Convenção:
 *  - `q`        — busca textual livre (nome, descrição, etc.)
 *  - `from/to`  — janela de datas no formato YYYY-MM-DD
 *  - `status`   — string única ou lista separada por vírgula
 *  - `sort`     — `field` (asc) ou `-field` (desc)
 *  - `limit`    — 1..100, default 20
 *  - `cursor`   — opaco (base64), retornado em `page.nextCursor`
 *
 * Cada rota pode estender este schema com filtros específicos.
 */
const emptyToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

export const listQuerySchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(200).optional()),
  from: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "from deve estar no formato YYYY-MM-DD")
      .optional(),
  ),
  to: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "to deve estar no formato YYYY-MM-DD")
      .optional(),
  ),
  status: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .min(1)
      .optional()
      .transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined)),
  ),
  sort: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^-?[a-zA-Z_][a-zA-Z0-9_]*$/, "sort deve ser um nome de campo opcionalmente prefixado com '-'")
      .optional(),
  ),
  limit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v === undefined ? undefined : Number(v)))
    .refine((v) => v === undefined || (Number.isFinite(v) && v >= 1 && v <= 100), {
      message: "limit deve estar entre 1 e 100",
    }),
  cursor: z.preprocess(emptyToUndefined, z.string().min(1).max(500).optional()),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

/**
 * Resolve `sort` em `{ field, direction }`. Se ausente, devolve `undefined`.
 * O chamador deve validar `field` contra uma whitelist antes de usar.
 */
export function parseSort(sort: string | undefined): { field: string; direction: "asc" | "desc" } | undefined {
  if (!sort) return undefined;
  if (sort.startsWith("-")) return { field: sort.slice(1), direction: "desc" };
  return { field: sort, direction: "asc" };
}
