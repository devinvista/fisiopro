import { z } from "zod";

const modalidades = ["individual", "dupla", "grupo"] as const;
const categories = ["Reabilitação", "Estética", "Pilates"] as const;

const positiveAmount = z
  .string()
  .min(1, "Informe o preço")
  .refine((v) => !isNaN(Number(v)) && Number(v) > 0, "Preço deve ser maior que zero");

const nonNegativeAmount = z
  .string()
  .refine((v) => v === "" || (!isNaN(Number(v)) && Number(v) >= 0), "Custo inválido");

export const procedureFormSchema = z
  .object({
    name: z.string().trim().min(1, "Nome é obrigatório"),
    category: z.enum(categories, { errorMap: () => ({ message: "Categoria inválida" }) }),
    modalidade: z.enum(modalidades),
    durationMinutes: z
      .number({ invalid_type_error: "Duração inválida" })
      .int("Duração deve ser inteira")
      .min(5, "Mínimo 5 minutos")
      .max(480, "Máximo 8 horas"),
    price: positiveAmount,
    cost: nonNegativeAmount,
    description: z.string(),
    maxCapacity: z
      .number({ invalid_type_error: "Capacidade inválida" })
      .int()
      .min(1, "Capacidade mínima 1"),
    onlineBookingEnabled: z.boolean(),
    monthlyPrice: z.string().optional(),
    billingDay: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.modalidade === "grupo" && data.maxCapacity < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxCapacity"],
        message: "Para modalidade em grupo, a capacidade deve ser pelo menos 2",
      });
    }
  });

export type ProcedureFormValues = z.infer<typeof procedureFormSchema>;

export const procedureFormDefaults: ProcedureFormValues = {
  name: "",
  category: "Reabilitação",
  modalidade: "individual",
  durationMinutes: 60,
  price: "",
  cost: "",
  description: "",
  maxCapacity: 1,
  onlineBookingEnabled: false,
  monthlyPrice: undefined,
  billingDay: undefined,
};

export function buildProcedurePayload(values: ProcedureFormValues) {
  return {
    name: values.name,
    category: values.category,
    modalidade: values.modalidade,
    durationMinutes: values.durationMinutes,
    price: values.price,
    cost: values.cost,
    description: values.description,
    maxCapacity: values.maxCapacity,
    onlineBookingEnabled: values.onlineBookingEnabled,
    monthlyPrice: values.monthlyPrice,
    billingDay: values.billingDay,
  };
}

// ─── Cost override (procedure cost configuration) ───────────────────────────

export const procedureCostFormSchema = z.object({
  priceOverride: z
    .string()
    .refine((v) => v === "" || (!isNaN(Number(v)) && Number(v) >= 0), "Preço inválido"),
  variableCost: z
    .string()
    .refine((v) => v === "" || (!isNaN(Number(v)) && Number(v) >= 0), "Custo inválido"),
  notes: z.string(),
});

export type ProcedureCostFormValues = z.infer<typeof procedureCostFormSchema>;

export const procedureCostFormDefaults: ProcedureCostFormValues = {
  priceOverride: "",
  variableCost: "",
  notes: "",
};

export function buildProcedureCostPayload(values: ProcedureCostFormValues) {
  return {
    priceOverride: values.priceOverride !== "" ? Number(values.priceOverride) : null,
    fixedCost: 0,
    variableCost: values.variableCost !== "" ? Number(values.variableCost) : 0,
    notes: values.notes || null,
  };
}
