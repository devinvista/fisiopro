import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { clinicsTable } from "./clinics";

export const ROLES = ["admin", "profissional", "secretaria"] as const;
export type Role = (typeof ROLES)[number];

export const ALL_PERMISSIONS = [
  "patients.read",
  "patients.create",
  "patients.update",
  "patients.delete",
  "medical.read",
  "medical.write",
  "appointments.read",
  "appointments.create",
  "appointments.update",
  "appointments.delete",
  "financial.read",
  "financial.write",
  "reports.read",
  "procedures.manage",
  "users.manage",
  "settings.manage",
  "clinics.manage",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  secretaria: [
    "patients.read",
    "appointments.read",
    "appointments.create",
    "appointments.update",
  ],
  profissional: [
    "patients.read",
    "patients.create",
    "patients.update",
    "appointments.read",
    "appointments.create",
    "appointments.update",
    "medical.read",
    "medical.write",
    "financial.read",
    "reports.read",
    "procedures.manage",
  ],
  admin: [
    "patients.read",
    "patients.create",
    "patients.update",
    "patients.delete",
    "medical.read",
    "medical.write",
    "appointments.read",
    "appointments.create",
    "appointments.update",
    "appointments.delete",
    "financial.read",
    "financial.write",
    "reports.read",
    "procedures.manage",
    "users.manage",
    "settings.manage",
  ],
};

export const SUPER_ADMIN_PERMISSIONS: Permission[] = [
  ...ROLE_PERMISSIONS.admin,
  "clinics.manage",
];

export function resolvePermissions(roles: Role[], isSuperAdmin?: boolean): Set<Permission> {
  const perms = new Set<Permission>();
  if (isSuperAdmin) {
    for (const p of SUPER_ADMIN_PERMISSIONS) perms.add(p);
    return perms;
  }
  for (const role of roles) {
    const rolePerms = ROLE_PERMISSIONS[role] ?? [];
    for (const p of rolePerms) perms.add(p);
  }
  return perms;
}

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
