import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

interface SuperAdminRouteProps {
  component: React.ComponentType;
}

export function SuperAdminRoute({ component: Component }: SuperAdminRouteProps) {
  const { token, isLoading, isSuperAdmin } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !token) setLocation("/login");
    if (!isLoading && token && !isSuperAdmin) setLocation("/dashboard");
  }, [token, isLoading, isSuperAdmin, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        Carregando...
      </div>
    );
  }
  if (!token || !isSuperAdmin) return null;

  return <Component />;
}
