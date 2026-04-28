import { pgTable, serial, text, integer, numeric, timestamp, date, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { appointmentsTable } from "./appointments";
import { patientsTable } from "./patients";
import { proceduresTable } from "./procedures";

export const financialRecordsTable = pgTable("financial_records", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  description: text("description").notNull(),
  category: text("category"),
  appointmentId: integer("appointment_id").references(() => appointmentsTable.id),
  patientId: integer("patient_id").references(() => patientsTable.id),
  procedureId: integer("procedure_id").references(() => proceduresTable.id),
  clinicId: integer("clinic_id"),
  paymentDate: date("payment_date"),
  paymentMethod: text("payment_method"),
  transactionType: text("transaction_type"),
  status: text("status").notNull().default("pendente"),
  dueDate: date("due_date"),
  // Coluna histórica preservada (sem FK) para auditoria de lançamentos
  // legados — o domínio `patient_subscriptions` foi removido na Sprint 6.
  subscriptionId: integer("subscription_id"),
  // Vínculo com `patient_packages.id` para a recorrência unificada
  // (`runBilling` lendo de `patient_packages` e `pendenteFatura` criados em
  // `appointments.billing.ts`).
  patientPackageId: integer("patient_package_id"),
  accountingEntryId: integer("accounting_entry_id"),
  recognizedEntryId: integer("recognized_entry_id"),
  settlementEntryId: integer("settlement_entry_id"),
  // ── Auditoria de preço (Sprint 1) ─────────────────────────────────────────
  // Origem do valor cobrado: "tabela" | "override_clinica" | "plano_tratamento"
  priceSource: text("price_source"),
  // Preço de tabela vigente no momento do lançamento — útil para auditoria
  // fiscal e para mostrar o desconto efetivamente aplicado.
  originalUnitPrice: numeric("original_unit_price", { precision: 10, scale: 2 }),
  // Plano de tratamento que ditou o preço (NULL quando origem = tabela/override).
  treatmentPlanId: integer("treatment_plan_id"),
  // ── Materialização: vínculo com item do plano e mês de competência ────────
  // Quando este registro é uma fatura mensal materializada, aponta para o
  // item do plano (treatment_plan_procedures.id) que a originou.
  treatmentPlanProcedureId: integer("treatment_plan_procedure_id"),
  // Mês de competência da fatura (sempre dia 01). Usado para localizar
  // rapidamente a fatura ao agendar/reagendar appointments.
  planMonthRef: date("plan_month_ref"),
  // ── Sprint 4 — Vínculo com fatura consolidada ─────────────────────────────
  // Quando este lançamento é um item detalhado consolidado em uma
  // `faturaMensalAvulso`, aponta para o `id` da fatura agrupadora.
  // A fatura agrupadora tem `parentRecordId = null`.
  parentRecordId: integer("parent_record_id"),
  // ── Auditoria de estornos (Sprint 3 T9) ───────────────────────────────────
  // Valor original do lançamento antes do estorno (preserva valor mesmo se
  // o `amount` for editado depois). Preenchido quando `status` muda para
  // `estornado`/`cancelado`.
  originalAmount: numeric("original_amount", { precision: 10, scale: 2 }),
  // Motivo informado pelo usuário ao realizar o estorno (obrigatório no
  // endpoint /estorno e na mudança de status para cancelado/estornado).
  reversalReason: text("reversal_reason"),
  // Quem aplicou o estorno (FK lógica para users; sem onDelete para preservar histórico).
  reversedBy: integer("reversed_by"),
  // Data/hora exata do estorno (independente do `paymentDate` original).
  reversedAt: timestamp("reversed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_financial_records_clinic_id").on(table.clinicId),
  index("idx_financial_records_status").on(table.status),
  index("idx_financial_records_due_date").on(table.dueDate),
  index("idx_financial_records_patient_id").on(table.patientId),
  index("idx_financial_records_type").on(table.type),
]);

export const insertFinancialRecordSchema = createInsertSchema(financialRecordsTable).omit({ id: true, createdAt: true });
export type InsertFinancialRecord = z.infer<typeof insertFinancialRecordSchema>;
export type FinancialRecord = typeof financialRecordsTable.$inferSelect;
