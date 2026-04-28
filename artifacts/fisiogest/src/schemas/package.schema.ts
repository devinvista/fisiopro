import { z } from "zod";

// Sprint 5: "faturaConsolidada" foi descontinuado da UI clínica (a fatura
// mensal agora é gerada via plano de tratamento, kind='recorrenteMensal').
// Templates legados ainda existem em algumas bases — o backend continua
// aceitando o valor para leitura, mas a criação/edição via formulário só
// permite os dois tipos vivos abaixo.
const packageTypes = ["sessoes", "mensal"] as const;

const positiveAmountString = z
  .string()
  .refine((v) => v === "" || (!isNaN(Number(v)) && Number(v) > 0), "Valor inválido");

export const packageFormSchema = z
  .object({
    name: z.string().trim().min(1, "Nome é obrigatório"),
    description: z.string(),
    procedureId: z
      .string()
      .min(1, "Selecione o procedimento")
      .refine((v) => Number.isFinite(Number(v)) && Number(v) > 0, "Procedimento inválido"),
    packageType: z.enum(packageTypes),
    totalSessions: z.number().int().min(1, "Mínimo 1 sessão"),
    sessionsPerWeek: z
      .number()
      .int()
      .min(1, "Mínimo 1x por semana")
      .max(7, "Máximo 7x por semana"),
    validityDays: z.number().int().min(1, "Validade mínima 1 dia"),
    price: positiveAmountString,
    monthlyPrice: positiveAmountString,
    billingDay: z
      .number()
      .int()
      .min(1, "Dia inválido")
      .max(31, "Dia inválido"),
    absenceCreditLimit: z.number().int().min(0).max(4),
  })
  .superRefine((data, ctx) => {
    if (data.packageType === "sessoes") {
      if (!data.price) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["price"],
          message: "Informe o preço total do pacote",
        });
      }
    } else {
      if (!data.monthlyPrice) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["monthlyPrice"],
          message: "Informe o valor da cobrança",
        });
      }
    }
  });

export type PackageFormValues = z.infer<typeof packageFormSchema>;

export const packageFormDefaults: PackageFormValues = {
  name: "",
  description: "",
  procedureId: "",
  packageType: "sessoes",
  totalSessions: 8,
  sessionsPerWeek: 2,
  validityDays: 30,
  price: "",
  monthlyPrice: "",
  billingDay: 5,
  absenceCreditLimit: 1,
};

export function buildPackagePayload(data: PackageFormValues) {
  const base = {
    name: data.name,
    description: data.description || null,
    procedureId: Number(data.procedureId),
    packageType: data.packageType,
    sessionsPerWeek: Number(data.sessionsPerWeek),
  };
  if (data.packageType === "sessoes") {
    return {
      ...base,
      totalSessions: Number(data.totalSessions),
      validityDays: Number(data.validityDays),
      price: Number(data.price),
      monthlyPrice: null,
      billingDay: null,
      absenceCreditLimit: 0,
    };
  }
  return {
    ...base,
    totalSessions: null,
    validityDays: null,
    price: Number(data.monthlyPrice),
    monthlyPrice: Number(data.monthlyPrice),
    billingDay: Number(data.billingDay),
    absenceCreditLimit: Number(data.absenceCreditLimit),
  };
}
