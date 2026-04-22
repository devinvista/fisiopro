import { pgTable, serial, integer, numeric, timestamp, text, unique, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { patientsTable } from "./patients";
import { appointmentsTable } from "./appointments";
import { financialRecordsTable } from "./financial";

export const patientWalletTable = pgTable("patient_wallet", {
  id:        serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id, { onDelete: "cascade" }),
  clinicId:  integer("clinic_id"),
  balance:   numeric("balance", { precision: 10, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  unique("uq_patient_wallet_patient_clinic").on(t.patientId, t.clinicId),
  index("idx_patient_wallet_patient_id").on(t.patientId),
]);

export const patientWalletTransactionsTable = pgTable("patient_wallet_transactions", {
  id:                serial("id").primaryKey(),
  walletId:          integer("wallet_id").notNull().references(() => patientWalletTable.id, { onDelete: "cascade" }),
  patientId:         integer("patient_id").notNull().references(() => patientsTable.id, { onDelete: "cascade" }),
  clinicId:          integer("clinic_id"),
  amount:            numeric("amount", { precision: 10, scale: 2 }).notNull(),
  type:              text("type").notNull(),
  description:       text("description").notNull(),
  appointmentId:     integer("appointment_id").references(() => appointmentsTable.id, { onDelete: "set null" }),
  financialRecordId: integer("financial_record_id").references(() => financialRecordsTable.id, { onDelete: "set null" }),
  createdAt:         timestamp("created_at").defaultNow().notNull(),
});

export const insertPatientWalletSchema = createInsertSchema(patientWalletTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPatientWallet = z.infer<typeof insertPatientWalletSchema>;
export type PatientWallet = typeof patientWalletTable.$inferSelect;

export const insertPatientWalletTransactionSchema = createInsertSchema(patientWalletTransactionsTable).omit({ id: true, createdAt: true });
export type InsertPatientWalletTransaction = z.infer<typeof insertPatientWalletTransactionSchema>;
export type PatientWalletTransaction = typeof patientWalletTransactionsTable.$inferSelect;
