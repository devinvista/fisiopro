import { randomUUID } from "crypto";
import { todayBRT } from "../../utils/dateUtils.js";
import { addMinutes, minutesToTime, timeToMinutes } from "./public.helpers.js";
import { publicRepository } from "./public.repository.js";
import type { BookInput } from "./public.schemas.js";

export class PublicError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const notFound = (msg: string) => new PublicError(404, "Not Found", msg);
const badRequest = (msg: string) => new PublicError(400, "Bad Request", msg);
const conflict = (msg: string) => new PublicError(409, "Conflict", msg);

export const publicService = {
  // ── Plans ──────────────────────────────────────────────────────────────────
  listPlans() {
    return publicRepository.listActivePlans();
  },

  // ── Patient lookup ─────────────────────────────────────────────────────────
  async lookupPatient(q: string) {
    const cleaned = q.replace(/\D/g, "");
    let patient: Awaited<ReturnType<typeof publicRepository.findPatientByCpfDigits>>[number] | undefined;

    if (cleaned.length === 11) {
      const cpfFormatted = cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
      const rows = await publicRepository.findPatientByCpfDigits(cleaned);
      patient = rows[0];
      if (!patient) {
        const rows2 = await publicRepository.findPatientByCpfFormatted(cpfFormatted);
        patient = rows2[0];
      }
    }

    if (!patient && cleaned.length >= 8) {
      const rows = await publicRepository.findPatientByPhoneDigits(cleaned.slice(-9));
      patient = rows[0];
    }

    if (!patient) {
      const rows = await publicRepository.findPatientByPhoneExact(q.trim());
      patient = rows[0];
    }

    if (!patient) return { found: false as const };

    const plans = await publicRepository.findActiveTreatmentPlan(patient.id);
    const activePlan = plans[0] ?? null;

    let activeClinicId: number | null = activePlan?.clinicId ?? null;
    if (!activeClinicId) {
      const today = todayBRT();
      const activePackages = await publicRepository.findActivePackageClinic(patient.id, today);
      activeClinicId = activePackages[0]?.clinicId ?? null;
    }

    let activeClinicName: string | null = null;
    if (activeClinicId) {
      const clinicRows = await publicRepository.findClinicName(activeClinicId);
      activeClinicName = clinicRows[0]?.name ?? null;
    }

    const recentAppts = await publicRepository.findRecentPatientAppointments(patient.id);
    const freq: Record<number, number> = {};
    for (const a of recentAppts) {
      if (a.procedureId) freq[a.procedureId] = (freq[a.procedureId] ?? 0) + 1;
    }
    const recommendedProcedureIds = Object.entries(freq)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .map(([id]) => Number(id));

    return {
      found: true as const,
      patient: {
        id: patient.id,
        name: patient.name,
        phone: patient.phone,
        email: patient.email ?? null,
        cpf: patient.cpf,
      },
      activeTreatmentPlan: activePlan
        ? {
            id: activePlan.id,
            objectives: activePlan.objectives,
            techniques: activePlan.techniques,
            frequency: activePlan.frequency,
            estimatedSessions: activePlan.estimatedSessions,
            status: activePlan.status,
          }
        : null,
      activeClinicId,
      activeClinicName,
      recommendedProcedureIds,
    };
  },

  // ── Procedures / schedules ─────────────────────────────────────────────────
  listProcedures(clinicId: number | null) {
    return publicRepository.listOnlineBookableProcedures(clinicId);
  },

  listSchedules(clinicId: number) {
    return publicRepository.listClinicSchedules(clinicId);
  },

  // ── Available slots ────────────────────────────────────────────────────────
  async getAvailableSlots(params: {
    date: string;
    procedureId: number;
    clinicId: number | null;
    scheduleId: number | null;
  }) {
    const { date, procedureId, clinicId, scheduleId } = params;

    const [procedure] = await publicRepository.findOnlineBookableProcedure(procedureId);
    if (!procedure) {
      throw notFound("Procedimento não encontrado ou não disponível para agendamento online");
    }

    const duration = procedure.durationMinutes;
    const maxCap = procedure.maxCapacity ?? 1;

    let openMin = timeToMinutes("08:00");
    let closeMin = timeToMinutes("18:00");
    let stepMinutes = 30;

    if (scheduleId) {
      const [schedule] = await publicRepository.findScheduleById(scheduleId);
      if (schedule) {
        openMin = timeToMinutes(schedule.startTime);
        closeMin = timeToMinutes(schedule.endTime);
        stepMinutes = schedule.slotDurationMinutes;

        const dateObj = new Date(date + "T12:00:00Z");
        const dayOfWeek = dateObj.getUTCDay();
        const workingDays = schedule.workingDays.split(",").map(Number);
        if (!workingDays.includes(dayOfWeek)) {
          return {
            date,
            procedure: {
              id: procedure.id,
              name: procedure.name,
              durationMinutes: procedure.durationMinutes,
              price: procedure.price,
              maxCapacity: maxCap,
            },
            slots: [],
          };
        }
      }
    }

    const existingAppts = await publicRepository.findAppointmentsForDate(date, scheduleId, clinicId);
    const blockedSlots = await publicRepository.findBlockedSlotsForDate(date, scheduleId);

    const slots: { time: string; available: boolean; spotsLeft: number }[] = [];

    for (let start = openMin; start + duration <= closeMin; start += stepMinutes) {
      const startTime = minutesToTime(start);
      const slotEnd = start + duration;

      const isBlocked = blockedSlots.some(
        (b) => timeToMinutes(b.startTime) < slotEnd && timeToMinutes(b.endTime) > start,
      );

      if (isBlocked) {
        slots.push({ time: startTime, available: false, spotsLeft: 0 });
        continue;
      }

      let spotsLeft: number;
      if (maxCap > 1) {
        const sameSessionCount = existingAppts.filter(
          (a) => a.procedureId === procedure.id && a.startTime === startTime,
        ).length;

        const hasConflictingSession = existingAppts.some(
          (a) =>
            a.procedureId === procedure.id &&
            a.startTime !== startTime &&
            timeToMinutes(a.startTime) < slotEnd &&
            timeToMinutes(a.endTime) > start,
        );

        spotsLeft = hasConflictingSession ? 0 : Math.max(0, maxCap - sameSessionCount);
      } else {
        const occupiedCount = existingAppts.filter(
          (a) => timeToMinutes(a.startTime) < slotEnd && timeToMinutes(a.endTime) > start,
        ).length;
        spotsLeft = Math.max(0, maxCap - occupiedCount);
      }

      slots.push({ time: startTime, available: spotsLeft > 0, spotsLeft });
    }

    return {
      date,
      procedure: {
        id: procedure.id,
        name: procedure.name,
        durationMinutes: procedure.durationMinutes,
        price: procedure.price,
        maxCapacity: maxCap,
      },
      slots: slots.filter((s) => s.available),
    };
  },

  // ── Booking ────────────────────────────────────────────────────────────────
  async createBooking(input: BookInput) {
    const {
      procedureId,
      date,
      startTime,
      patientName,
      patientPhone,
      patientEmail,
      patientCpf,
      notes,
      clinicId,
      scheduleId,
    } = input;

    const [procedure] = await publicRepository.findOnlineBookableProcedure(Number(procedureId));
    if (!procedure) throw notFound("Procedimento não disponível para agendamento online");

    const endTime = addMinutes(startTime, procedure.durationMinutes);
    const maxCapacity = procedure.maxCapacity ?? 1;

    if (maxCapacity > 1) {
      const sameSession = await publicRepository.countSameSessionBookings(date, procedure.id, startTime);
      if (sameSession.length >= maxCapacity) {
        throw conflict(`Horário lotado: ${sameSession.length}/${maxCapacity} vagas ocupadas.`);
      }
    } else {
      const existing = await publicRepository.findOverlappingAppointments(date, startTime, endTime);
      if (existing.length > 0) {
        throw conflict(`Horário indisponível: já existe um agendamento entre ${startTime} e ${endTime}.`);
      }
    }

    let patientId: number;
    if (patientCpf) {
      const normalizedCpf = patientCpf.replace(/\D/g, "");
      const existingPatient = await publicRepository.findPatientByCpfDigitsForBooking(normalizedCpf);
      if (existingPatient.length > 0) {
        patientId = existingPatient[0].id;
        await publicRepository.updatePatientContact(patientId, patientPhone, patientEmail ?? null);
      } else {
        const [newPatient] = await publicRepository.insertPatient({
          name: patientName,
          cpf: normalizedCpf,
          phone: patientPhone,
          email: patientEmail || null,
        });
        patientId = newPatient.id;
      }
    } else {
      const existingByPhone = await publicRepository.findPatientByPhone(patientPhone);
      if (existingByPhone.length > 0) {
        patientId = existingByPhone[0].id;
      } else {
        const phoneDigits = patientPhone.replace(/\D/g, "");
        const phonePlaceholder = `000.${phoneDigits.slice(-6, -3)}.${phoneDigits.slice(-3)}-00`;
        const [newPatient] = await publicRepository.insertPatient({
          name: patientName,
          cpf: phonePlaceholder,
          phone: patientPhone,
          email: patientEmail || null,
        });
        patientId = newPatient.id;
      }
    }

    const bookingToken = randomUUID();
    const [appointment] = await publicRepository.insertAppointment({
      patientId,
      procedureId: procedure.id,
      date,
      startTime,
      endTime,
      status: "agendado",
      notes: notes || null,
      bookingToken,
      source: "online",
      clinicId: clinicId ? Number(clinicId) : null,
      scheduleId: scheduleId ? Number(scheduleId) : null,
    });

    return {
      success: true,
      bookingToken,
      appointment: {
        id: appointment.id,
        date: appointment.date,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        status: appointment.status,
        procedure: {
          name: procedure.name,
          durationMinutes: procedure.durationMinutes,
          price: procedure.price,
        },
      },
    };
  },

  async getBookingByToken(token: string) {
    const result = await publicRepository.findBookingByToken(token);
    if (!result[0]) throw notFound("Agendamento não encontrado");

    const { appointment, patient, procedure } = result[0];
    return {
      id: appointment.id,
      date: appointment.date,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      status: appointment.status,
      notes: appointment.notes,
      bookingToken: appointment.bookingToken,
      patient: patient
        ? { name: patient.name, phone: patient.phone, email: patient.email }
        : null,
      procedure: procedure
        ? {
            id: procedure.id,
            name: procedure.name,
            durationMinutes: procedure.durationMinutes,
            price: procedure.price,
          }
        : null,
    };
  },

  async cancelBooking(token: string) {
    const [appointment] = await publicRepository.findAppointmentByToken(token);
    if (!appointment) throw notFound("Agendamento não encontrado");
    if (appointment.status === "cancelado") throw badRequest("Agendamento já está cancelado");
    if (appointment.status === "concluido") {
      throw badRequest("Não é possível cancelar uma consulta já concluída");
    }
    if (appointment.date < todayBRT()) {
      throw badRequest("Não é possível cancelar uma consulta passada");
    }

    await publicRepository.cancelAppointment(appointment.id);
    return { success: true, message: "Agendamento cancelado com sucesso" };
  },

  async getClinicInfo() {
    const [clinic] = await publicRepository.findActiveClinicInfo();
    if (!clinic) {
      return {
        name: "FisioGest Pro",
        type: "clinica",
        phone: null,
        email: null,
        address: null,
        website: null,
        logoUrl: null,
      };
    }
    return clinic;
  },
};
