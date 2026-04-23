import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/utils/auth-context";
import { ErrorBoundary } from "@/components/error-boundary";
import { useEffect } from "react";
import { FeatureRoute } from "@/components/guards/feature-route";
import { ProtectedRoute } from "@/components/guards/protected-route";
import { PermissionRoute } from "@/components/guards/permission-route";
import { SuperAdminRoute } from "@/components/guards/superadmin-route";
import { queryClient } from "@/lib/query-client";
import { setUnauthorizedHandler } from "@workspace/api-client-react";
import { setUnauthorizedHandler as setApiUnauthorizedHandler } from "@/utils/api";

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

const AUTH_ROUTES = ["/api/auth/login", "/api/auth/register"];

function handleUnauthorized(url: string) {
  const isAuthRoute = AUTH_ROUTES.some((route) => url.includes(route));
  if (isAuthRoute || !localStorage.getItem("fisiogest_token")) return;

  localStorage.removeItem("fisiogest_token");
  localStorage.removeItem("fisiogest_clinic_id");
  localStorage.removeItem("fisiogest_clinics");

  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  window.location.href = `${base}/login`;
}

setUnauthorizedHandler(handleUnauthorized);
setApiUnauthorizedHandler(handleUnauthorized);

function HashRedirect({ hash }: { hash: string }) {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation(`/configuracoes`);
    window.location.hash = hash;
  }, [hash, setLocation]);
  return null;
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
