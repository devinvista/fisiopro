import { pgTable, serial, text, integer, numeric, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const recurringExpensesTable = pgTable("recurring_expenses", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  frequency: text("frequency").notNull().default("mensal"),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_recurring_expenses_clinic_id").on(table.clinicId),
  index("idx_recurring_expenses_is_active").on(table.isActive),
]);

export const insertRecurringExpenseSchema = createInsertSchema(recurringExpensesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRecurringExpense = z.infer<typeof insertRecurringExpenseSchema>;
export type RecurringExpense = typeof recurringExpensesTable.$inferSelect;
