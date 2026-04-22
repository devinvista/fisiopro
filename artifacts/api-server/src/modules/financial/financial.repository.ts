import { db } from "@workspace/db";
import {
  appointmentsTable, financialRecordsTable, patientsTable,
  patientPackagesTable, patientSubscriptionsTable,
} from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import type { AuthRequest } from "../../middleware/auth.js";

// ─── Tenant scoping helpers ──────────────────────────────────────────────────

export function clinicCond(req: AuthRequest) {
  if (req.isSuperAdmin || !req.clinicId) return null;
  return eq(financialRecordsTable.clinicId, req.clinicId);
}

export function apptClinicCond(req: AuthRequest) {
  if (req.isSuperAdmin || !req.clinicId) return null;
  return eq(appointmentsTable.clinicId, req.clinicId);
}

export async function assertPatientInClinic(
  patientId: number,
  req: AuthRequest,
): Promise<boolean> {
  if (req.isSuperAdmin || !req.clinicId) return true;
  const [p] = await db
    .select({ id: patientsTable.id })
    .from(patientsTable)
    .where(and(eq(patientsTable.id, patientId), eq(patientsTable.clinicId, req.clinicId)));
  return !!p;
}

// ─── Subscription <-> Package resolver ──────────────────────────────────────

export async function resolvePackageForSubscription(
  sub: typeof patientSubscriptionsTable.$inferSelect,
  clinicId?: number | null,
) {
  const conditions = [
    eq(patientPackagesTable.patientId, sub.patientId),
    eq(patientPackagesTable.procedureId, sub.procedureId),
  ];
  const resolvedClinicId = sub.clinicId ?? clinicId;
  if (resolvedClinicId) conditions.push(eq(patientPackagesTable.clinicId, resolvedClinicId));

  const [patientPackage] = await db
    .select({
      id: patientPackagesTable.id,
      sessionsPerWeek: patientPackagesTable.sessionsPerWeek,
    })
    .from(patientPackagesTable)
    .where(and(...conditions))
    .orderBy(desc(patientPackagesTable.createdAt))
    .limit(1);

  return patientPackage ?? null;
}
