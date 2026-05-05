import { db } from "@workspace/db";
import {
  appointmentsTable, financialRecordsTable, patientClinicsTable,
} from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import type { AuthRequest } from "../../middleware/auth.js";

export function clinicCond(req: AuthRequest) {
  if (!req.clinicId) return null;
  return eq(financialRecordsTable.clinicId, req.clinicId);
}

export function apptClinicCond(req: AuthRequest) {
  if (!req.clinicId) return null;
  return eq(appointmentsTable.clinicId, req.clinicId);
}

export async function assertPatientInClinic(
  patientId: number,
  req: AuthRequest,
): Promise<boolean> {
  if (!req.clinicId) return true;
  const [binding] = await db
    .select({ id: patientClinicsTable.id })
    .from(patientClinicsTable)
    .where(and(
      eq(patientClinicsTable.patientId, patientId),
      eq(patientClinicsTable.clinicId, req.clinicId),
      isNull(patientClinicsTable.deletedAt),
    ))
    .limit(1);
  return !!binding;
}
