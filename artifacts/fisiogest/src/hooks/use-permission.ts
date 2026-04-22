import { useAuth } from "./use-auth";

/**
 * Wrapper conveniente sobre `useAuth().hasPermission` / `hasFeature`.
 * Use em componentes que só precisam checar permissão/feature, sem o resto
 * do contexto de auth.
 */
export function usePermission(permission: string): boolean {
  const { hasPermission } = useAuth();
  return hasPermission(permission);
}

export function useFeature(feature: string): boolean {
  const { hasFeature } = useAuth();
  return hasFeature(feature);
}
