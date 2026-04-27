import { pgTable, serial, integer, numeric, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Configurações financeiras da clínica (Sprint 2 — T5).
 *
 * Uma linha por clínica (clinic_id é UNIQUE). Os valores monetários são
 * opcionais: quando nulos, o frontend deve mostrar "Não configurado" e o
 * backend deve usar fallback (ex.: somatório de despesas recorrentes).
 *
 * `default_due_days` foi migrado de `clinics.default_due_days`. Para clínicas
 * que ainda não tenham linha em `clinic_financial_settings`, o backend lê o
 * valor antigo de `clinics` como fallback (compatibilidade). Após a UI nova,
 * toda escrita acontece nesta tabela.
 */
export const clinicFinancialSettingsTable = pgTable("clinic_financial_settings", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id").notNull(),
  // Orçamento total mensal de despesa (R$). NULL = sem orçamento configurado.
  monthlyExpenseBudget: numeric("monthly_expense_budget", { precision: 12, scale: 2 }),
  // Meta mensal de receita (R$). NULL = sem meta configurada.
  monthlyRevenueGoal: numeric("monthly_revenue_goal", { precision: 12, scale: 2 }),
  // Reserva mínima de caixa para alerta no fluxo projetado (R$). NULL = sem alerta.
  cashReserveTarget: numeric("cash_reserve_target", { precision: 12, scale: 2 }),
  // Prazo padrão de vencimento de recebíveis gerados por sessão (dias após o atendimento).
  defaultDueDays: integer("default_due_days").notNull().default(3),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uniq_clinic_financial_settings_clinic_id").on(table.clinicId),
]);

export const insertClinicFinancialSettingsSchema = createInsertSchema(clinicFinancialSettingsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertClinicFinancialSettings = z.infer<typeof insertClinicFinancialSettingsSchema>;
export type ClinicFinancialSettings = typeof clinicFinancialSettingsTable.$inferSelect;

export const updateClinicFinancialSettingsSchema = z.object({
  monthlyExpenseBudget: z.union([z.number().nonnegative(), z.string(), z.null()]).optional(),
  monthlyRevenueGoal: z.union([z.number().nonnegative(), z.string(), z.null()]).optional(),
  cashReserveTarget: z.union([z.number().nonnegative(), z.string(), z.null()]).optional(),
  defaultDueDays: z.number().int().min(0).max(365).optional(),
});
export type UpdateClinicFinancialSettings = z.infer<typeof updateClinicFinancialSettingsSchema>;
