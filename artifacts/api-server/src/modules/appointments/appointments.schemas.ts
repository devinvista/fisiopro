import { z } from "zod/v4";

export const appointmentStatusEnum = z.enum([
  "agendado", "confirmado", "compareceu", "concluido", "cancelado", "faltou", "remarcado",
]);

// ─── State machine: valid transitions ────────────────────────────────────────
// "admin_override" keys allow any-to-any via the edit form (secretary/admin only)
export const VALID_TRANSITIONS: Record<string, string[]> = {
  agendado:   ["confirmado", "compareceu", "cancelado", "faltou", "remarcado"],
  confirmado: ["compareceu", "cancelado", "faltou", "remarcado", "agendado"],
  compareceu: ["concluido", "faltou", "cancelado"],
  concluido:  [],
  cancelado:  ["agendado"],
  faltou:     ["agendado", "remarcado"],
  remarcado:  [],
};

export function isValidTransition(from: string, to: string, isAdmin: boolean): boolean {
  if (from === to) return true;
  if (isAdmin && ["concluido", "remarcado"].includes(from)) return true;
  const allowed = VALID_TRANSITIONS[from] ?? [];
  return allowed.includes(to);
}

export const rescheduleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date deve estar no formato YYYY-MM-DD"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "startTime deve estar no formato HH:MM"),
  notes: z.string().max(2000).optional().nullable(),
});

export const createAppointmentSchema = z.object({
  patientId: z.number({ error: "patientId deve ser um número" }).int().positive(),
  procedureId: z.number({ error: "procedureId deve ser um número" }).int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date deve estar no formato YYYY-MM-DD"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "startTime deve estar no formato HH:MM"),
  scheduleId: z.number().int().positive().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  professionalId: z.number().int().positive().optional().nullable(),
});

export const updateAppointmentSchema = z.object({
  patientId: z.number().int().positive().optional(),
  procedureId: z.number().int().positive().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date deve estar no formato YYYY-MM-DD").optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "startTime deve estar no formato HH:MM").optional(),
  status: appointmentStatusEnum.optional(),
  notes: z.string().max(2000).optional().nullable(),
});

export const recurringAppointmentSchema = createAppointmentSchema.extend({
  recurrence: z.object({
    daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1, "Informe ao menos um dia da semana"),
    totalSessions: z.number().int().min(1, "totalSessions deve ser no mínimo 1"),
  }),
});
