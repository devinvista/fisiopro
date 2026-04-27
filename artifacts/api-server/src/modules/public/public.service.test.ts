import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../utils/dateUtils.js", () => ({
  todayBRT: vi.fn(() => "2026-04-22"),
}));

vi.mock("./public.repository.js", () => ({
  publicRepository: {
    listActivePlans: vi.fn(),
    findPatientByCpfDigits: vi.fn(),
    findPatientByCpfFormatted: vi.fn(),
    findPatientByPhoneDigits: vi.fn(),
    findPatientByPhoneExact: vi.fn(),
    findActiveTreatmentPlan: vi.fn(),
    findActivePackageClinic: vi.fn(),
    findClinicName: vi.fn(),
    findRecentPatientAppointments: vi.fn(),
    listOnlineBookableProcedures: vi.fn(),
    listClinicSchedules: vi.fn(),
    findOnlineBookableProcedure: vi.fn(),
    findScheduleById: vi.fn(),
    findAppointmentsForDate: vi.fn(),
    findBlockedSlotsForDate: vi.fn(),
    countSameSessionBookings: vi.fn(),
    findOverlappingAppointments: vi.fn(),
    findPatientByCpfDigitsForBooking: vi.fn(),
    findPatientByPhone: vi.fn(),
    updatePatientContact: vi.fn(),
    insertPatient: vi.fn(),
    insertAppointment: vi.fn(),
    findBookingByToken: vi.fn(),
    findAppointmentByToken: vi.fn(),
    cancelAppointment: vi.fn(),
    findActiveClinicInfo: vi.fn(),
  },
}));

import { publicService, PublicError } from "./public.service.js";
import { publicRepository } from "./public.repository.js";

const repo = publicRepository as unknown as Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  Object.values(repo).forEach((fn) => fn.mockReset());
});

describe("publicService.listPlans", () => {
  it("delega ao repositório", async () => {
    repo.listActivePlans.mockResolvedValue([{ id: 1, name: "essencial" }]);
    await expect(publicService.listPlans()).resolves.toEqual([{ id: 1, name: "essencial" }]);
  });
});

describe("publicService.lookupPatient", () => {
  it("retorna found:false quando nenhum paciente é encontrado", async () => {
    repo.findPatientByCpfDigits.mockResolvedValue([]);
    repo.findPatientByCpfFormatted.mockResolvedValue([]);
    repo.findPatientByPhoneDigits.mockResolvedValue([]);
    repo.findPatientByPhoneExact.mockResolvedValue([]);
    const result = await publicService.lookupPatient("12345678901");
    expect(result).toEqual({ found: false });
  });

  it("encontra paciente por CPF e ordena recommendedProcedureIds por frequência", async () => {
    repo.findPatientByCpfDigits.mockResolvedValue([
      { id: 1, name: "Maria", phone: "11999999999", email: null, cpf: "123" },
    ]);
    repo.findActiveTreatmentPlan.mockResolvedValue([
      {
        id: 5,
        clinicId: 7,
        objectives: "obj",
        techniques: "tec",
        frequency: "2x",
        estimatedSessions: 10,
        status: "ativo",
      },
    ]);
    repo.findClinicName.mockResolvedValue([{ name: "Clínica X" }]);
    repo.findRecentPatientAppointments.mockResolvedValue([
      { procedureId: 100 },
      { procedureId: 200 },
      { procedureId: 100 },
      { procedureId: 100 },
      { procedureId: 200 },
    ]);

    const result = await publicService.lookupPatient("12345678901");
    expect(result.found).toBe(true);
    if (!result.found) return;
    expect(result.activeClinicId).toBe(7);
    expect(result.activeClinicName).toBe("Clínica X");
    expect(result.recommendedProcedureIds).toEqual([100, 200]);
    expect(result.activeTreatmentPlan?.id).toBe(5);
  });

  it("usa pacote ativo como fallback de clínica quando não há plano", async () => {
    repo.findPatientByCpfDigits.mockResolvedValue([
      { id: 1, name: "Maria", phone: "11", email: null, cpf: "x" },
    ]);
    repo.findActiveTreatmentPlan.mockResolvedValue([]);
    repo.findActivePackageClinic.mockResolvedValue([{ clinicId: 33 }]);
    repo.findClinicName.mockResolvedValue([{ name: "Pkg Clinic" }]);
    repo.findRecentPatientAppointments.mockResolvedValue([]);

    const result = await publicService.lookupPatient("12345678901");
    if (!result.found) throw new Error("expected found");
    expect(result.activeClinicId).toBe(33);
    expect(result.activeClinicName).toBe("Pkg Clinic");
    expect(result.activeTreatmentPlan).toBeNull();
  });
});

describe("publicService.getAvailableSlots", () => {
  it("lança 404 quando procedimento não existe", async () => {
    repo.findOnlineBookableProcedure.mockResolvedValue([]);
    await expect(
      publicService.getAvailableSlots({
        date: "2026-04-23",
        procedureId: 1,
        clinicId: null,
        scheduleId: null,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("gera slots, exclui bloqueados e ocupados (capacidade 1)", async () => {
    repo.findOnlineBookableProcedure.mockResolvedValue([
      {
        id: 1,
        name: "Sessão",
        durationMinutes: 60,
        price: "100",
        maxCapacity: 1,
      },
    ]);
    repo.findAppointmentsForDate.mockResolvedValue([
      { id: 9, procedureId: 1, startTime: "09:00", endTime: "10:00" },
    ]);
    repo.findBlockedSlotsForDate.mockResolvedValue([
      { startTime: "11:00", endTime: "12:00" },
    ]);

    const result = await publicService.getAvailableSlots({
      date: "2026-04-23",
      procedureId: 1,
      clinicId: null,
      scheduleId: null,
    });

    const times = result.slots.map((s) => s.time);
    expect(times).not.toContain("09:00");
    expect(times).not.toContain("11:00");
    expect(times).toContain("08:00");
    expect(times).toContain("10:00");
    expect(result.slots.every((s) => s.available)).toBe(true);
  });

  it("respeita maxCapacity > 1 contando vagas restantes", async () => {
    repo.findOnlineBookableProcedure.mockResolvedValue([
      { id: 2, name: "Pilates", durationMinutes: 60, price: "80", maxCapacity: 3 },
    ]);
    repo.findAppointmentsForDate.mockResolvedValue([
      { id: 1, procedureId: 2, startTime: "08:00", endTime: "09:00" },
      { id: 2, procedureId: 2, startTime: "08:00", endTime: "09:00" },
    ]);
    repo.findBlockedSlotsForDate.mockResolvedValue([]);

    const result = await publicService.getAvailableSlots({
      date: "2026-04-23",
      procedureId: 2,
      clinicId: null,
      scheduleId: null,
    });

    const slot8 = result.slots.find((s) => s.time === "08:00");
    expect(slot8?.spotsLeft).toBe(1);
  });
});

describe("publicService.createBooking", () => {
  const baseInput = {
    procedureId: 1,
    date: "2026-04-23",
    startTime: "10:00",
    patientName: "Ana",
    patientPhone: "11999999999",
    patientEmail: null,
    patientCpf: null,
    notes: null,
    clinicId: null,
    scheduleId: 1,
  };

  beforeEach(() => {
    repo.findOnlineBookableProcedure.mockResolvedValue([
      { id: 1, name: "Sessão", durationMinutes: 60, price: "100", maxCapacity: 1 },
    ]);
    repo.insertAppointment.mockResolvedValue([
      {
        id: 555,
        date: "2026-04-23",
        startTime: "10:00",
        endTime: "11:00",
        status: "agendado",
      },
    ]);
  });

  it("lança 404 se procedimento não existe", async () => {
    repo.findOnlineBookableProcedure.mockResolvedValue([]);
    await expect(publicService.createBooking(baseInput as any)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("rejeita conflito de horário (capacidade 1)", async () => {
    repo.findOverlappingAppointments.mockResolvedValue([{ id: 1 }]);
    await expect(publicService.createBooking(baseInput as any)).rejects.toMatchObject({
      status: 409,
    });
  });

  it("cria novo paciente quando CPF não existe", async () => {
    repo.findOverlappingAppointments.mockResolvedValue([]);
    repo.findPatientByCpfDigitsForBooking.mockResolvedValue([]);
    repo.insertPatient.mockResolvedValue([{ id: 77 }]);

    const result = await publicService.createBooking({
      ...baseInput,
      patientCpf: "12345678901",
    } as any);

    expect(repo.insertPatient).toHaveBeenCalled();
    expect(repo.insertAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: 77, status: "agendado", source: "online" }),
    );
    expect(result.success).toBe(true);
    expect(result.bookingToken).toBeTruthy();
  });

  it("reutiliza paciente existente por CPF e atualiza contato", async () => {
    repo.findOverlappingAppointments.mockResolvedValue([]);
    repo.findPatientByCpfDigitsForBooking.mockResolvedValue([{ id: 88 }]);

    await publicService.createBooking({
      ...baseInput,
      patientCpf: "12345678901",
      patientEmail: "ana@x.com",
    } as any);

    expect(repo.updatePatientContact).toHaveBeenCalledWith(88, "11999999999", "ana@x.com");
    expect(repo.insertAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: 88 }),
    );
  });

  it("usa paciente existente por telefone quando não há CPF", async () => {
    repo.findOverlappingAppointments.mockResolvedValue([]);
    repo.findPatientByPhone.mockResolvedValue([{ id: 99 }]);

    await publicService.createBooking(baseInput as any);
    expect(repo.insertAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: 99 }),
    );
  });
});

describe("publicService.cancelBooking", () => {
  it("404 quando token não existe", async () => {
    repo.findAppointmentByToken.mockResolvedValue([]);
    await expect(publicService.cancelBooking("abc")).rejects.toMatchObject({ status: 404 });
  });

  it("rejeita já cancelado", async () => {
    repo.findAppointmentByToken.mockResolvedValue([
      { id: 1, status: "cancelado", date: "2026-05-01" },
    ]);
    await expect(publicService.cancelBooking("t")).rejects.toMatchObject({ status: 400 });
  });

  it("rejeita já concluído", async () => {
    repo.findAppointmentByToken.mockResolvedValue([
      { id: 1, status: "concluido", date: "2026-05-01" },
    ]);
    await expect(publicService.cancelBooking("t")).rejects.toMatchObject({ status: 400 });
  });

  it("rejeita data passada", async () => {
    repo.findAppointmentByToken.mockResolvedValue([
      { id: 1, status: "agendado", date: "2020-01-01" },
    ]);
    await expect(publicService.cancelBooking("t")).rejects.toMatchObject({ status: 400 });
  });

  it("cancela com sucesso", async () => {
    repo.findAppointmentByToken.mockResolvedValue([
      { id: 7, status: "agendado", date: "2026-12-01" },
    ]);
    const result = await publicService.cancelBooking("t");
    expect(repo.cancelAppointment).toHaveBeenCalledWith(7);
    expect(result.success).toBe(true);
  });
});

describe("publicService.getBookingByToken", () => {
  it("404 quando não existe", async () => {
    repo.findBookingByToken.mockResolvedValue([]);
    await expect(publicService.getBookingByToken("x")).rejects.toBeInstanceOf(PublicError);
  });

  it("retorna agendamento + paciente + procedimento", async () => {
    repo.findBookingByToken.mockResolvedValue([
      {
        appointment: {
          id: 1,
          date: "2026-04-23",
          startTime: "10:00",
          endTime: "11:00",
          status: "agendado",
          notes: null,
          bookingToken: "tok",
        },
        patient: { name: "Ana", phone: "11", email: null },
        procedure: { id: 1, name: "Sessão", durationMinutes: 60, price: "100" },
      },
    ]);
    const result = await publicService.getBookingByToken("tok");
    expect(result.id).toBe(1);
    expect(result.patient?.name).toBe("Ana");
    expect(result.procedure?.name).toBe("Sessão");
  });
});

describe("publicService.getClinicInfo", () => {
  it("retorna default quando nenhuma clínica ativa", async () => {
    repo.findActiveClinicInfo.mockResolvedValue([]);
    const info = await publicService.getClinicInfo();
    expect(info.name).toBe("FisioGest Pro");
  });

  it("retorna clínica do banco", async () => {
    repo.findActiveClinicInfo.mockResolvedValue([
      { name: "X", type: "clinica", phone: "11", email: null, address: null, website: null, logoUrl: null },
    ]);
    const info = await publicService.getClinicInfo();
    expect(info.name).toBe("X");
  });
});
