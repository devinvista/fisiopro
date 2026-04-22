import { z } from "zod/v4";

export const patientLookupQuerySchema = z.object({
  q: z.string().min(4),
});

export const proceduresQuerySchema = z.object({
  clinicId: z.coerce.number().int().positive().optional(),
});

export const schedulesQuerySchema = z.object({
  clinicId: z.coerce.number().int().positive(),
});

export const availableSlotsQuerySchema = z.object({
  date: z.string().min(1),
  procedureId: z.coerce.number().int().positive(),
  clinicId: z.coerce.number().int().positive().optional(),
  scheduleId: z.coerce.number().int().positive().optional(),
});

export const bookSchema = z.object({
  procedureId: z.coerce.number().int().positive(),
  date: z.string().min(1),
  startTime: z.string().min(1),
  patientName: z.string().min(1),
  patientPhone: z.string().min(1),
  patientEmail: z.string().optional().nullable(),
  patientCpf: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  clinicId: z.coerce.number().int().positive().optional().nullable(),
  scheduleId: z.coerce.number().int().positive().optional().nullable(),
});

export type BookInput = z.infer<typeof bookSchema>;
