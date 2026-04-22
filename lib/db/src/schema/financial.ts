import { pgTable, serial, text, integer, numeric, timestamp, date, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { appointmentsTable } from "./appointments";
import { patientsTable } from "./patients";
import { proceduresTable } from "./procedures";

export const financialRecordsTable = pgTable("financial_records", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  description: text("description").notNull(),
  category: text("category"),
  appointmentId: integer("appointment_id").references(() => appointmentsTable.id),
  patientId: integer("patient_id").references(() => patientsTable.id),
  procedureId: integer("procedure_id").references(() => proceduresTable.id),
  clinicId: integer("clinic_id"),
  paymentDate: date("payment_date"),
  paymentMethod: text("payment_method"),
  transactionType: text("transaction_type"),
  status: text("status").notNull().default("pendente"),
  dueDate: date("due_date"),
  subscriptionId: integer("subscription_id"),
  accountingEntryId: integer("accounting_entry_id"),
  recognizedEntryId: integer("recognized_entry_id"),
  settlementEntryId: integer("settlement_entry_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_financial_records_clinic_id").on(table.clinicId),
  index("idx_financial_records_status").on(table.status),
  index("idx_financial_records_due_date").on(table.dueDate),
  index("idx_financial_records_patient_id").on(table.patientId),
  index("idx_financial_records_type").on(table.type),
]);

export const insertFinancialRecordSchema = createInsertSchema(financialRecordsTable).omit({ id: true, createdAt: true });
export type InsertFinancialRecord = z.infer<typeof insertFinancialRecordSchema>;
export type FinancialRecord = typeof financialRecordsTable.$inferSelect;
