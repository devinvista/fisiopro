import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";
import { usersTable } from "./users";
import { patientsTable } from "./patients";

export const notesTable = pgTable("notes", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id").notNull().references(() => clinicsTable.id),
  createdBy: integer("created_by").notNull().references(() => usersTable.id),
  assignedTo: integer("assigned_to").references(() => usersTable.id),
  patientId: integer("patient_id").references(() => patientsTable.id),
  type: text("type").notNull().default("tarefa"),
  title: text("title").notNull(),
  body: text("body"),
  priority: text("priority").notNull().default("normal"),
  status: text("status").notNull().default("pendente"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  seenAt: timestamp("seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_notes_clinic_id").on(table.clinicId),
  index("idx_notes_assigned_to").on(table.assignedTo),
  index("idx_notes_created_by").on(table.createdBy),
  index("idx_notes_status").on(table.status),
  index("idx_notes_due_at").on(table.dueAt),
]);

export type Note = typeof notesTable.$inferSelect;
