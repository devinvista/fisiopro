import { z } from "zod";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const recordTypes = ["receita", "despesa"] as const;
const recordStatuses = ["pago", "pendente", "cancelado", "estornado"] as const;
const expenseSubtypes = ["geral", "procedimento"] as const;

const positiveAmount = z
  .string()
  .min(1, "Informe o valor")
  .refine((v) => !isNaN(Number(v)) && Number(v) > 0, "Valor deve ser maior que zero");

const dateString = z
  .string()
  .min(1, "Informe a data")
  .regex(dateRegex, "Data inválida");

const dateStringOrEmpty = z
  .string()
  .refine((v) => v === "" || dateRegex.test(v), "Data inválida");

// ─── Create ───────────────────────────────────────────────────────────────────

export const newFinancialRecordSchema = z
  .object({
    type: z.enum(recordTypes),
    expenseSubtype: z.enum(expenseSubtypes),
    procedureId: z.string(),
    description: z.string().trim().min(1, "Descrição é obrigatória"),
    amount: positiveAmount,
    category: z.string(),
    status: z.enum(["pago", "pendente"]),
    paymentDate: dateStringOrEmpty,
    dueDate: dateString,
    paymentMethod: z.string(),
  })
  .superRefine((data, ctx) => {
    if (
      data.type === "despesa" &&
      data.expenseSubtype === "procedimento" &&
      !data.procedureId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["procedureId"],
        message: "Selecione o procedimento vinculado",
      });
    }
  });

export type NewFinancialRecordValues = z.infer<typeof newFinancialRecordSchema>;

export function newFinancialRecordDefaults(today: string): NewFinancialRecordValues {
  return {
    type: "despesa",
    expenseSubtype: "geral",
    procedureId: "",
    description: "",
    amount: "",
    category: "",
    status: "pago",
    paymentDate: today,
    dueDate: today,
    paymentMethod: "",
  };
}

export function buildNewFinancialRecordPayload(
  values: NewFinancialRecordValues,
  today: string,
) {
  return {
    type: values.type,
    amount: Number(values.amount),
    description: values.description,
    category: values.category || undefined,
    procedureId: values.procedureId ? Number(values.procedureId) : undefined,
    status: values.status,
    paymentDate: values.status === "pendente" ? null : values.paymentDate || today,
    dueDate: values.dueDate || today,
    paymentMethod: values.paymentMethod || undefined,
  };
}

// ─── Edit ────────────────────────────────────────────────────────────────────

export const editFinancialRecordSchema = z.object({
  type: z.enum(recordTypes),
  description: z.string().trim().min(1, "Descrição é obrigatória"),
  amount: positiveAmount,
  category: z.string(),
  status: z.enum(recordStatuses),
  paymentDate: dateStringOrEmpty,
  dueDate: dateString,
  paymentMethod: z.string(),
});

export type EditFinancialRecordValues = z.infer<typeof editFinancialRecordSchema>;

export function buildEditFinancialRecordPayload(values: EditFinancialRecordValues) {
  return {
    type: values.type,
    amount: Number(values.amount),
    description: values.description,
    category: values.category || undefined,
    status: values.status,
    paymentDate:
      values.status === "pendente" ? null : values.paymentDate || null,
    dueDate: values.dueDate,
    paymentMethod: values.paymentMethod || undefined,
  };
}
