import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/utils/use-auth";
import type { Feature } from "@/utils/plan-features";

interface FeatureRouteProps {
  component: React.ComponentType;
  feature: Feature;
}

/**
 * Guarda de rota baseada em plano. Exige que o usuário esteja autenticado E
 * que a clínica ativa tenha a feature liberada pelo plano. Caso contrário,
 * mostra uma tela de upgrade.
 */
export function FeatureRoute({ component: Component, feature }: FeatureRouteProps) {
  const { token, isLoading, hasFeature, planName } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !token) setLocation("/login");
  }, [token, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">Carregando...</div>
    );
  }
  if (!token) return null;

  if (!hasFeature(feature)) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-6xl">⭐</div>
        <h1 className="text-2xl font-bold text-foreground">Recurso indisponível no seu plano</h1>
        <p className="text-muted-foreground max-w-md">
          O recurso <code className="px-1 py-0.5 rounded bg-muted text-xs">{feature}</code> não está
          incluso no plano <strong>{planName ?? "atual"}</strong>. Faça upgrade para liberar.
        </p>
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => setLocation("/dashboard")}
            className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-accent transition-colors"
          >
            Voltar
          </button>
          <button
            onClick={() => setLocation("/configuracoes")}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Ver planos
          </button>
        </div>
      </div>
    );
  }

  return <Component />;
}
