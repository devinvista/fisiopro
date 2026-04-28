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
  // ── Política de créditos ──────────────────────────────────────────────
  // Dias adicionais após o fim do mês em que o crédito mensal continua
  // válido (default 0 = expira no último dia do mês de competência).
  monthlyCreditValidityDays: integer("monthly_credit_validity_days").notNull().default(0),
  // Validade do crédito gerado por falta/remarcação (default 30 dias).
  replacementCreditValidityDays: integer("replacement_credit_validity_days").notNull().default(30),
  // Modo de pagamento da fatura mensal:
  //   - "postpago"  : créditos disponíveis imediatamente; fatura cobrada depois.
  //   - "prepago"   : créditos só ficam disponíveis quando a fatura é paga.
  paymentMode: text("payment_mode").notNull().default("postpago"),
  isActive: boolean("is_active").notNull().default(true),
  clinicId: integer("clinic_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPackageSchema = createInsertSchema(packagesTable).omit({ id: true, createdAt: true });
export type InsertPackage = z.infer<typeof insertPackageSchema>;
export type Package = typeof packagesTable.$inferSelect;
