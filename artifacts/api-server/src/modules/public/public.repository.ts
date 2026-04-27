import { db } from "@workspace/db";
import {
  appointmentsTable,
  blockedSlotsTable,
  clinicsTable,
  patientPackagesTable,
  patientsTable,
  proceduresTable,
  schedulesTable,
  subscriptionPlansTable,
  treatmentPlansTable,
} from "@workspace/db";
import { and, asc, desc, eq, gt, isNull, or, sql } from "drizzle-orm";

export const publicRepository = {
  // ── Plans ───────────────────────────────────────────────────────────────────
  listActivePlans() {
    return db
      .select()
      .from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.isActive, true))
      .orderBy(asc(subscriptionPlansTable.price));
  },

  // ── Patient lookup ──────────────────────────────────────────────────────────
  findPatientByCpfDigits(cleaned: string) {
    return db
      .select()
      .from(patientsTable)
      .where(sql`regexp_replace(${patientsTable.cpf}, '[^0-9]', '', 'g') = ${cleaned}`)
      .limit(1);
  },

  findPatientByCpfFormatted(cpfFormatted: string) {
    return db
      .select()
      .from(patientsTable)
      .where(eq(patientsTable.cpf, cpfFormatted))
      .limit(1);
  },

  findPatientByPhoneDigits(cleanedTail: string) {
    return db
      .select()
      .from(patientsTable)
      .where(sql`regexp_replace(phone, '[^0-9]', '', 'g') LIKE ${"%" + cleanedTail}`)
      .limit(1);
  },

  findPatientByPhoneExact(phone: string) {
    return db
      .select()
      .from(patientsTable)
      .where(eq(patientsTable.phone, phone))
      .limit(1);
  },

  findActiveTreatmentPlan(patientId: number) {
    return db
      .select()
      .from(treatmentPlansTable)
      .where(
        and(eq(treatmentPlansTable.patientId, patientId), eq(treatmentPlansTable.status, "ativo")),
      )
      .limit(1);
  },

  findActivePackageClinic(patientId: number, today: string) {
    return db
      .select({ clinicId: patientPackagesTable.clinicId })
      .from(patientPackagesTable)
      .where(
        and(
          eq(patientPackagesTable.patientId, patientId),
          sql`${patientPackagesTable.usedSessions} < ${patientPackagesTable.totalSessions}`,
          or(
            isNull(patientPackagesTable.expiryDate),
            gt(patientPackagesTable.expiryDate, today),
          ),
        ),
      )
      .limit(1);
  },

  findClinicName(clinicId: number) {
    return db
      .select({ name: clinicsTable.name })
      .from(clinicsTable)
      .where(eq(clinicsTable.id, clinicId))
      .limit(1);
  },

  findRecentPatientAppointments(patientId: number, limit = 20) {
    return db
      .select({ procedureId: appointmentsTable.procedureId })
      .from(appointmentsTable)
      .where(
        and(
          eq(appointmentsTable.patientId, patientId),
          sql`${appointmentsTable.status} NOT IN ('cancelado', 'faltou')`,
        ),
      )
      .orderBy(desc(appointmentsTable.createdAt))
      .limit(limit);
  },

  // ── Procedures / schedules ──────────────────────────────────────────────────
  listOnlineBookableProcedures(clinicId: number | null) {
    const where = clinicId
      ? and(
          eq(proceduresTable.onlineBookingEnabled, true),
          eq(proceduresTable.isActive, true),
          or(isNull(proceduresTable.clinicId), eq(proceduresTable.clinicId, clinicId)),
        )
      : and(
          eq(proceduresTable.onlineBookingEnabled, true),
          eq(proceduresTable.isActive, true),
        );

    return db
      .select({
        id: proceduresTable.id,
        name: proceduresTable.name,
        category: proceduresTable.category,
        durationMinutes: proceduresTable.durationMinutes,
        price: proceduresTable.price,
        description: proceduresTable.description,
        maxCapacity: proceduresTable.maxCapacity,
      })
      .from(proceduresTable)
      .where(where)
      .orderBy(proceduresTable.category, proceduresTable.name);
  },

  listClinicSchedules(clinicId: number) {
    return db
      .select({
        id: schedulesTable.id,
        name: schedulesTable.name,
        description: schedulesTable.description,
        type: schedulesTable.type,
        workingDays: schedulesTable.workingDays,
        startTime: schedulesTable.startTime,
        endTime: schedulesTable.endTime,
        slotDurationMinutes: schedulesTable.slotDurationMinutes,
        color: schedulesTable.color,
      })
      .from(schedulesTable)
      .where(and(eq(schedulesTable.clinicId, clinicId), eq(schedulesTable.isActive, true)))
      .orderBy(schedulesTable.name);
  },

  findOnlineBookableProcedure(id: number) {
    return db
      .select()
      .from(proceduresTable)
      .where(and(eq(proceduresTable.id, id), eq(proceduresTable.onlineBookingEnabled, true)));
  },

  findScheduleById(scheduleId: number) {
    return db.select().from(schedulesTable).where(eq(schedulesTable.id, scheduleId));
  },

  findAppointmentsForDate(date: string, scheduleId: number | null, clinicId: number | null) {
    const where = scheduleId
      ? and(
          eq(appointmentsTable.date, date),
          sql`status NOT IN ('cancelado', 'faltou')`,
          eq(appointmentsTable.scheduleId, scheduleId),
        )
      : clinicId
        ? and(
            eq(appointmentsTable.date, date),
            sql`status NOT IN ('cancelado', 'faltou')`,
            eq(appointmentsTable.clinicId, clinicId),
          )
        : and(eq(appointmentsTable.date, date), sql`status NOT IN ('cancelado', 'faltou')`);

    return db
      .select({
        id: appointmentsTable.id,
        procedureId: appointmentsTable.procedureId,
        startTime: appointmentsTable.startTime,
        endTime: appointmentsTable.endTime,
      })
      .from(appointmentsTable)
      .where(where);
  },

  findBlockedSlotsForDate(date: string, scheduleId: number | null) {
    const where = scheduleId
      ? and(eq(blockedSlotsTable.date, date), eq(blockedSlotsTable.scheduleId, scheduleId))
      : eq(blockedSlotsTable.date, date);

    return db
      .select({ startTime: blockedSlotsTable.startTime, endTime: blockedSlotsTable.endTime })
      .from(blockedSlotsTable)
      .where(where);
  },

  // ── Booking ────────────────────────────────────────────────────────────────
  countSameSessionBookings(date: string, procedureId: number, startTime: string) {
    return db
      .select({ id: appointmentsTable.id })
      .from(appointmentsTable)
      .where(
        and(
          eq(appointmentsTable.date, date),
          eq(appointmentsTable.procedureId, procedureId),
          eq(appointmentsTable.startTime, startTime),
          sql`status NOT IN ('cancelado', 'faltou')`,
        ),
      );
  },

  findOverlappingAppointments(date: string, startTime: string, endTime: string) {
    return db
      .select({ id: appointmentsTable.id })
      .from(appointmentsTable)
      .where(
        and(
          eq(appointmentsTable.date, date),
          sql`status NOT IN ('cancelado', 'faltou')`,
          sql`start_time < ${endTime} AND end_time > ${startTime}`,
        ),
      );
  },

  findPatientByCpfDigitsForBooking(cleaned: string) {
    return db
      .select({ id: patientsTable.id })
      .from(patientsTable)
      .where(sql`regexp_replace(${patientsTable.cpf}, '[^0-9]', '', 'g') = ${cleaned}`)
      .limit(1);
  },

  findPatientByPhone(phone: string) {
    return db
      .select({ id: patientsTable.id })
      .from(patientsTable)
      .where(eq(patientsTable.phone, phone))
      .limit(1);
  },

  updatePatientContact(patientId: number, phone: string, email: string | null) {
    return db
      .update(patientsTable)
      .set({ phone, ...(email ? { email } : {}) })
      .where(eq(patientsTable.id, patientId));
  },

  insertPatient(values: { name: string; cpf: string; phone: string; email: string | null }) {
    return db
      .insert(patientsTable)
      .values(values)
      .returning({ id: patientsTable.id });
  },

  insertAppointment(values: {
    patientId: number;
    procedureId: number;
    date: string;
    startTime: string;
    endTime: string;
    status: "agendado";
    notes: string | null;
    bookingToken: string;
    source: "online";
    clinicId: number | null;
    scheduleId: number;
  }) {
    return db.insert(appointmentsTable).values(values).returning();
  },

  // ── Booking lookup / cancel ────────────────────────────────────────────────
  findBookingByToken(token: string) {
    return db
      .select({
        appointment: appointmentsTable,
        patient: patientsTable,
        procedure: proceduresTable,
      })
      .from(appointmentsTable)
      .leftJoin(patientsTable, eq(appointmentsTable.patientId, patientsTable.id))
      .leftJoin(proceduresTable, eq(appointmentsTable.procedureId, proceduresTable.id))
      .where(eq(appointmentsTable.bookingToken, token))
      .limit(1);
  },

  findAppointmentByToken(token: string) {
    return db
      .select({
        id: appointmentsTable.id,
        status: appointmentsTable.status,
        date: appointmentsTable.date,
      })
      .from(appointmentsTable)
      .where(eq(appointmentsTable.bookingToken, token));
  },

  cancelAppointment(id: number) {
    return db
      .update(appointmentsTable)
      .set({ status: "cancelado" })
      .where(eq(appointmentsTable.id, id));
  },

  // ── Clinic info ────────────────────────────────────────────────────────────
  findActiveClinicInfo() {
    return db
      .select({
        name: clinicsTable.name,
        type: clinicsTable.type,
        responsibleTechnical: clinicsTable.responsibleTechnical,
        phone: clinicsTable.phone,
        email: clinicsTable.email,
        address: clinicsTable.address,
        website: clinicsTable.website,
        logoUrl: clinicsTable.logoUrl,
      })
      .from(clinicsTable)
      .where(eq(clinicsTable.isActive, true))
      .limit(1);
  },
};
