import { z } from "zod";

const numericString = (msg: string) =>
  z.string().refine((v) => v === "" || (!isNaN(Number(v)) && Number(v) >= 0), msg);

const requiredNumericString = (msg: string) =>
  z.string().refine((v) => v !== "" && !isNaN(Number(v)) && Number(v) > 0, msg);

export const couponFormSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3, "Código deve ter ao menos 3 caracteres")
      .max(40, "Código muito longo")
      .regex(/^[A-Z0-9_-]+$/i, "Use apenas letras, números, _ ou -"),
    description: z.string().trim().min(1, "Descrição é obrigatória"),
    type: z.enum(["discount", "referral"]),
    discountType: z.enum(["percent", "fixed"]),
    discountValue: requiredNumericString("Valor do desconto deve ser maior que zero"),
    maxUses: numericString("Limite de usos inválido"),
    expiresAt: z.string(),
    isActive: z.boolean(),
    minPlanAmount: numericString("Valor mínimo de plano inválido"),
    applicablePlanNames: z.array(z.string()),
    referrerClinicId: z.string(),
    referrerBenefitType: z.enum(["percent", "fixed", ""]),
    referrerBenefitValue: numericString("Valor do benefício inválido"),
    notes: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.discountType === "percent" && Number(data.discountValue) > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["discountValue"],
        message: "Desconto percentual não pode passar de 100%",
      });
    }
    if (data.type === "referral" && !data.referrerClinicId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["referrerClinicId"],
        message: "Indicação exige uma clínica indicadora",
      });
    }
    if (
      data.type === "referral" &&
      data.referrerBenefitType !== "" &&
      !data.referrerBenefitValue
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["referrerBenefitValue"],
        message: "Informe o valor do benefício do indicador",
      });
    }
  });

export type CouponFormValues = z.infer<typeof couponFormSchema>;

export const couponFormDefaults: CouponFormValues = {
  code: "",
  description: "",
  type: "discount",
  discountType: "percent",
  discountValue: "30",
  maxUses: "",
  expiresAt: "",
  isActive: true,
  minPlanAmount: "",
  applicablePlanNames: [],
  referrerClinicId: "",
  referrerBenefitType: "",
  referrerBenefitValue: "",
  notes: "",
};

/**
 * Constrói o payload da API a partir dos valores validados do form.
 * Converte strings numéricas em number e strings vazias em null.
 */
export function buildCouponPayload(values: CouponFormValues) {
  return {
    code: values.code.toUpperCase().trim(),
    description: values.description,
    type: values.type,
    discountType: values.discountType,
    discountValue: Number(values.discountValue),
    maxUses: values.maxUses ? Number(values.maxUses) : null,
    expiresAt: values.expiresAt || null,
    isActive: values.isActive,
    minPlanAmount: values.minPlanAmount ? Number(values.minPlanAmount) : null,
    applicablePlanNames:
      values.applicablePlanNames.length > 0 ? values.applicablePlanNames : null,
    referrerClinicId: values.referrerClinicId ? Number(values.referrerClinicId) : null,
    referrerBenefitType: values.referrerBenefitType || null,
    referrerBenefitValue: values.referrerBenefitValue
      ? Number(values.referrerBenefitValue)
      : null,
    notes: values.notes || null,
  };
}
