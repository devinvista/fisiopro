/**
 * Re-exporta de @workspace/shared-constants para manter compatibilidade
 * com imports existentes de "@/utils/permissions".
 * Fonte da verdade: lib/shared-constants/src/roles.ts
 */
export {
  ROLES,
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
  SUPER_ADMIN_PERMISSIONS,
  ROLE_LABELS,
  resolvePermissions,
  type Role,
  type Permission,
} from "@workspace/shared-constants";
