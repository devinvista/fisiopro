import { ReactNode } from "react";
import { useAuth } from "@/utils/use-auth";
import type { Feature } from "@/utils/plan-features";

interface FeatureGateProps {
  feature: Feature;
  children: ReactNode;
  /** Renderizado quando o plano atual não inclui a feature. */
  fallback?: ReactNode;
}

/**
 * Renderiza `children` somente se a clínica atual tem a feature liberada
 * pelo plano. Caso contrário, renderiza `fallback` (ou nada).
 *
 * Use para esconder/desabilitar elementos de UI (ex: itens de menu, botões).
 * Para bloquear rotas inteiras, use `<FeatureRoute>`.
 */
export function FeatureGate({ feature, children, fallback = null }: FeatureGateProps) {
  const { hasFeature } = useAuth();
  return <>{hasFeature(feature) ? children : fallback}</>;
}
