import { z } from "zod";

const optionalLimit = z
  .union([z.number().int().nonnegative(), z.null()])
  .optional()
  .transform((v) => (v === undefined ? null : v));

export const planFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Identificador é obrigatório")
      .max(40, "Identificador muito longo")
      .regex(/^[a-z0-9_]+$/, "Use apenas letras minúsculas, números e _"),
    displayName: z.string().trim().min(2, "Nome de exibição obrigatório"),
    description: z.string().trim().min(1, "Descrição é obrigatória"),
    price: z
      .string()
      .refine((v) => v !== "" && !isNaN(Number(v)) && Number(v) >= 0, "Preço inválido"),
    maxProfessionals: optionalLimit,
    maxPatients: optionalLimit,
    maxSchedules: optionalLimit,
    maxUsers: optionalLimit,
    trialDays: z.number().int().min(0, "Trial deve ser >= 0").max(365, "Trial muito longo"),
    features: z.array(z.string()),
    isActive: z.boolean(),
    sortOrder: z.number().int().min(0, "Ordem deve ser >= 0"),
  })
  .superRefine((data, ctx) => {
    if (data.maxProfessionals !== null && data.maxProfessionals < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxProfessionals"],
        message: "Plano precisa permitir pelo menos 1 profissional",
      });
    }
  });

export type PlanFormValues = z.infer<typeof planFormSchema>;

export const planFormDefaults: PlanFormValues = {
  name: "",
  displayName: "",
  description: "",
  price: "0",
  maxProfessionals: 1,
  maxPatients: null,
  maxSchedules: null,
  maxUsers: null,
  trialDays: 30,
  features: [],
  isActive: true,
  sortOrder: 0,
};

/**
 * Constrói o payload da API a partir dos valores validados do form de plano.
 * Converte `price` (string) em number e mantém demais campos.
 */
export function buildPlanPayload(values: PlanFormValues, featuresText: string) {
  return {
    ...values,
    price: Number(values.price),
    features: featuresText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
