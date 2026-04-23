import { z } from "zod";

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const appointmentFormSchema = z.object({
  patientId: z
    .string()
    .min(1, "Selecione o paciente")
    .refine((v) => Number.isFinite(Number(v)) && Number(v) > 0, "Paciente inválido"),
  procedureId: z
    .string()
    .min(1, "Selecione o procedimento")
    .refine((v) => Number.isFinite(Number(v)) && Number(v) > 0, "Procedimento inválido"),
  date: z
    .string()
    .min(1, "Informe a data")
    .regex(dateRegex, "Data inválida"),
  startTime: z
    .string()
    .min(1, "Selecione um horário")
    .regex(timeRegex, "Horário inválido"),
  notes: z.string(),
  professionalId: z.string(),
});

export type AppointmentFormValues = z.infer<typeof appointmentFormSchema>;

export const recurrenceFormSchema = z.object({
  daysOfWeek: z
    .array(z.number().int().min(0).max(6))
    .min(1, "Selecione ao menos um dia da semana"),
  totalSessions: z
    .number()
    .int("Número de sessões deve ser inteiro")
    .min(1, "Mínimo 1 sessão")
    .max(100, "Máximo 100 sessões"),
});

export type RecurrenceFormValues = z.infer<typeof recurrenceFormSchema>;

export function appointmentFormDefaults(
  overrides: Partial<AppointmentFormValues> = {},
): AppointmentFormValues {
  return {
    patientId: "",
    procedureId: "",
    date: "",
    startTime: "",
    notes: "",
    professionalId: "",
    ...overrides,
  };
}

export interface BuildAppointmentPayloadOptions {
  values: AppointmentFormValues;
  canSelectProfessional: boolean;
  scheduleId?: number | null;
}

export function buildAppointmentPayload({
  values,
  canSelectProfessional,
  scheduleId,
}: BuildAppointmentPayloadOptions) {
  return {
    patientId: Number(values.patientId),
    procedureId: Number(values.procedureId),
    date: values.date,
    startTime: values.startTime,
    notes: values.notes || undefined,
    ...(scheduleId ? { scheduleId } : {}),
    ...(canSelectProfessional && values.professionalId
      ? { professionalId: Number(values.professionalId) }
      : {}),
  };
}

export function buildRecurringAppointmentPayload(
  base: BuildAppointmentPayloadOptions,
  recurrence: RecurrenceFormValues,
) {
  return {
    ...buildAppointmentPayload(base),
    recurrence: {
      daysOfWeek: recurrence.daysOfWeek,
      totalSessions: recurrence.totalSessions,
    },
  };
}
