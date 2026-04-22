import { pgTable, serial, text, integer, numeric, timestamp, boolean, unique, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const proceduresTable = pgTable("procedures", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  modalidade: text("modalidade").notNull().default("individual"),
  durationMinutes: integer("duration_minutes").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  cost: numeric("cost", { precision: 10, scale: 2 }).default("0"),
  description: text("description"),
  maxCapacity: integer("max_capacity").notNull().default(1),
  onlineBookingEnabled: boolean("online_booking_enabled").notNull().default(false),
  billingType: text("billing_type").notNull().default("porSessao"),
  monthlyPrice: numeric("monthly_price", { precision: 10, scale: 2 }),
  billingDay: integer("billing_day"),
  clinicId: integer("clinic_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Per-clinic cost configuration for procedures.
 *
 * A procedure (global or clinic-specific) can have a separate cost
 * configuration for each clinic, enabling different fixed/variable costs
 * and optional price overrides per clinic.
 *
 * Logic:
 *   effectivePrice      = priceOverride ?? procedure.price
 *   effectiveMonthly    = monthlyPriceOverride ?? procedure.monthlyPrice
 *   effectiveTotalCost  = fixedCost + variableCost  (per session)
 */
export const procedureCostsTable = pgTable("procedure_costs", {
  id: serial("id").primaryKey(),
  procedureId: integer("procedure_id")
    .notNull()
    .references(() => proceduresTable.id, { onDelete: "cascade" }),
  clinicId: integer("clinic_id").notNull(),
  priceOverride: numeric("price_override", { precision: 10, scale: 2 }),
  monthlyPriceOverride: numeric("monthly_price_override", { precision: 10, scale: 2 }),
  fixedCost: numeric("fixed_cost", { precision: 10, scale: 2 }).notNull().default("0"),
  variableCost: numeric("variable_cost", { precision: 10, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("uq_procedure_costs_procedure_clinic").on(table.procedureId, table.clinicId),
  index("idx_procedure_costs_clinic_id").on(table.clinicId),
  index("idx_procedure_costs_procedure_id").on(table.procedureId),
]);

export const insertProcedureSchema = createInsertSchema(proceduresTable).omit({ id: true, createdAt: true });
export const insertProcedureCostSchema = createInsertSchema(procedureCostsTable).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertProcedure = z.infer<typeof insertProcedureSchema>;
export type InsertProcedureCost = z.infer<typeof insertProcedureCostSchema>;
export type Procedure = typeof proceduresTable.$inferSelect;
export type ProcedureCost = typeof procedureCostsTable.$inferSelect;
