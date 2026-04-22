import { pgTable, serial, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clinicsTable = pgTable("clinics", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").default("clinica"),
  cnpj: text("cnpj"),
  cpf: text("cpf"),
  crefito: text("crefito"),
  responsibleTechnical: text("responsible_technical"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  website: text("website"),
  logoUrl: text("logo_url"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Políticas de agendamento
  cancellationPolicyHours: integer("cancellation_policy_hours"),
  autoConfirmHours: integer("auto_confirm_hours"),
  noShowFeeEnabled: boolean("no_show_fee_enabled").notNull().default(false),
  noShowFeeAmount: text("no_show_fee_amount"),
  // Prazo padrão de vencimento de recebíveis gerados por sessão (dias após o atendimento)
  defaultDueDays: integer("default_due_days").notNull().default(3),
});

export const insertClinicSchema = createInsertSchema(clinicsTable).omit({ id: true, createdAt: true });
export type InsertClinic = z.infer<typeof insertClinicSchema>;
export type Clinic = typeof clinicsTable.$inferSelect;
