import { z } from "zod/v4";
import { positiveNumber } from "../../utils/validate.js";

export const createRecordSchema = z.object({
  type: z.enum(["receita", "despesa"]).default("despesa"),
  amount: positiveNumber,
  description: z.string().min(1, "Descrição é obrigatória").max(500),
  category: z.string().max(100).optional().nullable(),
  patientId: z.number().int().positive().optional().nullable(),
  procedureId: z.number().int().positive().optional().nullable(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "paymentDate deve estar no formato YYYY-MM-DD").optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dueDate deve estar no formato YYYY-MM-DD").optional().nullable(),
  status: z.enum(["pendente", "pago", "cancelado"]).optional().default("pago"),
  paymentMethod: z.string().max(50).optional().nullable(),
});

export const updateRecordSchema = z.object({
  type: z.enum(["receita", "despesa"]).optional(),
  amount: positiveNumber.optional(),
  description: z.string().min(1).max(500).optional(),
  category: z.string().max(100).optional().nullable(),
  procedureId: z.number().int().positive().optional().nullable(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  status: z.enum(["pendente", "pago", "cancelado", "estornado"]).optional(),
  paymentMethod: z.string().max(50).optional().nullable(),
});

export const createPaymentSchema = z.object({
  amount: positiveNumber,
  paymentMethod: z.string().max(50).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  procedureId: z.number().int().positive().optional().nullable(),
});

export const updateRecordStatusSchema = z.object({
  status: z.enum(["pendente", "pago", "cancelado", "estornado"], { error: "Status inválido" }),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "paymentDate deve estar no formato YYYY-MM-DD").optional().nullable(),
  paymentMethod: z.string().max(50).optional().nullable(),
});
