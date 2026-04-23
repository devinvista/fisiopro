import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { clinicsTable } from "./clinics";

/**
 * Re-exporta constantes de @workspace/shared-constants para manter
 * compatibilidade com imports existentes de "@workspace/db".
 * Fonte da verdade: lib/shared-constants/src/roles.ts
 */
export {
  ROLES,
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
  SUPER_ADMIN_PERMISSIONS,
  ROLE_LABELS,
  resolvePermissions,
} from "@workspace/shared-constants";

export type {
  Role,
  Permission,
} from "@workspace/shared-constants";

// ─── Tabelas do banco de dados ───────────────────────────────────────────────

export const userRolesTable = pgTable("user_roles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  clinicId: integer("clinic_id").references(() => clinicsTable.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_user_roles_user_id").on(table.userId),
  index("idx_user_roles_clinic_id").on(table.clinicId),
]);

export const permissionsTable = pgTable("permissions", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
});

export const rolesPermissionsTable = pgTable("roles_permissions", {
  id: serial("id").primaryKey(),
  role: text("role").notNull(),
  permissionKey: text("permission_key")
    .notNull()
    .references(() => permissionsTable.key, { onDelete: "cascade" }),
});

export type UserRole = typeof userRolesTable.$inferSelect;
export type InsertUserRole = typeof userRolesTable.$inferInsert;
