import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { patientsTable } from "./patients";
import { proceduresTable } from "./procedures";
import { appointmentsTable } from "./appointments";

export const sessionCreditsTable = pgTable("session_credits", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id),
  procedureId: integer("procedure_id").notNull().references(() => proceduresTable.id),
  quantity: integer("quantity").notNull().default(1),
  usedQuantity: integer("used_quantity").notNull().default(0),
  sourceAppointmentId: integer("source_appointment_id").references(() => appointmentsTable.id),
  patientPackageId: integer("patient_package_id"),
  clinicId: integer("clinic_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_session_credits_patient_id").on(table.patientId),
  index("idx_session_credits_clinic_id").on(table.clinicId),
]);

export const insertSessionCreditSchema = createInsertSchema(sessionCreditsTable).omit({ id: true, createdAt: true });
export type InsertSessionCredit = z.infer<typeof insertSessionCreditSchema>;
export type SessionCredit = typeof sessionCreditsTable.$inferSelect;
