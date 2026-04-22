import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/utils/use-auth";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/utils/api";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Activity,
  Wallet,
  BarChart3,
  LogOut,
  Menu,
  Stethoscope,
  Building2,
  Settings2,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
  MoreHorizontal,
  ShieldCheck,
  AlertTriangle,
  XCircle,
  Clock,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ClinicSwitcher } from "@/components/layout/clinic-switcher";
import { ROLE_LABELS } from "@/utils/permissions";
import type { Permission, Role } from "@/utils/permissions";
import type { Feature } from "@/utils/plan-features";
import { PlanBadge } from "@/components/guards/plan-badge";
import { Lock } from "lucide-react";
import { differenceInDays, parseISO } from "date-fns";

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = BASE.replace(/\/$/, "").replace(/\/[^/]+$/, "");
const api = (path: string) => `${API_BASE}/api${path}`;

type SubInfo = {
  sub: { status: string; paymentStatus: string; trialEndDate: string | null; currentPeriodEnd: string | null };
  plan: { displayName: string } | null;
} | null;

function SubscriptionBanner({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [dismissed, setDismissed] = useState(false);

  const { data } = useQuery<SubInfo>({
    queryKey: ["subscription-mine-banner"],
    queryFn: async () => {
      const res = await apiFetch(api("/clinic-subscriptions/mine"));
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !isSuperAdmin,
    staleTime: 5 * 60 * 1000,
  });

  if (!data || isSuperAdmin || dismissed) return null;

  const { sub, plan } = data;

  if (sub.status === "suspended") {
    return (
      <div className="flex items-center gap-3 bg-red-600 text-white px-4 py-2.5 text-sm font-medium">
        <XCircle className="w-4 h-4 shrink-0" />
        <span className="flex-1">
          <strong>Assinatura suspensa.</strong> O acesso ao sistema foi bloqueado por inadimplência. Entre em contato com o suporte para regularizar.
        </span>
      </div>
    );
  }

  if (sub.status === "cancelled") {
    return (
      <div className="flex items-center gap-3 bg-red-600 text-white px-4 py-2.5 text-sm font-medium">
        <XCircle className="w-4 h-4 shrink-0" />
        <span className="flex-1">
          <strong>Assinatura cancelada.</strong> Entre em contato com o suporte para reativar o acesso.
        </span>
      </div>
    );
  }

  if (sub.paymentStatus === "overdue") {
    return (
      <div className="flex items-center gap-3 bg-orange-500 text-white px-4 py-2.5 text-sm">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span className="flex-1">
          <strong>Pagamento em atraso.</strong> Regularize sua assinatura {plan ? `(${plan.displayName})` : ""} para evitar a suspensão do acesso.
        </span>
        <button onClick={() => setDismissed(true)} className="ml-2 opacity-70 hover:opacity-100 transition-opacity">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  if (sub.status === "trial" && sub.trialEndDate) {
    try {
      const daysLeft = differenceInDays(parseISO(sub.trialEndDate), new Date());
      if (daysLeft < 0) {
        return (
          <div className="flex items-center gap-3 bg-amber-500 text-white px-4 py-2.5 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="flex-1">
              <strong>Período de trial encerrado.</strong> Contrate um plano para continuar usando o sistema.
            </span>
            <button onClick={() => setDismissed(true)} className="ml-2 opacity-70 hover:opacity-100 transition-opacity">
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      }
      if (daysLeft <= 7) {
        return (
          <div className="flex items-center gap-3 bg-amber-400 text-amber-950 px-4 py-2 text-sm">
            <Clock className="w-4 h-4 shrink-0" />
            <span className="flex-1">
              <strong>Trial encerra em {daysLeft === 0 ? "hoje" : `${daysLeft} dia${daysLeft !== 1 ? "s" : ""}`}.</strong> Contrate um plano para não perder o acesso.
            </span>
            <button onClick={() => setDismissed(true)} className="ml-2 opacity-60 hover:opacity-100 transition-opacity">
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      }
    } catch {
      return null;
    }
  }

  return null;
}

interface AppLayoutProps {
  children: ReactNode;
  title: string;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission: Permission | null;
  anyPermission?: Permission[];
  /** Feature do plano necessária. Item vira "trancado" (com badge) se o plano não inclui. */
  feature?: Feature;
  hideSuperAdmin?: boolean;
  superAdminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: null },
  { href: "/agenda", label: "Agenda", icon: CalendarDays, permission: "appointments.read" },
  { href: "/pacientes", label: "Pacientes", icon: Users, permission: "patients.read" },
  { href: "/procedimentos", label: "Procedimentos", icon: Activity, permission: "procedures.manage" },
  { href: "/pacotes", label: "Pacotes", icon: Package, permission: "procedures.manage", feature: "module.patient_packages" },
  { href: "/financeiro", label: "Financeiro", icon: Wallet, permission: "financial.read" },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3, permission: "reports.read" },
  {
    href: "/configuracoes",
    label: "Configurações",
    icon: Settings2,
    permission: null,
    anyPermission: ["settings.manage", "users.manage"],
  },
  { href: "/clinicas", label: "Clínicas", icon: Building2, permission: "clinics.manage", feature: "module.multi_clinic" },
  { href: "/superadmin", label: "SuperAdmin", icon: ShieldCheck, permission: null, superAdminOnly: true },
];

const SIDEBAR_STORAGE_KEY = "fisiogest-sidebar-collapsed";

const BOTTOM_NAV_PRIORITY: NavItem[] = [
  { href: "/dashboard",    label: "Início",     icon: LayoutDashboard, permission: null },
  { href: "/agenda",       label: "Agenda",     icon: CalendarDays,    permission: "appointments.read" },
  { href: "/pacientes",    label: "Pacientes",  icon: Users,           permission: "patients.read" },
  { href: "/financeiro",   label: "Financeiro", icon: Wallet,          permission: "financial.read" },
];

interface SidebarContentProps {
  user: { name?: string; roles?: string[] } | null;
  logout: () => void;
  hasPermission: (p: Permission) => boolean;
  hasFeature: (f: Feature) => boolean;
  clinics: unknown[];
  isSuperAdmin: boolean;
  location: string;
  collapsed: boolean;
  onToggle: () => void;
  isMobile?: boolean;
  onNavigate?: () => void;
}

function SidebarContent({
  user,
  logout,
  hasPermission,
  hasFeature,
  clinics,
  isSuperAdmin,
  location,
  collapsed,
  onToggle,
  isMobile = false,
  onNavigate,
}: SidebarContentProps) {
  // Itens que o usuário tem permissão de papel para ver. Itens sem feature do
  // plano permanecem visíveis mas marcados como "trancados" (upsell).
  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (item.superAdminOnly) return isSuperAdmin;
    if (item.hideSuperAdmin && isSuperAdmin) return false;
    const hasAccess = item.anyPermission
      ? item.anyPermission.some((p) => hasPermission(p))
      : item.permission === null || hasPermission(item.permission);
    return hasAccess;
  }).map((item) => ({
    ...item,
    locked: !!item.feature && !hasFeature(item.feature),
  }));

  const roleLabels = ((user as any)?.roles ?? [])
    .map((r: string) => ROLE_LABELS[r as Role] ?? r)
    .join(", ");

  const isCollapsed = collapsed && !isMobile;

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground relative">
        <div
          className={`flex h-16 shrink-0 items-center bg-black/10 transition-all duration-300 ${
            isCollapsed ? "justify-center px-3" : "gap-3 px-6"
          }`}
        >
          <div className="bg-primary/20 p-2 rounded-lg shrink-0">
            <Stethoscope className="h-6 w-6 text-primary-foreground" />
          </div>
          {!isCollapsed && (
            <span className="font-display font-bold text-xl tracking-tight whitespace-nowrap overflow-hidden">
              FisioGest <span className="text-primary-foreground/70">Pro</span>
            </span>
          )}
        </div>

        {!isCollapsed && (clinics.length > 1 || isSuperAdmin) && (
          <div className="px-4 pt-3 pb-1">
            <ClinicSwitcher />
          </div>
        )}

        {isCollapsed && (clinics.length > 1 || isSuperAdmin) && (
          <div className="px-2 pt-3 pb-1 flex justify-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="h-8 w-8 rounded-md bg-white/10 flex items-center justify-center text-sidebar-foreground/70 hover:bg-white/15 hover:text-white transition-colors">
                  <Building2 className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Trocar clínica</TooltipContent>
            </Tooltip>
          </div>
        )}

        <div className={`flex-1 overflow-auto py-6 ${isCollapsed ? "px-2" : "px-4"}`}>
          <nav className="space-y-1">
            {visibleNavItems.map((item) => {
              const isActive =
                location === item.href ||
                (item.href !== "/" && location.startsWith(item.href));

              if (isCollapsed) {
                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        className={`
                          relative flex items-center justify-center rounded-xl p-3 transition-all duration-200
                          ${
                            isActive
                              ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                              : item.locked
                                ? "text-sidebar-foreground/40 hover:bg-white/5"
                                : "text-sidebar-foreground/70 hover:bg-white/5 hover:text-white"
                          }
                        `}
                      >
                        <item.icon className="h-5 w-5" />
                        {item.locked && (
                          <Lock className="absolute -top-0.5 -right-0.5 h-3 w-3 text-amber-400" />
                        )}
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="font-medium">
                      {item.label}
                      {item.locked && item.feature && (
                        <span className="ml-2"><PlanBadge feature={item.feature} /></span>
                      )}
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={`
                    flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200
                    ${
                      isActive
                        ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                        : item.locked
                          ? "text-sidebar-foreground/40 hover:bg-white/5"
                          : "text-sidebar-foreground/70 hover:bg-white/5 hover:text-white"
                    }
                  `}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                  {item.locked && item.feature ? (
                    <span className="ml-auto flex items-center gap-1.5">
                      <PlanBadge feature={item.feature} />
                      <Lock className="h-3.5 w-3.5 text-amber-400/80" />
                    </span>
                  ) : (
                    isActive && <ChevronRight className="ml-auto h-4 w-4 opacity-60" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className={`bg-black/10 ${isCollapsed ? "p-2" : "p-4"}`}>
          {!isCollapsed && (
            <div className="flex items-center gap-3 mb-4 px-2">
              <div className="h-10 w-10 rounded-full bg-primary/30 flex items-center justify-center font-bold text-white border border-primary/50 shrink-0">
                {user?.name?.charAt(0).toUpperCase() || "U"}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-white truncate">{user?.name}</span>
                <span className="text-xs text-sidebar-foreground/60 truncate">{roleLabels}</span>
              </div>
            </div>
          )}

          {isCollapsed ? (
            <div className="flex flex-col items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="h-9 w-9 rounded-full bg-primary/30 flex items-center justify-center font-bold text-white border border-primary/50 cursor-default">
                    {user?.name?.charAt(0).toUpperCase() || "U"}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="font-medium">{user?.name}</p>
                  <p className="text-xs opacity-70">{roleLabels}</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-9 h-9 text-sidebar-foreground/70 hover:bg-white/5 hover:text-white"
                    onClick={logout}
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Sair do sistema</TooltipContent>
              </Tooltip>
            </div>
          ) : (
            <Button
              variant="ghost"
              className="w-full justify-start text-sidebar-foreground/70 hover:bg-white/5 hover:text-white"
              onClick={logout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sair do sistema
            </Button>
          )}
        </div>

        {!isMobile && (
          <button
            onClick={onToggle}
            className="absolute -right-3.5 top-[72px] z-30 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background shadow-md text-muted-foreground hover:text-foreground hover:shadow-lg transition-all duration-200 hover:scale-110"
            title={isCollapsed ? "Expandir menu" : "Recolher menu"}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="h-3.5 w-3.5" />
            ) : (
              <PanelLeftClose className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>
    </TooltipProvider>
  );
}

interface BottomNavProps {
  location: string;
  hasPermission: (p: Permission) => boolean;
  onOpenMenu: () => void;
}

function BottomNav({ location, hasPermission, onOpenMenu }: BottomNavProps) {
  const visibleItems = BOTTOM_NAV_PRIORITY.filter((item) =>
    item.permission === null || hasPermission(item.permission)
  );

  const isActive = (href: string) =>
    location === href || (href !== "/" && location.startsWith(href));

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 shadow-[0_-1px_12px_rgba(0,0,0,0.08)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="flex items-stretch h-16">
        {visibleItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors min-w-0
                ${active ? "text-primary" : "text-slate-400 hover:text-slate-600"}`}
            >
              <div className={`p-1.5 rounded-xl transition-all ${active ? "bg-primary/10" : ""}`}>
                <item.icon className={`h-5 w-5 ${active ? "stroke-[2.5]" : "stroke-[1.8]"}`} />
              </div>
              <span className={`text-[10px] font-medium leading-none ${active ? "text-primary" : ""}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
        {/* "Mais" button opens the full sidebar sheet */}
        <button
          onClick={onOpenMenu}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <div className="p-1.5 rounded-xl">
            <MoreHorizontal className="h-5 w-5 stroke-[1.8]" />
          </div>
          <span className="text-[10px] font-medium leading-none">Mais</span>
        </button>
      </div>
    </nav>
  );
}

export function AppLayout({ children, title }: AppLayoutProps) {
  const { user, logout, hasPermission, hasFeature, clinics, isSuperAdmin } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
  };

  const sidebarProps = {
    user,
    logout,
    hasPermission,
    hasFeature,
    clinics,
    isSuperAdmin,
    location,
    collapsed,
    onToggle: toggleSidebar,
  };

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      <aside
        className={`hidden lg:block shrink-0 border-r border-sidebar-border shadow-2xl z-20 transition-all duration-300 ease-in-out ${
          collapsed ? "w-[72px]" : "w-72"
        }`}
      >
        <SidebarContent {...sidebarProps} />
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden relative min-w-0">
        <SubscriptionBanner isSuperAdmin={isSuperAdmin} />
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-white/80 backdrop-blur-md px-4 md:px-6 shadow-sm z-10">
          <div className="flex items-center gap-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden shrink-0 h-11 w-11">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0 border-none">
                <SidebarContent
                  {...sidebarProps}
                  collapsed={false}
                  isMobile={true}
                  onNavigate={() => setMobileOpen(false)}
                />
              </SheetContent>
            </Sheet>

            <Button
              variant="ghost"
              size="icon"
              className="hidden lg:flex shrink-0 text-muted-foreground hover:text-foreground"
              onClick={toggleSidebar}
              title={collapsed ? "Expandir menu" : "Recolher menu"}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-5 w-5" />
              ) : (
                <PanelLeftClose className="h-5 w-5" />
              )}
            </Button>

            <h1 className="font-display text-xl md:text-2xl font-bold text-foreground truncate">{title}</h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground bg-secondary/50 px-4 py-2 rounded-full whitespace-nowrap">
              <CalendarDays className="h-4 w-4 shrink-0" />
              {new Date().toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                timeZone: "America/Sao_Paulo",
              })}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 relative">
          <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24 lg:pb-8">
            {children}
          </div>
        </main>
      </div>

      <BottomNav
        location={location}
        hasPermission={hasPermission}
        onOpenMenu={() => setMobileOpen(true)}
      />
    </div>
  );
}
