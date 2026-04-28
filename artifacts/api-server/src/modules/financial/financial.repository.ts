import { db } from "@workspace/db";
import {
  appointmentsTable, financialRecordsTable, patientsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import type { AuthRequest } from "../../middleware/auth.js";

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
