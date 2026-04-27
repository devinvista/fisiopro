import { describe, it, expect } from "vitest";
import {
  appointmentFormSchema,
  appointmentFormDefaults,
  recurrenceFormSchema,
  buildAppointmentPayload,
  buildRecurringAppointmentPayload,
} from "../appointment.schema";

const valid = appointmentFormDefaults({
  patientId: "10",
  procedureId: "5",
  date: "2026-04-23",
  startTime: "09:30",
});

describe("appointmentFormSchema", () => {
  it("aceita um agendamento válido", () => {
    expect(appointmentFormSchema.safeParse(valid).success).toBe(true);
  });

  it("rejeita patientId vazio ou não numérico", () => {
    expect(
      appointmentFormSchema.safeParse({ ...valid, patientId: "" }).success,
    ).toBe(false);
    expect(
      appointmentFormSchema.safeParse({ ...valid, patientId: "abc" }).success,
    ).toBe(false);
  });

  it("rejeita data com formato errado", () => {
    expect(
      appointmentFormSchema.safeParse({ ...valid, date: "23/04/2026" }).success,
    ).toBe(false);
  });

  it("rejeita hora fora do formato HH:mm", () => {
    expect(
      appointmentFormSchema.safeParse({ ...valid, startTime: "9:30" }).success,
    ).toBe(false);
    expect(
      appointmentFormSchema.safeParse({ ...valid, startTime: "25:00" }).success,
    ).toBe(false);
  });
});

describe("recurrenceFormSchema", () => {
  it("aceita recorrência válida", () => {
    expect(
      recurrenceFormSchema.safeParse({ daysOfWeek: [1, 3, 5], totalSessions: 12 })
        .success,
    ).toBe(true);
  });

  it("exige ao menos um dia da semana", () => {
    expect(
      recurrenceFormSchema.safeParse({ daysOfWeek: [], totalSessions: 5 }).success,
    ).toBe(false);
  });

  it("rejeita totalSessions fora do intervalo", () => {
    expect(
      recurrenceFormSchema.safeParse({ daysOfWeek: [1], totalSessions: 0 }).success,
    ).toBe(false);
    expect(
      recurrenceFormSchema.safeParse({ daysOfWeek: [1], totalSessions: 200 }).success,
    ).toBe(false);
  });
});

describe("buildAppointmentPayload", () => {
  it("inclui professionalId quando permitido e informado", () => {
    const payload = buildAppointmentPayload({
      values: { ...valid, professionalId: "7" },
      canSelectProfessional: true,
      scheduleId: 1,
    });
    expect(payload).toMatchObject({
      patientId: 10,
      procedureId: 5,
      professionalId: 7,
      scheduleId: 1,
    });
  });

  it("omite professionalId quando não permitido", () => {
    const payload = buildAppointmentPayload({
      values: { ...valid, professionalId: "7" },
      canSelectProfessional: false,
      scheduleId: 1,
    });
    expect(payload).not.toHaveProperty("professionalId");
  });

  it("inclui scheduleId quando informado", () => {
    const payload = buildAppointmentPayload({
      values: valid,
      canSelectProfessional: false,
      scheduleId: 99,
    });
    expect(payload).toHaveProperty("scheduleId", 99);
  });

  it("exige scheduleId em todas as vias de criação", () => {
    expect(() =>
      buildAppointmentPayload({
        values: valid,
        canSelectProfessional: false,
      } as Parameters<typeof buildAppointmentPayload>[0]),
    ).toThrow(/Selecione uma agenda/);
  });

  it("buildRecurringAppointmentPayload anexa o bloco de recorrência", () => {
    const payload = buildRecurringAppointmentPayload(
      { values: valid, canSelectProfessional: false, scheduleId: 1 },
      { daysOfWeek: [2, 4], totalSessions: 8 },
    );
    expect(payload.recurrence).toEqual({ daysOfWeek: [2, 4], totalSessions: 8 });
    expect(payload.scheduleId).toBe(1);
  });
});
