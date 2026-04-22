import { z } from "zod";

const onlyDigits = (s: string) => s.replace(/\D/g, "");

const optionalNonEmpty = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v : undefined));

export const patientFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Nome deve ter ao menos 2 caracteres")
    .max(120, "Nome muito longo"),
  cpf: z
    .string()
    .trim()
    .min(1, "CPF é obrigatório")
    .refine((v) => onlyDigits(v).length === 11, "CPF deve ter 11 dígitos"),
  phone: z
    .string()
    .trim()
    .min(1, "Telefone é obrigatório")
    .refine((v) => {
      const d = onlyDigits(v).length;
      return d === 10 || d === 11;
    }, "Telefone deve ter 10 ou 11 dígitos"),
  email: z
    .string()
    .trim()
    .optional()
    .refine(
      (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      "E-mail inválido",
    )
    .transform((v) => (v && v.trim() !== "" ? v : undefined)),
  birthDate: optionalNonEmpty.refine(
    (v) => !v || /^\d{4}-\d{2}-\d{2}/.test(v),
    "Data de nascimento inválida",
  ),
  profession: optionalNonEmpty,
  address: optionalNonEmpty,
  emergencyContact: optionalNonEmpty,
  notes: optionalNonEmpty,
});

export type PatientFormValues = z.infer<typeof patientFormSchema>;

/** Defaults para o form de criar paciente. */
export const patientFormDefaults: PatientFormValues = {
  name: "",
  cpf: "",
  phone: "",
  email: undefined,
  birthDate: undefined,
  profession: undefined,
  address: undefined,
  emergencyContact: undefined,
  notes: undefined,
};

/**
 * Constrói o payload para a API. Converte campos vazios em `undefined`
 * (a API trata undefined como "não informado" e grava `null` no banco).
 * Mantém CPF/telefone com máscara — backend já aceita esse formato.
 */
export function buildPatientPayload(values: PatientFormValues) {
  return {
    name: values.name,
    cpf: values.cpf,
    phone: values.phone,
    email: values.email || undefined,
    birthDate: values.birthDate || undefined,
    profession: values.profession || undefined,
    address: values.address || undefined,
    emergencyContact: values.emergencyContact || undefined,
    notes: values.notes || undefined,
  };
}
