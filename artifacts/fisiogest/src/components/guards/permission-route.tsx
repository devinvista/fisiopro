import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import type { Permission } from "@/utils/permissions";

interface PermissionRouteProps {
  component: React.ComponentType;
  permission: Permission;
}

export function PermissionRoute({ component: Component, permission }: PermissionRouteProps) {
  const { isAuthenticated, isLoading, hasPermission } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [isAuthenticated, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        Carregando...
      </div>
    );
  }
  if (!isAuthenticated) return null;

  if (!hasPermission(permission)) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <div className="text-6xl">🔒</div>
        <h1 className="text-2xl font-bold text-foreground">Acesso Negado</h1>
        <p className="text-muted-foreground">Você não tem permissão para acessar esta página.</p>
        <button
          onClick={() => setLocation("/dashboard")}
          className="mt-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Voltar ao Dashboard
        </button>
      </div>
    );
  }

  return <Component />;
}
