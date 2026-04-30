/**
 * Sprint Financeiro 11 (P5) — Cláusulas contratuais configuráveis por clínica.
 *
 * Cada clínica define seu próprio conjunto de cláusulas (ex.: reagendamento
 * intramensal, preço diferenciado, título executivo). No aceite do plano, o
 * paciente seleciona quais cláusulas leu/aceitou e o snapshot fica congelado
 * em `treatment_plans.accepted_clauses_json` para fins probatórios LGPD/CPC.
 *
 * Convenções:
 *   • `code` é estável (ex.: "REAGENDAMENTO_INTRAMENSAL").
 *   • Versões antigas ficam preservadas com `is_active=false`. O service
 *     garante que apenas uma versão por (clinic_id, code) esteja ativa.
 */
import { pgTable, serial, integer, text, boolean, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clinicsTable } from "./clinics";

export const clinicContractClausesTable = pgTable("clinic_contract_clauses", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id").notNull().references(() => clinicsTable.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  version: integer("version").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
  isRequired: boolean("is_required").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_clinic_contract_clauses_clinic").on(table.clinicId),
  uniqueIndex("uniq_clinic_contract_clauses_clinic_code_version").on(
    table.clinicId,
    table.code,
    table.version,
  ),
]);

export const insertClinicContractClauseSchema = createInsertSchema(clinicContractClausesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertClinicContractClause = z.infer<typeof insertClinicContractClauseSchema>;
export type ClinicContractClause = typeof clinicContractClausesTable.$inferSelect;
