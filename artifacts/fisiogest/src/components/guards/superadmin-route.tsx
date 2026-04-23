import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

interface SuperAdminRouteProps {
  component: React.ComponentType;
}

export function SuperAdminRoute({ component: Component }: SuperAdminRouteProps) {
  const { isAuthenticated, isLoading, isSuperAdmin } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) setLocation("/login");
    if (!isLoading && isAuthenticated && !isSuperAdmin) setLocation("/dashboard");
  }, [isAuthenticated, isLoading, isSuperAdmin, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        Carregando...
      </div>
    );
  }
  if (!isAuthenticated || !isSuperAdmin) return null;

  return <Component />;
}
