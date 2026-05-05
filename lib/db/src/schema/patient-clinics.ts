import { pgTable, serial, integer, text, timestamp, index, unique } from "drizzle-orm/pg-core";
import { patientsTable } from "./patients";
import { clinicsTable } from "./clinics";

export const patientClinicsTable = pgTable("patient_clinics", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id")
    .notNull()
    .references(() => patientsTable.id, { onDelete: "cascade" }),
  clinicId: integer("clinic_id")
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  notes: text("notes"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
}, (table) => [
  index("idx_patient_clinics_patient_id").on(table.patientId),
  index("idx_patient_clinics_clinic_id").on(table.clinicId),
  unique("uniq_patient_clinics_patient_clinic").on(table.patientId, table.clinicId),
]);

export type PatientClinic = typeof patientClinicsTable.$inferSelect;
export type InsertPatientClinic = typeof patientClinicsTable.$inferInsert;
