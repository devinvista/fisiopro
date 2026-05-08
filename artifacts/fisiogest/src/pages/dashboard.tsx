import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useGetDashboard,
  useUpdateAppointment,
  listAppointments,
  listPatients,
  getListAppointmentsQueryKey,
  getListPatientsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { STALE_TIMES } from "@/lib/query-client";
import { Button } from "@/components/ui/button";
import {
  Users, DollarSign, Calendar as CalendarIcon, TrendingUp, Clock,
  AlertCircle, Activity, UserX, Globe, Copy, Check, ExternalLink,
  Cake, Phone, Mail, ArrowUpRight, Target, Plus, CalendarPlus, Stethoscope,
  CheckCircle2, ClipboardList, RefreshCw, Loader2, ArrowRight, Sparkles,
  ChevronRight, Flame,
} from "lucide-react";
import { format, parseISO, differenceInYears } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link, useLocation } from "wouter";
import { PatientPipelineWidget } from "./dashboard/PatientPipelineWidget";
import { NotesWidget } from "./dashboard/NotesWidget";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Status config ─────────────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { dot: string; text: string; bg: string; label: string; color: string }> = {
  agendado:  { dot: "bg-blue-400",    text: "text-blue-700",   bg: "bg-blue-50",    label: "Agendado",   color: "#60a5fa" },
  confirmado:{ dot: "bg-emerald-500", text: "text-emerald-700",bg: "bg-emerald-50", label: "Confirmado", color: "#34d399" },
  compareceu:{ dot: "bg-teal-500",    text: "text-teal-700",   bg: "bg-teal-50",    label: "Compareceu", color: "#2dd4bf" },
  concluido: { dot: "bg-slate-400",   text: "text-slate-600",  bg: "bg-slate-100",  label: "Concluído",  color: "#94a3b8" },
  cancelado: { dot: "bg-red-400",     text: "text-red-700",    bg: "bg-red-50",     label: "Cancelado",  color: "#f87171" },
  faltou:    { dot: "bg-orange-400",  text: "text-orange-700", bg: "bg-orange-50",  label: "Faltou",     color: "#fb923c" },
  remarcado: { dot: "bg-purple-400",  text: "text-purple-700", bg: "bg-purple-50",  label: "Remarcado",  color: "#c084fc" },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CFG[status] ?? { dot: "bg-slate-300", text: "text-slate-500", bg: "bg-slate-50", label: status, color: "#94a3b8" };
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full", c.bg, c.text)}>
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", c.dot)} />
      {c.label}
    </span>
  );
}

// ─── Next action chip ───────────────────────────────────────────────────────────
type NextAction = {
  label: string; icon: React.ElementType; chipClass: string;
  kind: "inline" | "navigate"; toStatus?: string; href?: string;
};
function getNextAction(status: string, patientId: number): NextAction | null {
  switch (status) {
    case "agendado":   return { label: "Confirmar", icon: CheckCircle2, chipClass: "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200", kind: "inline", toStatus: "confirmado" };
    case "confirmado": return { label: "Check-in",  icon: CheckCircle2, chipClass: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200", kind: "inline", toStatus: "compareceu" };
    case "compareceu": return { label: "Evoluir",   icon: ClipboardList, chipClass: "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200", kind: "navigate", href: `/pacientes/${patientId}?tab=evolutions` };
    case "faltou":     return { label: "Remarcar",  icon: RefreshCw,    chipClass: "bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200", kind: "navigate", href: "/agenda" };
    case "cancelado":  return { label: "Remarcar",  icon: RefreshCw,    chipClass: "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200", kind: "navigate", href: "/agenda" };
    default: return null;
  }
}

function ActionChip({ appointmentId, status, patientId, onInlineUpdate, loadingId }: {
  appointmentId: number; status: string; patientId: number;
  onInlineUpdate: (id: number, toStatus: string) => void; loadingId: number | null;
}) {
  const [, navigate] = useLocation();
  const action = getNextAction(status, patientId);
  const isLoading = loadingId === appointmentId;
  return (
    <div className="flex flex-col items-end gap-1.5 shrink-0">
      <StatusBadge status={status} />
      {action && (
        <button
          onClick={() => {
            if (action.kind === "inline" && action.toStatus) onInlineUpdate(appointmentId, action.toStatus);
            else if (action.kind === "navigate" && action.href) navigate(action.href);
          }}
          disabled={isLoading}
          className={cn("inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full transition-all cursor-pointer disabled:opacity-50", action.chipClass)}
        >
          {isLoading ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <action.icon className="w-2.5 h-2.5" />}
          {action.label}
          {action.kind === "navigate" && <ChevronRight className="w-2.5 h-2.5" />}
        </button>
      )}
    </div>
  );
}

// ─── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, icon, color = "#6366f1", sub, loading }: {
  label: string; value: string; icon: React.ReactNode;
  color?: string; sub?: React.ReactNode; loading?: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${color}18`, color }}>
          {icon}
        </div>
      </div>
      {loading ? (
        <div className="space-y-1.5">
          <div className="h-7 w-24 bg-slate-100 animate-pulse rounded-lg" />
          <div className="h-3 w-16 bg-slate-100 animate-pulse rounded" />
        </div>
      ) : (
        <>
          <p className="text-2xl font-extrabold text-slate-900 tabular-nums leading-tight">{value}</p>
          {sub && <div className="mt-1.5">{sub}</div>}
        </>
      )}
    </div>
  );
}

// ─── Appointment row skeleton ───────────────────────────────────────────────────
function ApptSkeleton() {
  return (
    <div className="divide-y divide-slate-50">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="px-5 py-4 flex items-center gap-4 animate-pulse">
          <div className="w-11 h-11 bg-slate-100 rounded-xl shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-36 bg-slate-100 rounded-full" />
            <div className="h-2.5 w-24 bg-slate-100 rounded-full" />
          </div>
          <div className="h-6 w-20 bg-slate-100 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// ─── Section header ─────────────────────────────────────────────────────────────
function SectionHeader({
  icon, title, sub, count, iconBg = "bg-slate-100", iconColor = "text-slate-500",
}: {
  icon: React.ReactNode; title: string; sub?: string; count?: number;
  iconBg?: string; iconColor?: string;
}) {
  return (
    <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
      <div className={cn("p-2 rounded-xl shrink-0", iconBg, iconColor)}>{icon}</div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
      {count !== undefined && count > 0 && (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
          {count}
        </span>
      )}
    </div>
  );
}

// ─── Empty state for appointments ───────────────────────────────────────────────
function ApptEmpty({ icon, title, sub, href, cta }: { icon: React.ReactNode; title: string; sub: string; href?: string; cta?: string }) {
  return (
    <div className="py-12 flex flex-col items-center justify-center text-center px-6">
      <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mb-3 text-slate-300">
        {icon}
      </div>
      <p className="text-sm font-semibold text-slate-500">{title}</p>
      <p className="text-xs text-slate-400 mt-1">{sub}</p>
      {href && cta && (
        <Link href={href}>
          <Button size="sm" variant="outline" className="mt-4 h-8 rounded-xl text-xs gap-1.5">
            <CalendarPlus className="w-3.5 h-3.5" /> {cta}
          </Button>
        </Link>
      )}
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

// ─── Main Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { data, isLoading } = useGetDashboard();
  const [copied, setCopied] = useState(false);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const updateMutation = useUpdateAppointment();
  const queryClient = useQueryClient();

  useEffect(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    const apptParams = { startDate: today, endDate: today };
    const patientsParams = { limit: 50 };
    const runIdle = (cb: () => void) => {
      const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
      if (typeof w.requestIdleCallback === "function") w.requestIdleCallback(cb, { timeout: 2000 });
      else setTimeout(cb, 500);
    };
    runIdle(() => {
      void queryClient.prefetchQuery({ queryKey: getListAppointmentsQueryKey(apptParams), queryFn: ({ signal }) => listAppointments(apptParams, { signal }), staleTime: STALE_TIMES.short });
      void queryClient.prefetchQuery({ queryKey: getListPatientsQueryKey(patientsParams), queryFn: ({ signal }) => listPatients(patientsParams, { signal }), staleTime: STALE_TIMES.default });
    });
  }, [queryClient]);

  const handleInlineUpdate = (id: number, toStatus: string) => {
    setLoadingId(id);
    updateMutation.mutate(
      { id, data: { status: toStatus as any } },
      {
        onSettled: () => setLoadingId(null),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] }),
      }
    );
  };

  const bookingUrl = `${window.location.origin}${BASE ? BASE + "/" : "/"}agendar`;
  const copyBookingUrl = async () => {
    await navigator.clipboard.writeText(bookingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fmt = (val: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
  const d = data as any;
  const occupationRate = data?.occupationRate || 0;
  const firstName = d?.user?.name?.split(" ")[0] ?? "";

  // Occupation bar color
  const occColor = occupationRate >= 80 ? "#10b981" : occupationRate >= 60 ? "#f59e0b" : "#ef4444";

  return (
    <AppLayout title="Dashboard">
      <div className="space-y-5">

        {/* ── HERO ─────────────────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-2xl shadow-md"
          style={{ background: "linear-gradient(135deg, #004d4d 0%, #007272 60%, #009999 100%)" }}>

          {/* Decorative blobs */}
          <div className="pointer-events-none absolute -right-16 -top-16 w-72 h-72 rounded-full opacity-10"
            style={{ background: "radial-gradient(circle, #00ffff 0%, transparent 65%)" }} />
          <div className="pointer-events-none absolute -left-10 -bottom-20 w-64 h-64 rounded-full opacity-10"
            style={{ background: "radial-gradient(circle, #00e5ff 0%, transparent 65%)" }} />

          <div className="relative px-6 pt-6 pb-5">
            {/* Greeting + CTAs */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <p className="text-teal-300 text-xs font-semibold tracking-wide uppercase">
                  {format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </p>
                <h1 className="text-white text-2xl sm:text-3xl font-bold mt-1 font-display">
                  {getGreeting()}{firstName && `, ${firstName}`}!
                </h1>
                <p className="text-teal-300/80 text-sm mt-1">Aqui está o resumo da sua clínica hoje.</p>
              </div>

              <div className="flex gap-2 shrink-0">
                <Link href="/agenda">
                  <Button className="bg-white text-teal-900 hover:bg-teal-50 h-10 px-4 rounded-xl gap-2 text-sm font-bold shadow-sm">
                    <CalendarPlus className="w-4 h-4" />
                    <span className="hidden sm:inline">Novo Agendamento</span>
                    <span className="sm:hidden">Agendar</span>
                  </Button>
                </Link>
                <Link href="/pacientes">
                  <Button className="bg-white/10 border border-white/20 text-white hover:bg-white/20 h-10 px-4 rounded-xl gap-2 text-sm font-semibold">
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">Novo Paciente</span>
                    <span className="sm:hidden">Paciente</span>
                  </Button>
                </Link>
              </div>
            </div>

            {/* Quick stat pills */}
            <div className="flex flex-wrap gap-2.5 mt-5">
              {isLoading ? (
                [...Array(4)].map((_, i) => (
                  <div key={i} className="h-[52px] w-36 bg-white/10 animate-pulse rounded-xl" />
                ))
              ) : (
                [
                  { icon: <CalendarIcon className="w-4 h-4" />, value: String(data?.todayTotal || 0), label: "hoje" },
                  { icon: <Users className="w-4 h-4" />, value: String(data?.totalPatients || 0), label: "pacientes" },
                  { icon: <DollarSign className="w-4 h-4" />, value: fmt(data?.monthlyRevenue || 0), label: "receita do mês" },
                  { icon: <Target className="w-4 h-4" />, value: `${occupationRate.toFixed(0)}%`, label: "ocupação" },
                ].map((s, i) => (
                  <div key={i} className="flex items-center gap-3 bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl px-4 py-2.5">
                    <span className="text-teal-200 shrink-0">{s.icon}</span>
                    <div>
                      <p className="text-white font-extrabold text-sm leading-none tabular-nums">{s.value}</p>
                      <p className="text-teal-300 text-[10px] mt-0.5">{s.label}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── KPI STRIP ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard
            label="Receita do Mês"
            value={fmt(data?.monthlyRevenue || 0)}
            icon={<DollarSign className="w-4 h-4" />}
            color="#10b981"
            loading={isLoading}
            sub={
              <span className="flex items-center gap-1 text-xs text-emerald-600 font-semibold">
                <ArrowUpRight className="w-3.5 h-3.5" /> Meta do mês
              </span>
            }
          />
          <KpiCard
            label="Pacientes Ativos"
            value={String(data?.totalPatients || 0)}
            icon={<Users className="w-4 h-4" />}
            color="#6366f1"
            loading={isLoading}
            sub={<span className="text-xs text-slate-400">Com plano ativo</span>}
          />
          <KpiCard
            label="Taxa de Ocupação"
            value={`${occupationRate.toFixed(1)}%`}
            icon={<Target className="w-4 h-4" />}
            color={occColor}
            loading={isLoading}
            sub={
              !isLoading && (
                <div className="w-full bg-slate-100 rounded-full h-1.5">
                  <div className="h-1.5 rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(occupationRate, 100)}%`, backgroundColor: occColor }} />
                </div>
              )
            }
          />
          <KpiCard
            label="Taxa de Faltas"
            value={`${(d?.noShowRate || 0).toFixed(1)}%`}
            icon={<UserX className="w-4 h-4" />}
            color="#f59e0b"
            loading={isLoading}
            sub={
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <AlertCircle className="w-3 h-3 text-orange-400" />
                {d?.noShowCount || 0} falta{(d?.noShowCount || 0) !== 1 ? "s" : ""} no mês
              </span>
            }
          />
        </div>

        {/* ── APPOINTMENTS GRID ────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Today */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <SectionHeader
              icon={<Clock className="w-4 h-4" />}
              title="Agendamentos de Hoje"
              sub="Pacientes do dia e próximas ações"
              count={data?.todayAppointments?.length}
              iconBg="bg-sky-50"
              iconColor="text-sky-500"
            />
            {isLoading ? (
              <ApptSkeleton />
            ) : data?.todayAppointments && data.todayAppointments.length > 0 ? (
              <div className="divide-y divide-slate-50">
                {data.todayAppointments.map((apt) => {
                  const cfg = STATUS_CFG[apt.status] ?? STATUS_CFG.agendado;
                  return (
                    <div key={apt.id} className="px-5 py-3.5 flex items-center gap-4 hover:bg-slate-50/60 transition-colors">
                      {/* Time + status color block */}
                      <div
                        className="flex items-center justify-center rounded-xl w-12 h-12 shrink-0 font-extrabold text-sm"
                        style={{ background: cfg.color + "18", color: cfg.color }}
                      >
                        {apt.startTime}
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-semibold text-slate-800 truncate">{apt.patient?.name}</p>
                          {(apt as any).source === "online" && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full shrink-0">
                              <Globe className="w-2.5 h-2.5" /> Online
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 truncate mt-0.5 flex items-center gap-1">
                          <Stethoscope className="w-3 h-3 shrink-0" /> {apt.procedure?.name}
                        </p>
                      </div>
                      <ActionChip
                        appointmentId={apt.id}
                        status={apt.status}
                        patientId={(apt as any).patientId}
                        onInlineUpdate={handleInlineUpdate}
                        loadingId={loadingId}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <ApptEmpty
                icon={<CalendarIcon className="w-6 h-6" />}
                title="Nenhum agendamento hoje"
                sub="Sua agenda está livre"
                href="/agenda"
                cta="Criar agendamento"
              />
            )}
            {data?.todayAppointments && data.todayAppointments.length > 0 && (
              <div className="px-5 py-3 border-t border-slate-50">
                <Link href="/agenda">
                  <button className="flex items-center gap-1 text-xs text-slate-400 hover:text-primary transition-colors font-medium">
                    Ver agenda completa <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </Link>
              </div>
            )}
          </div>

          {/* Upcoming */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <SectionHeader
              icon={<Activity className="w-4 h-4" />}
              title="Próximos Agendamentos"
              sub="Visão geral dos próximos dias"
              count={data?.upcomingAppointments?.length}
              iconBg="bg-violet-50"
              iconColor="text-violet-500"
            />
            {isLoading ? (
              <ApptSkeleton />
            ) : data?.upcomingAppointments && data.upcomingAppointments.length > 0 ? (
              <div className="divide-y divide-slate-50">
                {data.upcomingAppointments.map((apt) => {
                  const cfg = STATUS_CFG[apt.status] ?? STATUS_CFG.agendado;
                  return (
                    <div key={apt.id} className="px-5 py-3.5 flex items-center gap-4 hover:bg-slate-50/60 transition-colors">
                      {/* Date block */}
                      <div className="flex flex-col items-center justify-center rounded-xl w-12 h-12 shrink-0 bg-violet-50">
                        <span className="text-[10px] font-bold text-violet-400 uppercase leading-tight">
                          {format(parseISO(apt.date), "EEE", { locale: ptBR })}
                        </span>
                        <span className="text-lg font-extrabold text-violet-700 leading-none">
                          {format(parseISO(apt.date), "dd")}
                        </span>
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-slate-500">{apt.startTime}</span>
                          {(apt as any).source === "online" && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full">
                              <Globe className="w-2.5 h-2.5" /> Online
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-slate-800 truncate">{apt.patient?.name}</p>
                        <p className="text-xs text-slate-400 truncate">{apt.procedure?.name}</p>
                      </div>
                      <ActionChip
                        appointmentId={apt.id}
                        status={apt.status}
                        patientId={(apt as any).patientId}
                        onInlineUpdate={handleInlineUpdate}
                        loadingId={loadingId}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <ApptEmpty
                icon={<TrendingUp className="w-6 h-6" />}
                title="Agenda livre"
                sub="Nenhum agendamento futuro"
              />
            )}
          </div>
        </div>

        {/* ── PATIENT PIPELINE ─────────────────────────────────────────────── */}
        <PatientPipelineWidget />

        {/* ── RECADOS & TAREFAS ────────────────────────────────────────────── */}
        <NotesWidget />

        {/* ── BOTTOM ROW ───────────────────────────────────────────────────── */}
        <div className={cn(
          "grid gap-4",
          data?.birthdayPatients && data.birthdayPatients.length > 0
            ? "grid-cols-1 lg:grid-cols-2"
            : "grid-cols-1"
        )}>

          {/* Booking portal */}
          <div className="flex items-center gap-4 rounded-2xl border border-teal-100 bg-gradient-to-r from-teal-50 to-teal-50/40 px-5 py-4 shadow-sm">
            <div className="p-3 bg-teal-100 rounded-xl shrink-0">
              <Globe className="w-5 h-5 text-teal-700" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-800">Portal de Agendamento Online</p>
              <p className="text-xs text-slate-400 truncate mt-0.5">{bookingUrl}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" variant="outline"
                className="h-8 rounded-xl text-xs gap-1.5 border-teal-200 text-teal-700 hover:bg-teal-50"
                onClick={copyBookingUrl}>
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copiado!" : "Copiar"}
              </Button>
              <a href={bookingUrl} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline"
                  className="h-8 rounded-xl text-xs gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50">
                  <ExternalLink className="w-3.5 h-3.5" /> Abrir
                </Button>
              </a>
            </div>
          </div>

          {/* Birthday widget */}
          {data?.birthdayPatients && data.birthdayPatients.length > 0 && (
            <div className="rounded-2xl border border-pink-100 bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-pink-50 flex items-center gap-3">
                <div className="p-2 bg-pink-50 rounded-xl shrink-0">
                  <Cake className="w-4 h-4 text-pink-500" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-slate-800">Aniversariantes de Hoje</h3>
                  <p className="text-xs text-slate-400">
                    {data.birthdayPatients.length === 1
                      ? "1 paciente faz aniversário hoje"
                      : `${data.birthdayPatients.length} pacientes fazem aniversário hoje`}
                  </p>
                </div>
                <Sparkles className="w-4 h-4 text-pink-300 shrink-0" />
              </div>
              <div className="divide-y divide-slate-50">
                {data.birthdayPatients.map((patient) => {
                  const age = patient.birthDate ? differenceInYears(new Date(), parseISO(patient.birthDate)) : null;
                  return (
                    <div key={patient.id} className="px-5 py-3 flex items-center justify-between hover:bg-pink-50/40 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm">
                          {patient.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-slate-800">{patient.name}</p>
                          {age !== null && <p className="text-xs text-slate-400">{age} anos hoje ✨</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {patient.phone && (
                          <a href={`https://wa.me/55${patient.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="outline" className="h-7 w-7 p-0 border-pink-200 text-pink-500 hover:bg-pink-50 rounded-lg">
                              <Phone className="w-3 h-3" />
                            </Button>
                          </a>
                        )}
                        {patient.email && (
                          <a href={`mailto:${patient.email}?subject=Feliz Aniversário!`}>
                            <Button size="sm" variant="outline" className="h-7 w-7 p-0 border-pink-200 text-pink-500 hover:bg-pink-50 rounded-lg">
                              <Mail className="w-3 h-3" />
                            </Button>
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

      </div>
    </AppLayout>
  );
}
