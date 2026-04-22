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

export function resolvePermissions(roles: string[], isSuperAdmin?: boolean): Set<Permission> {
  const perms = new Set<Permission>();
  if (isSuperAdmin) {
    for (const p of SUPER_ADMIN_PERMISSIONS) perms.add(p);
    return perms;
  }
  for (const role of roles) {
    const rolePerms = ROLE_PERMISSIONS[role as Role] ?? [];
    for (const p of rolePerms) perms.add(p);
  }
  return perms;
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrador",
  profissional: "Profissional",
  secretaria: "Secretaria",
};
