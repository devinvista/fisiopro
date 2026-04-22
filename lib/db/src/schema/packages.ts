import { pgTable, serial, text, integer, numeric, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { proceduresTable } from "./procedures";

export const packagesTable = pgTable("packages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  procedureId: integer("procedure_id").notNull().references(() => proceduresTable.id),
  packageType: text("package_type").notNull().default("sessoes"),
  totalSessions: integer("total_sessions"),
  sessionsPerWeek: integer("sessions_per_week").notNull().default(1),
  validityDays: integer("validity_days"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  monthlyPrice: numeric("monthly_price", { precision: 10, scale: 2 }),
  billingDay: integer("billing_day"),
  absenceCreditLimit: integer("absence_credit_limit").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  clinicId: integer("clinic_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPackageSchema = createInsertSchema(packagesTable).omit({ id: true, createdAt: true });
export type InsertPackage = z.infer<typeof insertPackageSchema>;
export type Package = typeof packagesTable.$inferSelect;
