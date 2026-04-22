import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { patientsTable } from "./patients";
import { usersTable } from "./users";

export const JOURNEY_STEP_DEFS = [
  { key: "cadastro",         order: 1, name: "Cadastro" },
  { key: "anamnese",         order: 2, name: "Anamnese" },
  { key: "avaliacao",        order: 3, name: "Avaliação" },
  { key: "plano_tratamento", order: 4, name: "Plano de Tratamento" },
  { key: "procedimentos",    order: 5, name: "Procedimentos / Pacotes" },
  { key: "agendamento",      order: 6, name: "Agendamento" },
  { key: "tratamento",       order: 7, name: "Tratamento em andamento" },
  { key: "alta",             order: 8, name: "Alta" },
] as const;

export type JourneyStepKey = (typeof JOURNEY_STEP_DEFS)[number]["key"];
export type JourneyStatus = "pending" | "in_progress" | "completed" | "cancelled";

export const patientJourneyStepsTable = pgTable("patient_journey_steps", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id")
    .notNull()
    .references(() => patientsTable.id, { onDelete: "cascade" }),
  clinicId: integer("clinic_id"),
  stepKey: text("step_key").notNull(),
  stepOrder: integer("step_order").notNull(),
  status: text("status").notNull().default("pending"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  cancelledAt: timestamp("cancelled_at"),
  notes: text("notes"),
  responsibleName: text("responsible_name"),
  updatedByUserId: integer("updated_by_user_id").references(() => usersTable.id),
  updatedByUserName: text("updated_by_user_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type PatientJourneyStep = typeof patientJourneyStepsTable.$inferSelect;
