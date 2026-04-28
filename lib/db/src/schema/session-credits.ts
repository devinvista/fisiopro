import { pgTable, serial, text, integer, timestamp, date, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { patientsTable } from "./patients";
import { proceduresTable } from "./procedures";
import { appointmentsTable } from "./appointments";

/**
 * Camada de saldo de crédito do paciente.
 *
 * Cada linha representa uma "emissão" de N créditos (quantity) de um
 * procedimento. O saldo disponível em uma linha é `quantity - usedQuantity`
 * quando `status='disponivel'`. Linhas com status `consumido | expirado |
 * estornado` não compõem saldo.
 *
 * Origem (origin) — de onde o crédito veio:
 *   - mensal              : pool mensal gerado pela materialização do plano.
 *   - reposicaoFalta      : reposição automática por falta em sessão paga.
 *   - reposicaoRemarcacao : reposição por remarcação dentro da política.
 *   - compraPacote        : sessões compradas em pacote `sessoes`.
 *   - cortesia            : crédito manual concedido pela clínica.
 *   - legacy              : créditos pré-existentes ao schema atual.
 *
 * Status — ciclo de vida do crédito:
 *   - disponivel        : saldo > 0 e dentro da validade — pode ser consumido.
 *   - pendentePagamento : crédito de plano `prepago` aguardando fatura paga.
 *   - consumido         : totalmente consumido (ver `consumedByAppointmentId`).
 *   - expirado          : `validUntil` passou antes do consumo.
 *   - estornado         : crédito anulado (ex.: erro de lançamento, cancelamento).
 *
 * Validade:
 *   - `validUntil` nullable. Créditos sem validade nunca expiram.
 *   - `monthRef` opcional, identifica o mês de competência ao qual o
 *     crédito pertence (usado pelo pool mensal e relatórios).
 */
export const sessionCreditsTable = pgTable("session_credits", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id),
  procedureId: integer("procedure_id").notNull().references(() => proceduresTable.id),
  quantity: integer("quantity").notNull().default(1),
  usedQuantity: integer("used_quantity").notNull().default(0),
  sourceAppointmentId: integer("source_appointment_id").references(() => appointmentsTable.id),
  patientPackageId: integer("patient_package_id"),
  clinicId: integer("clinic_id"),
  notes: text("notes"),
  // ── Sprint "créditos com validade" ──────────────────────────────────────
  validUntil: date("valid_until"),
  monthRef: date("month_ref"),
  origin: text("origin").notNull().default("legacy"),
  status: text("status").notNull().default("disponivel"),
  consumedByAppointmentId: integer("consumed_by_appointment_id"),
  expiredAt: timestamp("expired_at"),
  // Sprint 2 — vínculo com fatura mensal materializada que paga este crédito.
  // Quando a fatura é paga (modo prepago), o trigger promove esta linha de
  // `pendentePagamento` → `disponivel`. Em modo postpago não é usado.
  financialRecordId: integer("financial_record_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_session_credits_patient_id").on(table.patientId),
  index("idx_session_credits_clinic_id").on(table.clinicId),
  index("idx_session_credits_fifo")
    .on(table.patientId, table.procedureId, table.status, table.validUntil),
]);

export const insertSessionCreditSchema = createInsertSchema(sessionCreditsTable).omit({ id: true, createdAt: true });
export type InsertSessionCredit = z.infer<typeof insertSessionCreditSchema>;
export type SessionCredit = typeof sessionCreditsTable.$inferSelect;
