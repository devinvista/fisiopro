import { z } from "zod/v4";
import { optionalPositiveNumber } from "../../../utils/validate.js";

export const procedureCategoryEnum = z.enum(["Reabilitação", "Estética", "Pilates", "Outro"]);
export const procedureModalidadeEnum = z.enum(["individual", "dupla", "grupo"]);
export const procedureBillingTypeEnum = z.enum(["porSessao", "mensal"]);

/**
 * Base sem refinements — necessário para podermos derivar `updateProcedureSchema`
 * com `.partial()` (Zod v4 proíbe `partial()` em schemas com refine).
 */
const procedureBaseSchema = z.object({
    name: z.string().min(1, "Nome é obrigatório").max(200),
    category: procedureCategoryEnum,
    modalidade: procedureModalidadeEnum.default("individual"),
    durationMinutes: z
      .union([z.number(), z.string()])
      .transform(Number)
      .refine((v) => Number.isInteger(v) && v > 0, "Duração deve ser um inteiro positivo"),
    price: z
      .union([z.number(), z.string()])
      .transform(Number)
      .refine((v) => !isNaN(v) && v >= 0, "Preço deve ser não-negativo"),
    cost: z
      .union([z.number(), z.string()])
      .transform(Number)
      .refine((v) => !isNaN(v) && v >= 0)
      .optional(),
    description: z.string().max(1000).optional().nullable(),
    maxCapacity: z
      .union([z.number(), z.string()])
      .transform(Number)
      .refine((v) => Number.isInteger(v) && v > 0)
      .optional()
      .nullable(),
    onlineBookingEnabled: z.boolean().optional().default(false),
    billingType: procedureBillingTypeEnum.default("porSessao"),
    monthlyPrice: z
      .union([z.number(), z.string()])
      .transform(Number)
      .refine((v) => !isNaN(v) && v > 0)
      .optional()
      .nullable(),
    billingDay: z
      .union([z.number(), z.string()])
      .transform(Number)
      .refine(
        (v) => Number.isInteger(v) && v >= 1 && v <= 31,
        "billingDay deve ser entre 1 e 31"
      )
      .optional()
      .nullable(),
  });

export const createProcedureSchema = procedureBaseSchema.refine(
  (d) => d.billingType !== "mensal" || (d.monthlyPrice && d.billingDay),
  {
    message: "Para cobrança mensal, monthlyPrice e billingDay são obrigatórios",
  },
);

export const updateProcedureSchema = procedureBaseSchema.partial();

export const updateProcedureCostsSchema = z.object({
  priceOverride: optionalPositiveNumber,
  monthlyPriceOverride: optionalPositiveNumber,
  fixedCost: optionalPositiveNumber,
  variableCost: optionalPositiveNumber,
  notes: z.string().max(500).optional().nullable(),
});

export type CreateProcedureInput = z.infer<typeof createProcedureSchema>;
export type UpdateProcedureInput = z.infer<typeof updateProcedureSchema>;
export type UpdateProcedureCostsInput = z.infer<typeof updateProcedureCostsSchema>;
