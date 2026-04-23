import { z } from "zod";

const dateOrEmpty = z
  .string()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Data inválida");

const positiveAmountOrEmpty = z
  .string()
  .refine(
    (v) => v === "" || (!isNaN(Number(v)) && Number(v) >= 0),
    "Valor inválido",
  );

const subscriptionStatuses = ["trial", "active", "suspended", "cancelled"] as const;
const paymentStatuses = ["pending", "paid", "overdue", "free"] as const;

// ─── Create (new subscription for a clinic) ─────────────────────────────────

export const newSubscriptionFormSchema = z.object({
  clinicId: z
    .string()
    .min(1, "Selecione a clínica")
    .refine((v) => Number.isFinite(Number(v)) && Number(v) > 0, "Clínica inválida"),
  planId: z
    .string()
    .min(1, "Selecione o plano")
    .refine((v) => Number.isFinite(Number(v)) && Number(v) > 0, "Plano inválido"),
  status: z.enum(subscriptionStatuses),
  paymentStatus: z.enum(paymentStatuses),
  amount: positiveAmountOrEmpty,
});

export type NewSubscriptionFormValues = z.infer<typeof newSubscriptionFormSchema>;

export const newSubscriptionFormDefaults: NewSubscriptionFormValues = {
  clinicId: "",
  planId: "",
  status: "trial",
  paymentStatus: "pending",
  amount: "",
};

export function buildNewSubscriptionPayload(
  values: NewSubscriptionFormValues,
  fallbackPlanPrice?: string | number,
) {
  return {
    clinicId: Number(values.clinicId),
    planId: Number(values.planId),
    status: values.status,
    paymentStatus: values.paymentStatus,
    amount: values.amount
      ? Number(values.amount)
      : fallbackPlanPrice !== undefined
        ? Number(fallbackPlanPrice)
        : undefined,
  };
}

// ─── Edit (update existing subscription) ─────────────────────────────────────

export const subscriptionFormSchema = z
  .object({
    planId: z.string(),
    status: z.enum(subscriptionStatuses),
    paymentStatus: z.enum(paymentStatuses),
    amount: positiveAmountOrEmpty,
    trialEndDate: dateOrEmpty,
    currentPeriodStart: dateOrEmpty,
    currentPeriodEnd: dateOrEmpty,
    notes: z.string(),
  })
  .superRefine((data, ctx) => {
    if (
      data.currentPeriodStart &&
      data.currentPeriodEnd &&
      data.currentPeriodEnd < data.currentPeriodStart
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["currentPeriodEnd"],
        message: "Fim do período não pode ser anterior ao início",
      });
    }
  });

export type SubscriptionFormValues = z.infer<typeof subscriptionFormSchema>;

export const subscriptionFormDefaults: SubscriptionFormValues = {
  planId: "",
  status: "trial",
  paymentStatus: "pending",
  amount: "",
  trialEndDate: "",
  currentPeriodStart: "",
  currentPeriodEnd: "",
  notes: "",
};

export function buildSubscriptionPayload(values: SubscriptionFormValues) {
  return {
    planId: values.planId ? Number(values.planId) : undefined,
    status: values.status || undefined,
    paymentStatus: values.paymentStatus || undefined,
    amount: values.amount ? Number(values.amount) : undefined,
    trialEndDate: values.trialEndDate || undefined,
    currentPeriodStart: values.currentPeriodStart || undefined,
    currentPeriodEnd: values.currentPeriodEnd || undefined,
    notes: values.notes || undefined,
  };
}
