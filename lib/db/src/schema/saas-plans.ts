import { pgTable, serial, text, integer, numeric, boolean, timestamp, date, jsonb } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";
import { usersTable } from "./users";

export const subscriptionPlansTable = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  displayName: text("display_name").notNull(),
  description: text("description").notNull().default(""),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  maxProfessionals: integer("max_professionals"),
  maxPatients: integer("max_patients"),
  maxSchedules: integer("max_schedules"),
  maxUsers: integer("max_users"),
  trialDays: integer("trial_days").notNull().default(30),
  features: jsonb("features").notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const clinicSubscriptionsTable = pgTable("clinic_subscriptions", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  planId: integer("plan_id")
    .notNull()
    .references(() => subscriptionPlansTable.id),
  status: text("status").notNull().default("trial"),
  trialStartDate: date("trial_start_date"),
  trialEndDate: date("trial_end_date"),
  currentPeriodStart: date("current_period_start"),
  currentPeriodEnd: date("current_period_end"),
  amount: numeric("amount", { precision: 10, scale: 2 }),
  paymentStatus: text("payment_status").notNull().default("pending"),
  paidAt: timestamp("paid_at"),
  cancelledAt: timestamp("cancelled_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const clinicPaymentHistoryTable = pgTable("clinic_payment_history", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  subscriptionId: integer("subscription_id").references(() => clinicSubscriptionsTable.id, {
    onDelete: "set null",
  }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  method: text("method").notNull().default("manual"),
  referenceMonth: text("reference_month"),
  paidAt: timestamp("paid_at").notNull().defaultNow(),
  notes: text("notes"),
  recordedBy: integer("recorded_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type SubscriptionPlan = typeof subscriptionPlansTable.$inferSelect;
export type InsertSubscriptionPlan = typeof subscriptionPlansTable.$inferInsert;
export type ClinicSubscription = typeof clinicSubscriptionsTable.$inferSelect;
export type InsertClinicSubscription = typeof clinicSubscriptionsTable.$inferInsert;
export type ClinicPaymentHistory = typeof clinicPaymentHistoryTable.$inferSelect;
export type InsertClinicPaymentHistory = typeof clinicPaymentHistoryTable.$inferInsert;
