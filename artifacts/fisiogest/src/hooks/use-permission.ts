import { useAuth } from "./use-auth";
import type { Permission } from "@/utils/permissions";
import type { Feature } from "@/utils/plan-features";

/**
 * Wrapper conveniente sobre `useAuth().hasPermission` / `hasFeature`.
 * Use em componentes que só precisam checar permissão/feature, sem o resto
 * do contexto de auth.
 */
export function usePermission(permission: Permission): boolean {
  const { hasPermission } = useAuth();
  return hasPermission(permission);
}

export function useFeature(feature: Feature): boolean {
  const { hasFeature } = useAuth();
  return hasFeature(feature);
}
