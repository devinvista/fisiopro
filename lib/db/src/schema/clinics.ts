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
  // ── Sprint 5 — Política de cancelamento ──────────────────────────────────
  // Janela mínima de antecedência (em horas) para cancelar/remarcar sem
  // ônus. Cancelamentos dentro da janela seguem `lateCancellationPolicy`.
  cancellationWindowHours: integer("cancellation_window_hours").notNull().default(24),
  // Política aplicada quando o cancelamento ocorre dentro da janela:
  //   - "creditoNormal": gera crédito de reposição como hoje (default).
  //   - "semCredito"   : não gera crédito (paciente perde a sessão).
  //   - "taxa"         : cobra taxa de no-show configurada na clínica.
  lateCancellationPolicy: text("late_cancellation_policy").notNull().default("creditoNormal"),
  // ── Sprint 15 (F3) — Feature flag do novo fluxo de aceite (v2) ───────────
  // `false` (default): wizard legado de 3 etapas (itens/aceite/cobrança).
  // `true`           : wizard v2 de 4 etapas (itens/cobrança/agenda/contrato)
  //                    + aceite atômico via `POST /accept-and-materialize`.
  // Coexistência durante rollout — ver migration 0017.
  // Sprint 15 (F6) — default TRUE: clínicas novas nascem no fluxo v2 (aceite
  // atômico com calendário). Clínicas existentes pré-F6 mantêm o valor que
  // já tinham (a migration 0018 trocou só o DEFAULT, não tocou linhas).
  useV2AcceptanceFlow: boolean("use_v2_acceptance_flow").notNull().default(true),
});

export const insertClinicSchema = createInsertSchema(clinicsTable).omit({ id: true, createdAt: true });
export type InsertClinic = z.infer<typeof insertClinicSchema>;
export type Clinic = typeof clinicsTable.$inferSelect;
