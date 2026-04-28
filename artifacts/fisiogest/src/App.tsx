import { lazy, Suspense, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmRoot } from "@/lib/confirm";
import { AuthProvider } from "@/contexts/auth-context";
import { PlanLimitProvider } from "@/contexts/plan-limit-context";
import { ErrorBoundary } from "@/components/error-boundary";
import { FeatureRoute } from "@/components/guards/feature-route";
import { ProtectedRoute } from "@/components/guards/protected-route";
import { PermissionRoute } from "@/components/guards/permission-route";
import { SuperAdminRoute } from "@/components/guards/superadmin-route";
import { queryClient } from "@/lib/query-client";
import { setUnauthorizedHandler } from "@workspace/api-client-react";
import { setUnauthorizedHandler as setApiUnauthorizedHandler } from "@/lib/api";

const LandingPage = lazy(() => import("./pages/landing"));
const Login = lazy(() => import("./pages/auth/login"));
const Register = lazy(() => import("./pages/auth/register"));
const ForgotPassword = lazy(() => import("./pages/auth/forgot-password"));
const ResetPassword = lazy(() => import("./pages/auth/reset-password"));
const Dashboard = lazy(() => import("./pages/dashboard"));
const Agenda = lazy(() => import("./pages/clinical/agenda"));
const PatientsList = lazy(() => import("./pages/clinical/patients/index"));
const PatientDetail = lazy(() => import("./pages/clinical/patients/[id]"));
const Agendar = lazy(() => import("./pages/clinical/agendar"));
const Procedimentos = lazy(() => import("./pages/catalog/procedimentos"));
const Pacotes = lazy(() => import("./pages/catalog/pacotes"));
const Financial = lazy(() => import("./pages/financial/index"));
const Relatorios = lazy(() => import("./pages/financial/relatorios"));
const Clinicas = lazy(() => import("./pages/saas/clinicas"));
const SuperAdmin = lazy(() => import("./pages/saas/superadmin"));
const Configuracoes = lazy(() => import("./pages/settings/configuracoes"));
const NotFound = lazy(() => import("./pages/not-found"));
const PrivacyPolicyPage = lazy(() =>
  import("./pages/legal/policy-page").then((m) => ({ default: m.PrivacyPolicyPage })),
);
const TermsOfUsePage = lazy(() =>
  import("./pages/legal/policy-page").then((m) => ({ default: m.TermsOfUsePage })),
);

const AUTH_ROUTES = ["/api/auth/login", "/api/auth/register"];

function handleUnauthorized(url: string) {
  const isAuthRoute = AUTH_ROUTES.some((route) => url.includes(route));
  if (isAuthRoute || localStorage.getItem("fisiogest_authenticated") !== "1") return;

  localStorage.removeItem("fisiogest_authenticated");
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
    setLocation("/configuracoes", { replace: true });
    if (window.location.hash !== `#${hash}`) {
      const url = new URL(window.location.href);
      url.hash = hash;
      window.history.replaceState(window.history.state, "", url.toString());
    }
  }, [hash, setLocation]);
  return null;
}

function PageLoader() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center">
      <div className="border-primary h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={LandingPage} />
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route path="/recuperar-senha" component={ForgotPassword} />
        <Route path="/redefinir-senha" component={ResetPassword} />
        <Route path="/politica-de-privacidade" component={PrivacyPolicyPage} />
        <Route path="/termos-de-uso" component={TermsOfUsePage} />
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
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <PlanLimitProvider>
              <TooltipProvider>
                <ErrorBoundary>
                  <Router />
                </ErrorBoundary>
                <Toaster />
                <ConfirmRoot />
              </TooltipProvider>
            </PlanLimitProvider>
          </AuthProvider>
        </WouterRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
