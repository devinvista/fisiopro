import { useQuery } from "@tanstack/react-query";
import { apiFetchJson } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import type { Clinic } from "@/pages/settings/configuracoes/types";

/**
 * Lê os dados/configurações da clínica vigente — `GET /api/clinics/current`.
 *
 * Cacheado por 5 minutos: as configurações mudam raramente (cancellation
 * policy, feature flags, etc.) e múltiplos componentes (wizards, headers,
 * relatórios) podem consumir sem custo extra de rede.
 *
 * Desabilitado para super-admin global (sem `clinicId` no contexto) e para
 * sessões não autenticadas.
 */
export function useClinicSettings() {
  const { isAuthenticated, isSuperAdmin } = useAuth();
  return useQuery<Clinic | null>({
    queryKey: ["clinic-settings", "current"],
    queryFn: () => apiFetchJson<Clinic>("/api/clinics/current"),
    enabled: isAuthenticated && !isSuperAdmin,
    staleTime: 5 * 60_000,
  });
}

/**
 * Sprint 15 (F3) — atalho booleano para a feature flag do novo wizard de
 * aceite. Retorna `false` enquanto carrega (preserva o comportamento legado
 * por padrão, evitando flash de UI v2 pra clínicas que não optaram).
 */
export function useV2AcceptanceFlow(): boolean {
  const { data } = useClinicSettings();
  return data?.useV2AcceptanceFlow === true;
}
