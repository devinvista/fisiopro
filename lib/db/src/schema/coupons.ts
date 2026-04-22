import {
  pgTable, serial, text, integer, numeric, boolean, timestamp, jsonb,
} from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";
import { usersTable } from "./users";
import { clinicSubscriptionsTable } from "./saas-plans";

export const couponsTable = pgTable("coupons", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  description: text("description").notNull().default(""),
  type: text("type").notNull().default("discount"),
  discountType: text("discount_type").notNull().default("percent"),
  discountValue: numeric("discount_value", { precision: 10, scale: 2 }).notNull(),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").notNull().default(0),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").notNull().default(true),
  minPlanAmount: numeric("min_plan_amount", { precision: 10, scale: 2 }),
  applicablePlanNames: jsonb("applicable_plan_names"),
  referrerClinicId: integer("referrer_clinic_id").references(() => clinicsTable.id, { onDelete: "set null" }),
  referrerBenefitType: text("referrer_benefit_type"),
  referrerBenefitValue: numeric("referrer_benefit_value", { precision: 10, scale: 2 }),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const couponUsesTable = pgTable("coupon_uses", {
  id: serial("id").primaryKey(),
  couponId: integer("coupon_id").notNull().references(() => couponsTable.id, { onDelete: "cascade" }),
  clinicId: integer("clinic_id").notNull().references(() => clinicsTable.id, { onDelete: "cascade" }),
  subscriptionId: integer("subscription_id").references(() => clinicSubscriptionsTable.id, { onDelete: "set null" }),
  discountApplied: numeric("discount_applied", { precision: 10, scale: 2 }),
  extraTrialDays: integer("extra_trial_days"),
  usedAt: timestamp("used_at").defaultNow().notNull(),
});

export type Coupon = typeof couponsTable.$inferSelect;
export type InsertCoupon = typeof couponsTable.$inferInsert;
export type CouponUse = typeof couponUsesTable.$inferSelect;
export type InsertCouponUse = typeof couponUsesTable.$inferInsert;
