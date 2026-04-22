import { db } from "@workspace/db";
import {
  appointmentsTable, patientsTable, proceduresTable, blockedSlotsTable,
  patientPackagesTable, packagesTable, sessionCreditsTable, schedulesTable,
} from "@workspace/db";
import { eq, and, gt, ne, sql, desc } from "drizzle-orm";

// ─── Read appointment with patient + procedure joined ────────────────────────
export async function getWithDetails(id: number, clinicId?: number | null) {
  const conditions: any[] = [eq(appointmentsTable.id, id)];
  if (clinicId) conditions.push(eq(appointmentsTable.clinicId, clinicId));

  const result = await db
    .select({ appointment: appointmentsTable, patient: patientsTable, procedure: proceduresTable })
    .from(appointmentsTable)
    .leftJoin(patientsTable, eq(appointmentsTable.patientId, patientsTable.id))
    .leftJoin(proceduresTable, eq(appointmentsTable.procedureId, proceduresTable.id))
    .where(and(...conditions))
    .limit(1);

  if (!result[0]) return null;
  const { appointment, patient, procedure } = result[0];
  return { ...appointment, patient, procedure };
}

// ─── Monthly package credit policy ───────────────────────────────────────────
export async function resolveMonthlyPackageCreditPolicy(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  patientId: number,
  procedureId: number,
  clinicId?: number | null
): Promise<{ patientPackageId: number | null; absenceCreditLimit: number | null }> {
  const conditions: any[] = [
    eq(patientPackagesTable.patientId, patientId),
    eq(patientPackagesTable.procedureId, procedureId),
    eq(packagesTable.packageType, "mensal"),
  ];
  if (clinicId) conditions.push(eq(patientPackagesTable.clinicId, clinicId));

  const [patientPackage] = await tx
    .select({
      id: patientPackagesTable.id,
      absenceCreditLimit: packagesTable.absenceCreditLimit,
    })
    .from(patientPackagesTable)
    .innerJoin(packagesTable, eq(patientPackagesTable.packageId, packagesTable.id))
    .where(and(...conditions))
    .orderBy(desc(patientPackagesTable.createdAt))
    .limit(1);

  if (!patientPackage) {
    return { patientPackageId: null, absenceCreditLimit: null };
  }

  return {
    patientPackageId: patientPackage.id,
    absenceCreditLimit: Number(patientPackage.absenceCreditLimit ?? 0),
  };
}

export async function countAbsenceCreditsInMonth(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  patientId: number,
  procedureId: number,
  startDate: string,
  endDate: string,
  clinicId?: number | null
): Promise<number> {
  const conditions: any[] = [
    eq(sessionCreditsTable.patientId, patientId),
    eq(sessionCreditsTable.procedureId, procedureId),
    gt(sessionCreditsTable.quantity, 0),
    sql`${sessionCreditsTable.sourceAppointmentId} IS NOT NULL`,
    sql`${sessionCreditsTable.createdAt} >= ${startDate}::date`,
    sql`${sessionCreditsTable.createdAt} < (${endDate}::date + interval '1 day')`,
  ];
  if (clinicId) conditions.push(eq(sessionCreditsTable.clinicId, clinicId));

  const [row] = await tx
    .select({ total: sql<number>`count(*)` })
    .from(sessionCreditsTable)
    .where(and(...conditions));

  return Number(row?.total ?? 0);
}

// ─── Conflict check ──────────────────────────────────────────────────────────
export async function checkConflict(
  date: string,
  startTime: string,
  endTime: string,
  procedureId: number,
  maxCapacity: number,
  excludeId?: number,
  scheduleId?: number | null,
  clinicId?: number | null
): Promise<{ conflict: boolean; currentCount: number; reason?: string }> {
  if (maxCapacity > 1) {
    const sameSessionConds: any[] = [
      eq(appointmentsTable.date, date),
      eq(appointmentsTable.procedureId, procedureId),
      eq(appointmentsTable.startTime, startTime),
      sql`status NOT IN ('cancelado', 'faltou', 'remarcado')`,
    ];
    if (clinicId) sameSessionConds.push(eq(appointmentsTable.clinicId, clinicId));
    if (scheduleId) sameSessionConds.push(eq(appointmentsTable.scheduleId, scheduleId));
    if (excludeId) sameSessionConds.push(ne(appointmentsTable.id, excludeId));

    const sameSession = await db
      .select({ id: appointmentsTable.id })
      .from(appointmentsTable)
      .where(and(...sameSessionConds));

    if (sameSession.length >= maxCapacity) {
      return { conflict: true, currentCount: sameSession.length, reason: "full" };
    }

    const overlapConds: any[] = [
      eq(appointmentsTable.date, date),
      eq(appointmentsTable.procedureId, procedureId),
      sql`status NOT IN ('cancelado', 'faltou', 'remarcado')`,
      sql`start_time != ${startTime}`,
      sql`start_time < ${endTime} AND end_time > ${startTime}`,
    ];
    if (clinicId) overlapConds.push(eq(appointmentsTable.clinicId, clinicId));
    if (scheduleId) overlapConds.push(eq(appointmentsTable.scheduleId, scheduleId));
    if (excludeId) overlapConds.push(ne(appointmentsTable.id, excludeId));

    const overlapping = await db
      .select({ id: appointmentsTable.id, startTime: appointmentsTable.startTime })
      .from(appointmentsTable)
      .where(and(...overlapConds));

    if (overlapping.length > 0) {
      return { conflict: true, currentCount: sameSession.length, reason: "overlap" };
    }

    return { conflict: false, currentCount: sameSession.length };
  } else {
    const conditions: any[] = [
      eq(appointmentsTable.date, date),
      sql`status NOT IN ('cancelado', 'faltou', 'remarcado')`,
      sql`start_time < ${endTime} AND end_time > ${startTime}`,
    ];
    if (clinicId) conditions.push(eq(appointmentsTable.clinicId, clinicId));
    if (scheduleId) conditions.push(eq(appointmentsTable.scheduleId, scheduleId));
    if (excludeId) conditions.push(ne(appointmentsTable.id, excludeId));

    const existing = await db
      .select({ id: appointmentsTable.id })
      .from(appointmentsTable)
      .where(and(...conditions));

    return { conflict: existing.length > 0, currentCount: existing.length };
  }
}
