import { pgTable, serial, text, integer, numeric, timestamp, date, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { patientsTable } from "./patients";
import { proceduresTable } from "./procedures";

export const patientSubscriptionsTable = pgTable("patient_subscriptions", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id),
  procedureId: integer("procedure_id").notNull().references(() => proceduresTable.id),
  startDate: date("start_date").notNull(),
  billingDay: integer("billing_day").notNull(),
  monthlyAmount: numeric("monthly_amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("ativa"),
  clinicId: integer("clinic_id"),
  notes: text("notes"),
  cancelledAt: timestamp("cancelled_at"),
  nextBillingDate: date("next_billing_date"),
  subscriptionType: text("subscription_type").notNull().default("mensal"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_patient_subscriptions_patient_id").on(table.patientId),
  index("idx_patient_subscriptions_clinic_id").on(table.clinicId),
  index("idx_patient_subscriptions_status").on(table.status),
  index("idx_patient_subscriptions_next_billing").on(table.nextBillingDate),
]);

export const insertPatientSubscriptionSchema = createInsertSchema(patientSubscriptionsTable).omit({ id: true, createdAt: true });
export type InsertPatientSubscription = z.infer<typeof insertPatientSubscriptionSchema>;
export type PatientSubscription = typeof patientSubscriptionsTable.$inferSelect;
