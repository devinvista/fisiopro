import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/utils/auth-context";
import { useAuth } from "@/utils/use-auth";
import { ErrorBoundary } from "@/components/error-boundary";
import { useEffect } from "react";
import type { Permission } from "@/utils/permissions";
import { FeatureRoute } from "@/components/guards/feature-route";

import LandingPage from "./pages/landing";
import Login from "./pages/auth/login";
import Register from "./pages/auth/register";
import Dashboard from "./pages/dashboard";
import Agenda from "./pages/clinical/agenda";
import PatientsList from "./pages/clinical/patients/index";
import PatientDetail from "./pages/clinical/patients/[id]";
import Agendar from "./pages/clinical/agendar";
import Procedimentos from "./pages/catalog/procedimentos";
import Pacotes from "./pages/catalog/pacotes";
import Financial from "./pages/financial/index";
import Relatorios from "./pages/financial/relatorios";
import Clinicas from "./pages/saas/clinicas";
import SuperAdmin from "./pages/saas/superadmin";
import Configuracoes from "./pages/settings/configuracoes";
import NotFound from "./pages/not-found";

const originalFetch = window.fetch;
window.fetch = async (input, init) => {
  const token = localStorage.getItem("fisiogest_token");
  if (token) {
    init = init || {};
    if (init.headers instanceof Headers) {
      if (!init.headers.has("authorization")) {
        init.headers.set("Authorization", `Bearer ${token}`);
      }
    } else {
      init.headers = { Authorization: `Bearer ${token}`, ...init.headers };
    }
  }
  const response = await originalFetch(input, init);
  if (response.status === 401) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    const isAuthRoute = url.includes("/api/auth/login") || url.includes("/api/auth/register");
    if (!isAuthRoute && localStorage.getItem("fisiogest_token")) {
      localStorage.removeItem("fisiogest_token");
      localStorage.removeItem("fisiogest_clinic_id");
      localStorage.removeItem("fisiogest_clinics");
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      window.location.href = `${base}/login`;
    }
  }
  return response;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function HashRedirect({ hash }: { hash: string }) {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation(`/configuracoes`);
    window.location.hash = hash;
  }, [hash, setLocation]);
  return null;
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { token, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !token) {
      setLocation("/login");
    }
  }, [token, isLoading, setLocation]);

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center">Carregando...</div>;
  if (!token) return null;

  return <Component />;
}

function PermissionRoute({
  component: Component,
  permission,
}: {
  component: React.ComponentType;
  permission: Permission;
}) {
  const { token, isLoading, hasPermission } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !token) {
      setLocation("/login");
    }
  }, [token, isLoading, setLocation]);

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center">Carregando...</div>;
  if (!token) return null;

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

function SuperAdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { token, isLoading, isSuperAdmin } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !token) setLocation("/login");
    if (!isLoading && token && !isSuperAdmin) setLocation("/dashboard");
  }, [token, isLoading, isSuperAdmin, setLocation]);

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center">Carregando...</div>;
  if (!token || !isSuperAdmin) return null;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/dashboard">
        {() => <ProtectedRoute component={Dashboard} />}
      </Route>
      <Route path="/agenda">
        {() => <PermissionRoute component={Agenda} permission="appointments.read" />}
      </Route>
      <Route path="/pacientes/:id">
        {() => <PermissionRoute component={PatientDetail} permission="patients.read" />}
      </Route>
      <Route path="/pacientes">
        {() => <PermissionRoute component={PatientsList} permission="patients.read" />}
      </Route>
      <Route path="/procedimentos">
        {() => <PermissionRoute component={Procedimentos} permission="procedures.manage" />}
      </Route>
      <Route path="/pacotes">
        {() => <FeatureRoute component={Pacotes} feature="module.patient_packages" />}
      </Route>
      <Route path="/financeiro">
        {() => <PermissionRoute component={Financial} permission="financial.read" />}
      </Route>
      <Route path="/relatorios">
        {() => <PermissionRoute component={Relatorios} permission="reports.read" />}
      </Route>
      <Route path="/usuarios">
        {() => <HashRedirect hash="usuarios" />}
      </Route>
      <Route path="/configuracoes">
        {() => <ProtectedRoute component={Configuracoes} />}
      </Route>
      <Route path="/agendas">
        {() => <HashRedirect hash="agendas" />}
      </Route>
      <Route path="/clinicas">
        {() => <FeatureRoute component={Clinicas} feature="module.multi_clinic" />}
      </Route>
      <Route path="/superadmin">
        {() => <SuperAdminRoute component={SuperAdmin} />}
      </Route>
      <Route path="/agendar" component={Agendar} />
      <Route path="/agendar/:token" component={Agendar} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <TooltipProvider>
              <ErrorBoundary>
                <Router />
              </ErrorBoundary>
              <Toaster />
            </TooltipProvider>
          </AuthProvider>
        </WouterRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
