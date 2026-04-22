import { pgTable, serial, integer, text, numeric, timestamp, date, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { patientsTable } from "./patients";
import { packagesTable } from "./packages";
import { proceduresTable } from "./procedures";

export const patientPackagesTable = pgTable("patient_packages", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id),
  packageId: integer("package_id").references(() => packagesTable.id),
  procedureId: integer("procedure_id").notNull().references(() => proceduresTable.id),
  name: text("name").notNull(),
  totalSessions: integer("total_sessions").notNull(),
  usedSessions: integer("used_sessions").notNull().default(0),
  sessionsPerWeek: integer("sessions_per_week").notNull().default(1),
  startDate: date("start_date").notNull(),
  expiryDate: date("expiry_date"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  paymentStatus: text("payment_status").notNull().default("pendente"),
  notes: text("notes"),
  clinicId: integer("clinic_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_patient_packages_patient_id").on(table.patientId),
  index("idx_patient_packages_clinic_id").on(table.clinicId),
]);

export const insertPatientPackageSchema = createInsertSchema(patientPackagesTable).omit({ id: true, createdAt: true });
export type InsertPatientPackage = z.infer<typeof insertPatientPackageSchema>;
export type PatientPackage = typeof patientPackagesTable.$inferSelect;
