import { z } from "zod/v4";

export const registerSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(200),
  cpf: z.string().min(1, "CPF é obrigatório"),
  email: z.email("E-mail inválido").optional().nullable(),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
  clinicName: z.string().min(1, "Nome da clínica é obrigatório").max(200),
  profileType: z.enum(["clinica", "autonomo"]).optional().default("clinica"),
  planName: z.string().optional().default("essencial"),
  couponCode: z.string().optional().nullable(),
});

export const loginSchema = z.object({
  email: z.string().min(1, "Identificador é obrigatório"),
  password: z.string().min(1, "Senha é obrigatória"),
  clinicId: z.number().int().positive().optional().nullable(),
});

export const switchClinicSchema = z.object({
  clinicId: z.union([z.number().int().positive(), z.null()]).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type SwitchClinicInput = z.infer<typeof switchClinicSchema>;
