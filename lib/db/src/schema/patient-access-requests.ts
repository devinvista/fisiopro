import { pgTable, serial, text, integer, timestamp, index, unique } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const patientAccessRequestsTable = pgTable("patient_access_requests", {
  id: serial("id").primaryKey(),
  cpf: text("cpf").notNull(),
  requestingClinicId: integer("requesting_clinic_id").notNull(),
  sourceClinicId: integer("source_clinic_id").notNull(),
  status: text("status").notNull().default("pending"),
  scope: text("scope").notNull().default("clinical_records"),
  message: text("message"),
  respondedAt: timestamp("responded_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_par_cpf").on(table.cpf),
  index("idx_par_source_clinic").on(table.sourceClinicId),
  index("idx_par_requesting_clinic").on(table.requestingClinicId),
  unique("par_cpf_requesting_unique").on(table.cpf, table.requestingClinicId),
]);

export type PatientAccessRequest = typeof patientAccessRequestsTable.$inferSelect;

export const patientAccessRequestStatusValues = ["pending", "approved", "denied"] as const;
export type PatientAccessRequestStatus = typeof patientAccessRequestStatusValues[number];
