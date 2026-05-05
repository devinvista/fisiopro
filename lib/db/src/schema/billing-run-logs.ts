import { pgTable, serial, integer, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Registra cada execução do billing automático (scheduler) ou manual.
 * Usado para exibir na UI quando o sistema rodou pela última vez e o resultado.
 *
 * PR-FIN7-3 (B7): duas fases — inserido no início com status='running',
 * atualizado no fim com status='ok'|'failed'. Campo `runId` permite
 * correlacionar o log com os registros gerados na mesma execução.
 */
export const billingRunLogsTable = pgTable("billing_run_logs", {
  id: serial("id").primaryKey(),
  ranAt: timestamp("ran_at").defaultNow().notNull(),
  triggeredBy: text("triggered_by").notNull().default("scheduler"), // "scheduler" | "manual"
  clinicId: integer("clinic_id").notNull(),
  processed: integer("processed").notNull().default(0),
  generated: integer("generated").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  errors: integer("errors").notNull().default(0),
  dryRun: boolean("dry_run").notNull().default(false),
  /** UUID gerado no início da execução — correlaciona o log com os registros criados. */
  runId: text("run_id"),
  /** Estado da execução: 'running' ao iniciar; 'ok' ou 'failed' ao concluir. */
  status: text("status").notNull().default("ok"),
}, (table) => [
  index("idx_billing_run_logs_ran_at").on(table.ranAt),
  index("idx_billing_run_logs_clinic_id").on(table.clinicId),
]);

export const insertBillingRunLogSchema = createInsertSchema(billingRunLogsTable).omit({ id: true, ranAt: true });
export type InsertBillingRunLog = z.infer<typeof insertBillingRunLogSchema>;
export type BillingRunLog = typeof billingRunLogsTable.$inferSelect;
