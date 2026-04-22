import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { patientsTable } from "./patients";

export const auditLogTable = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id),
  userName: text("user_name"),
  patientId: integer("patient_id").references(() => patientsTable.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id"),
  summary: text("summary"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogTable.$inferSelect;
