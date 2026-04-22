import { pgTable, serial, text, integer, numeric, timestamp, date, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { patientsTable } from "./patients";
import { appointmentsTable } from "./appointments";
import { proceduresTable } from "./procedures";
import { patientPackagesTable } from "./patient-packages";
import { patientSubscriptionsTable } from "./subscriptions";
import { patientWalletTransactionsTable } from "./patient-wallet";

export const accountingAccountsTable = pgTable("accounting_accounts", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id"),
  code: text("code").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  normalBalance: text("normal_balance").notNull(),
  isSystem: text("is_system").notNull().default("true"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("uq_accounting_accounts_clinic_code").on(table.clinicId, table.code),
  index("idx_accounting_accounts_clinic_id").on(table.clinicId),
  index("idx_accounting_accounts_code").on(table.code),
]);

export const accountingJournalEntriesTable = pgTable("accounting_journal_entries", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id"),
  entryDate: date("entry_date").notNull(),
  eventType: text("event_type").notNull(),
  description: text("description").notNull(),
  sourceType: text("source_type"),
  sourceId: integer("source_id"),
  patientId: integer("patient_id").references(() => patientsTable.id),
  appointmentId: integer("appointment_id").references(() => appointmentsTable.id),
  procedureId: integer("procedure_id").references(() => proceduresTable.id),
  patientPackageId: integer("patient_package_id").references(() => patientPackagesTable.id),
  subscriptionId: integer("subscription_id").references(() => patientSubscriptionsTable.id),
  walletTransactionId: integer("wallet_transaction_id").references(() => patientWalletTransactionsTable.id),
  financialRecordId: integer("financial_record_id"),
  status: text("status").notNull().default("posted"),
  reversalOfEntryId: integer("reversal_of_entry_id"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_accounting_entries_clinic_id").on(table.clinicId),
  index("idx_accounting_entries_entry_date").on(table.entryDate),
  index("idx_accounting_entries_event_type").on(table.eventType),
  index("idx_accounting_entries_patient_id").on(table.patientId),
  index("idx_accounting_entries_source").on(table.sourceType, table.sourceId),
]);

export const accountingJournalLinesTable = pgTable("accounting_journal_lines", {
  id: serial("id").primaryKey(),
  entryId: integer("entry_id").notNull().references(() => accountingJournalEntriesTable.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => accountingAccountsTable.id),
  debitAmount: numeric("debit_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  creditAmount: numeric("credit_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  memo: text("memo"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_accounting_lines_entry_id").on(table.entryId),
  index("idx_accounting_lines_account_id").on(table.accountId),
]);

export const receivableAllocationsTable = pgTable("receivable_allocations", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id"),
  paymentEntryId: integer("payment_entry_id").notNull().references(() => accountingJournalEntriesTable.id),
  receivableEntryId: integer("receivable_entry_id").notNull().references(() => accountingJournalEntriesTable.id),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  allocatedAt: date("allocated_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_receivable_allocations_clinic_id").on(table.clinicId),
  index("idx_receivable_allocations_patient_id").on(table.patientId),
  index("idx_receivable_allocations_payment_entry_id").on(table.paymentEntryId),
  index("idx_receivable_allocations_receivable_entry_id").on(table.receivableEntryId),
]);

export const insertAccountingAccountSchema = createInsertSchema(accountingAccountsTable).omit({ id: true, createdAt: true });
export type InsertAccountingAccount = z.infer<typeof insertAccountingAccountSchema>;
export type AccountingAccount = typeof accountingAccountsTable.$inferSelect;

export const insertAccountingJournalEntrySchema = createInsertSchema(accountingJournalEntriesTable).omit({ id: true, createdAt: true });
export type InsertAccountingJournalEntry = z.infer<typeof insertAccountingJournalEntrySchema>;
export type AccountingJournalEntry = typeof accountingJournalEntriesTable.$inferSelect;

export const insertAccountingJournalLineSchema = createInsertSchema(accountingJournalLinesTable).omit({ id: true, createdAt: true });
export type InsertAccountingJournalLine = z.infer<typeof insertAccountingJournalLineSchema>;
export type AccountingJournalLine = typeof accountingJournalLinesTable.$inferSelect;

export const insertReceivableAllocationSchema = createInsertSchema(receivableAllocationsTable).omit({ id: true, createdAt: true });
export type InsertReceivableAllocation = z.infer<typeof insertReceivableAllocationSchema>;
export type ReceivableAllocation = typeof receivableAllocationsTable.$inferSelect;