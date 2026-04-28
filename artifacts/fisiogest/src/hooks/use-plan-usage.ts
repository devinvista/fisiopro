import { useQuery } from "@tanstack/react-query";
import { apiFetchJson } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

/**
 * Snapshot retornado por `GET /api/clinic-subscriptions/mine/limits`.
 * Limites em `null` significam "ilimitado" naquele recurso.
 */
export interface PlanUsageSnapshot {
  sub: {
    id: number;
    status: string;
    paymentStatus: string;
    trialEndDate: string | null;
    currentPeriodEnd: string | null;
  } | null;
  plan: {
    id: number;
    name: string;
    displayName: string;
    price: string;
    features: unknown;
  } | null;
  limits: {
    maxProfessionals: number | null;
    maxPatients: number | null;
    maxSchedules: number | null;
    maxUsers: number | null;
  } | null;
  usage: {
    patients: number;
    users: number;
    schedules: number;
    professionals: number;
  } | null;
}

/**
 * Lê uso x limites do plano da clínica vigente. Cacheado por 60s; sidebar e
 * outras superfícies podem usar sem disparar request extra. Desabilitado para
 * super-admin global (sem clínica) e para usuários sem subscription.
 */
export function usePlanUsage() {
  const { isAuthenticated, isSuperAdmin, subscription } = useAuth();
  return useQuery<PlanUsageSnapshot | null>({
    queryKey: ["plan-usage", "mine"],
    queryFn: () => apiFetchJson("/api/clinic-subscriptions/mine/limits"),
    enabled: isAuthenticated && !isSuperAdmin && subscription !== null,
    staleTime: 60_000,
  });
}
