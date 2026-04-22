import { pgTable, serial, text, integer, date, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const patientsTable = pgTable("patients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  cpf: text("cpf").notNull().unique(),
  birthDate: date("birth_date"),
  phone: text("phone").notNull(),
  email: text("email"),
  address: text("address"),
  profession: text("profession"),
  emergencyContact: text("emergency_contact"),
  notes: text("notes"),
  clinicId: integer("clinic_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
}, (table) => [
  index("idx_patients_clinic_id").on(table.clinicId),
  index("idx_patients_name").on(table.name),
]);

export const insertPatientSchema = createInsertSchema(patientsTable).omit({ id: true, createdAt: true });
export type InsertPatient = z.infer<typeof insertPatientSchema>;
export type Patient = typeof patientsTable.$inferSelect;
