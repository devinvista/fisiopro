import type { Response } from "express";
import { z } from "zod/v4";

export function parseIntParam(value: string | string[] | undefined, res: Response, label = "ID"): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) {
    res.status(400).json({ error: "Bad Request", message: `${label} é obrigatório` });
    return null;
  }
  const n = parseInt(raw, 10);
  if (isNaN(n) || n <= 0) {
    res.status(400).json({ error: "Bad Request", message: `${label} inválido` });
    return null;
  }
  return n;
}

export function validateBody<T>(
  schema: z.ZodType<T>,
  body: unknown,
  res: Response
): T | null {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    }));
    res.status(400).json({
      error: "Bad Request",
      message: issues[0]?.message ?? "Dados inválidos",
      issues,
    });
    return null;
  }
  return result.data;
}

export const positiveNumber = z
  .union([z.number(), z.string()])
  .transform((v) => Number(v))
  .refine((v) => !isNaN(v) && v > 0, { message: "Deve ser um número maior que zero" });

export const optionalPositiveNumber = z
  .union([z.number(), z.string()])
  .transform((v) => Number(v))
  .refine((v) => !isNaN(v) && v >= 0, { message: "Deve ser um número não negativo" })
  .optional();
