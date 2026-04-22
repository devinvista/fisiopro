import { useParams, useLocation } from "wouter";
import { apiFetch } from "@/utils/api";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useGetPatient,
  useCreateAnamnesis,
  useListEvaluations,
  useCreateEvaluation,
  useUpdateEvaluation,
  useDeleteEvaluation,
  useListEvolutions,
  useCreateEvolution,
  useUpdateEvolution,
  useDeleteEvolution,
  useGetDischarge,
  useSaveDischarge,
  useUpdatePatient,
  useDeletePatient,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2, Phone, Mail, Calendar, Activity, ClipboardList, TrendingUp,
  FileText, DollarSign, History, Plus, ChevronDown, ChevronUp, User,
  MapPin, Stethoscope, Target, CheckCircle, Clock, XCircle, AlertCircle,
  LogOut, Pencil, Trash2, ShieldAlert, UserCheck, Lock, Paperclip, Upload,
  FileImage, File, Download, ScrollText, Printer, BadgeCheck, CalendarDays,
  ClipboardCheck, PenLine, Package, Layers, RefreshCw, Info,
  Milestone, RotateCcw, Filter,
  Check, ArrowUpRight, Zap, X,
  Wallet, TrendingDown, ArrowDownRight,
  Sparkles, Leaf, Droplets, Sun, Dumbbell, Scale, Ruler, FlaskConical,
  ShieldCheck, Link2, Camera,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { VoiceTextarea as Textarea } from "@/components/ui/voice-textarea";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { format, differenceInYears, differenceInDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DatePickerPTBR } from "@/components/ui/date-picker-ptbr";
import { useAuth } from "@/utils/use-auth";
import { PlanBadge } from "@/components/guards/plan-badge";
import { maskCpf, maskPhone, displayCpf } from "@/utils/masks";
import { PhotosTab } from "../../photos-tab";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

// ─── Print stack & shared formatters extraídos para _patient-detail/ ──────────
import type { PatientBasic, ClinicInfo, PkgOption, PlanProcedureItem } from "../types";
import {
  statusConfig,
  formatDate,
  formatDateTime,
  formatCurrency,
  fmtCur,
  todayBRTDate,
  InfoBlock,
} from "../utils/format";
import {
  ExportProntuarioButton,
  fetchClinicForPrint,
  printDocument,
  generateDischargeHTML,
  generateEvolutionsHTML,
  generatePlanHTML,
  generateContractHTML,
} from "../utils/print-html";

// ─── Extracted from patients/[id].tsx ──────────────────────────────────────

interface JourneyStep {
  id: number;
  patientId: number;
  stepKey: string;
  stepOrder: number;
  status: JourneyStatus;
  autoStatus: JourneyStatus;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  notes: string | null;
  responsibleName: string | null;
  updatedByUserName: string | null;
  updatedAt: string;
}

type JourneyStatus = "pending" | "in_progress" | "completed" | "cancelled";

const STEP_NAMES: Record<string, string> = {
  cadastro:         "Cadastro",
  anamnese:         "Anamnese",
  avaliacao:        "Avaliação Física",
  plano_tratamento: "Plano de Tratamento",
  procedimentos:    "Procedimentos / Pacotes",
  agendamento:      "Agendamento",
  tratamento:       "Tratamento em andamento",
  alta:             "Alta Fisioterapêutica",
};

const STEP_TO_TAB: Record<string, string> = {
  anamnese:         "anamnesis",
  avaliacao:        "evaluations",
  plano_tratamento: "treatment",
  tratamento:       "evolutions",
  alta:             "discharge",
};

const STEP_TO_ROUTE: Record<string, string> = {
  procedimentos: "/pacotes",
  agendamento:   "/agenda",
};

const JOURNEY_META: Record<string, { icon: React.ReactNode; description: string; actionLabel: string }> = {
  cadastro:         { icon: <User className="w-4 h-4" />,          description: "Registro do paciente no sistema", actionLabel: "" },
  anamnese:         { icon: <ClipboardList className="w-4 h-4" />, description: "Coleta do histórico clínico e queixa principal", actionLabel: "Ir para Anamnese" },
  avaliacao:        { icon: <Activity className="w-4 h-4" />,      description: "Avaliação física e funcional do paciente", actionLabel: "Ir para Avaliações" },
  plano_tratamento: { icon: <Target className="w-4 h-4" />,        description: "Objetivos e técnicas de tratamento", actionLabel: "Ir para Plano" },
  procedimentos:    { icon: <Package className="w-4 h-4" />,       description: "Aquisição de pacotes de sessões", actionLabel: "Ir para Pacotes" },
  agendamento:      { icon: <CalendarDays className="w-4 h-4" />,  description: "Marcação do primeiro atendimento", actionLabel: "Ir para Agenda" },
  tratamento:       { icon: <TrendingUp className="w-4 h-4" />,    description: "Realização das sessões de fisioterapia", actionLabel: "Ir para Evoluções" },
  alta:             { icon: <BadgeCheck className="w-4 h-4" />,    description: "Alta fisioterapêutica formal (COFFITO)", actionLabel: "Ir para Alta" },
};

const CIRCLE_STYLE: Record<JourneyStatus, { ring: string; bg: string; text: string }> = {
  pending:     { ring: "border-slate-200",   bg: "bg-white",      text: "text-slate-400"  },
  in_progress: { ring: "border-amber-400",   bg: "bg-amber-50",   text: "text-amber-600"  },
  completed:   { ring: "border-emerald-400", bg: "bg-emerald-50", text: "text-emerald-600" },
  cancelled:   { ring: "border-red-300",     bg: "bg-red-50",     text: "text-red-500"    },
};

const CARD_STYLE: Record<JourneyStatus, { border: string; bg: string; badge: string }> = {
  pending:     { border: "border-slate-200",      bg: "bg-white",        badge: "bg-slate-100 text-slate-600"   },
  in_progress: { border: "border-amber-200",      bg: "bg-amber-50/60",  badge: "bg-amber-100 text-amber-700"   },
  completed:   { border: "border-emerald-200/70", bg: "bg-white",        badge: "bg-emerald-100 text-emerald-700" },
  cancelled:   { border: "border-red-200",        bg: "bg-red-50/40",    badge: "bg-red-100 text-red-600"       },
};

const CONNECTOR_COLOR: Record<JourneyStatus, string> = {
  completed:   "bg-emerald-300",
  in_progress: "bg-amber-300",
  pending:     "bg-slate-200",
  cancelled:   "bg-red-200",
};

export function JornadaTab({ patientId, onNavigateToTab }: { patientId: number; onNavigateToTab: (tab: string) => void }) {
  const token = () => localStorage.getItem("fisiogest_token");
  const { user, isSuperAdmin } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [editingStep, setEditingStep] = useState<JourneyStep | null>(null);
  const [cancelConfirmStep, setCancelConfirmStep] = useState<JourneyStep | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editResponsible, setEditResponsible] = useState("");
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const isAdmin = isSuperAdmin || ((user as any)?.roles ?? []).includes("admin");

  const { data: steps = [], isLoading } = useQuery<JourneyStep[]>({
    queryKey: [`/api/patients/${patientId}/journey`],
    queryFn: () =>
      fetch(`/api/patients/${patientId}/journey`, {
        headers: { Authorization: `Bearer ${token()}` },
      }).then((r) => r.ok ? r.json() : []),
    enabled: !!patientId,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const invalidateJourney = () =>
    queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/journey`] });

  const cancelMutation = useMutation({
    mutationFn: ({ stepId }: { stepId: number }) =>
      fetch(`/api/patients/${patientId}/journey/${stepId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      }).then(async (r) => {
        if (!r.ok) throw new Error("Erro ao cancelar");
        return r.json();
      }),
    onSuccess: () => {
      invalidateJourney();
      setCancelConfirmStep(null);
      toast({ title: "Etapa cancelada" });
    },
    onError: () => toast({ title: "Erro ao cancelar etapa", variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: ({ stepId, notes, responsibleName }: { stepId: number; notes: string; responsibleName: string }) =>
      fetch(`/api/patients/${patientId}/journey/${stepId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "edit", notes, responsibleName }),
      }).then(async (r) => {
        if (!r.ok) throw new Error("Erro ao salvar");
        return r.json();
      }),
    onSuccess: () => {
      invalidateJourney();
      setEditingStep(null);
      toast({ title: "Observações salvas" });
    },
    onError: () => toast({ title: "Erro ao salvar alterações", variant: "destructive" }),
  });

  const resetMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/patients/${patientId}/journey/reset`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      }).then(async (r) => {
        if (!r.ok) throw new Error("Erro ao reiniciar");
        return r.json();
      }),
    onSuccess: () => {
      invalidateJourney();
      setResetConfirmOpen(false);
      toast({ title: "Jornada reiniciada" });
    },
    onError: () => toast({ title: "Erro ao reiniciar jornada", variant: "destructive" }),
  });

  // ── Computed ──────────────────────────────────────────────────────────────
  const stats = {
    completed:   steps.filter(s => s.status === "completed").length,
    in_progress: steps.filter(s => s.status === "in_progress").length,
    pending:     steps.filter(s => s.status === "pending").length,
    cancelled:   steps.filter(s => s.status === "cancelled").length,
  };
  const activeCount = steps.filter(s => s.status !== "cancelled").length;
  const progressPct = activeCount > 0 ? Math.round((stats.completed / activeCount) * 100) : 0;

  const focusStep =
    steps.find(s => s.status === "in_progress") ||
    steps.find(s => {
      if (s.status !== "pending") return false;
      const prev = steps.find(p => p.stepOrder === s.stepOrder - 1);
      return !prev || prev.status !== "pending";
    });

  function formatDate(val: string | null | undefined) {
    if (!val) return null;
    try { return format(new Date(val), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }); } catch { return null; }
  }

  const toggleExpanded = (id: number) => setExpandedSteps(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const isExpanded = (step: JourneyStep) =>
    (step.status !== "completed" && step.status !== "cancelled") || expandedSteps.has(step.id);

  const handleShortcut = (step: JourneyStep) => {
    const tab = STEP_TO_TAB[step.stepKey];
    const route = STEP_TO_ROUTE[step.stepKey];
    if (tab) onNavigateToTab(tab);
    else if (route) setLocation(route);
  };

  const getStepDuration = (step: JourneyStep): string | null => {
    if (step.stepKey !== "tratamento") return null;
    if (step.status === "in_progress" && step.startedAt) {
      const d = differenceInDays(new Date(), new Date(step.startedAt));
      return d === 0 ? "Iniciado hoje" : d === 1 ? "1 dia em andamento" : `${d} dias em andamento`;
    }
    if (step.status === "completed" && step.startedAt && step.completedAt) {
      const d = differenceInDays(new Date(step.completedAt), new Date(step.startedAt));
      return d > 0 ? `Duração: ${d} dia${d !== 1 ? "s" : ""}` : null;
    }
    return null;
  };

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Milestone className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Jornada do Cliente</h3>
            <p className="text-sm text-slate-500">Acompanhe todas as etapas do atendimento clínico.</p>
          </div>
        </div>
        {isAdmin && (
          <Button
            variant="outline" size="sm"
            className="h-8 gap-1.5 text-xs text-slate-500 border-slate-200 shrink-0"
            onClick={() => setResetConfirmOpen(true)}
            disabled={resetMutation.isPending}
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reiniciar
          </Button>
        )}
      </div>

      {/* ── Stat pills (4 always visible) ── */}
      {steps.length > 0 && (
        <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
          <div className="grid grid-cols-4 gap-2">
            <div className={`flex flex-col items-center gap-0.5 rounded-lg px-2 py-2 border ${stats.completed > 0 ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-100"}`}>
              <span className={`text-lg font-bold leading-none ${stats.completed > 0 ? "text-emerald-600" : "text-slate-300"}`}>{stats.completed}</span>
              <span className={`text-[10px] font-medium text-center leading-tight ${stats.completed > 0 ? "text-emerald-600" : "text-slate-400"}`}>Concluída{stats.completed !== 1 ? "s" : ""}</span>
            </div>
            <div className={`flex flex-col items-center gap-0.5 rounded-lg px-2 py-2 border ${stats.in_progress > 0 ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-100"}`}>
              <span className={`text-lg font-bold leading-none ${stats.in_progress > 0 ? "text-amber-600" : "text-slate-300"}`}>{stats.in_progress}</span>
              <span className={`text-[10px] font-medium text-center leading-tight ${stats.in_progress > 0 ? "text-amber-600" : "text-slate-400"}`}>Em andamento</span>
            </div>
            <div className={`flex flex-col items-center gap-0.5 rounded-lg px-2 py-2 border ${stats.pending > 0 ? "bg-slate-100 border-slate-200" : "bg-slate-50 border-slate-100"}`}>
              <span className={`text-lg font-bold leading-none ${stats.pending > 0 ? "text-slate-600" : "text-slate-300"}`}>{stats.pending}</span>
              <span className={`text-[10px] font-medium text-center leading-tight ${stats.pending > 0 ? "text-slate-600" : "text-slate-400"}`}>Pendente{stats.pending !== 1 ? "s" : ""}</span>
            </div>
            <div className={`flex flex-col items-center gap-0.5 rounded-lg px-2 py-2 border ${stats.cancelled > 0 ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-100"}`}>
              <span className={`text-lg font-bold leading-none ${stats.cancelled > 0 ? "text-red-500" : "text-slate-300"}`}>{stats.cancelled}</span>
              <span className={`text-[10px] font-medium text-center leading-tight ${stats.cancelled > 0 ? "text-red-500" : "text-slate-400"}`}>Cancelada{stats.cancelled !== 1 ? "s" : ""}</span>
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-slate-400 font-medium">Progresso geral</span>
              <span className="font-bold text-primary">{progressPct}%</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-emerald-500 rounded-full transition-all duration-700"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── "Próxima ação" banner ── */}
      {!isLoading && focusStep && (
        <div className={`rounded-xl p-4 border flex items-center gap-3 ${
          focusStep.status === "in_progress" ? "bg-amber-50 border-amber-200" : "bg-primary/5 border-primary/20"
        }`}>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            focusStep.status === "in_progress" ? "bg-amber-100" : "bg-primary/10"
          }`}>
            <Zap className={`w-4 h-4 ${focusStep.status === "in_progress" ? "text-amber-600" : "text-primary"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-[11px] font-bold uppercase tracking-wide ${
              focusStep.status === "in_progress" ? "text-amber-600" : "text-primary"
            }`}>
              {focusStep.status === "in_progress" ? "Em andamento" : "Próxima etapa"}
            </p>
            <p className="text-sm font-semibold text-slate-800 truncate">
              {STEP_NAMES[focusStep.stepKey] || focusStep.stepKey}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {(STEP_TO_TAB[focusStep.stepKey] || STEP_TO_ROUTE[focusStep.stepKey]) && (
              <Button
                variant="outline" size="sm"
                className="h-7 text-xs gap-1 border-slate-200 text-slate-600 hover:border-slate-300"
                onClick={() => handleShortcut(focusStep)}
              >
                <ArrowUpRight className="w-3 h-3" />
                {JOURNEY_META[focusStep.stepKey]?.actionLabel || "Abrir"}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Timeline ── */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
        </div>
      ) : steps.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
          <Milestone className="w-8 h-8 mb-2 opacity-30" />
          <p className="text-sm font-medium">Nenhuma etapa encontrada</p>
        </div>
      ) : (
        <div>
          {steps.map((step, idx) => {
            const meta = JOURNEY_META[step.stepKey];
            const circle = CIRCLE_STYLE[step.status] || CIRCLE_STYLE.pending;
            const card = CARD_STYLE[step.status] || CARD_STYLE.pending;
            const isLast = idx === steps.length - 1;
            const expanded = isExpanded(step);
            const duration = getStepDuration(step);
            const hasLink = !!(STEP_TO_TAB[step.stepKey] || STEP_TO_ROUTE[step.stepKey]);
            const isCurrentFocus = focusStep?.id === step.id;
            const isCollapsible = step.status === "completed" || step.status === "cancelled";

            return (
              <div key={step.id} className="flex gap-3">
                {/* ── Number circle + connector ── */}
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className={`
                    relative z-10 w-9 h-9 rounded-full border-2 flex items-center justify-center
                    font-bold text-sm transition-all duration-200 shrink-0
                    ${circle.ring} ${circle.bg} ${circle.text}
                    ${isCurrentFocus && step.status === "in_progress"
                      ? "ring-2 ring-offset-2 ring-amber-400 shadow-md scale-105"
                      : isCurrentFocus
                      ? "ring-2 ring-offset-1 ring-primary/40 shadow-sm"
                      : ""
                    }
                  `}>
                    {step.status === "completed"
                      ? <Check className="w-4 h-4" />
                      : step.status === "cancelled"
                      ? <XCircle className="w-3.5 h-3.5" />
                      : <span className="text-xs font-bold leading-none">{step.stepOrder}</span>
                    }
                  </div>
                  {!isLast && (
                    <div className={`w-0.5 flex-1 min-h-[20px] mt-0.5 mb-0.5 rounded-full ${CONNECTOR_COLOR[step.status]}`} />
                  )}
                </div>

                {/* ── Card ── */}
                <div className={`
                  flex-1 mb-3 rounded-xl border overflow-hidden transition-all duration-200
                  ${card.border} ${card.bg}
                  ${isCurrentFocus && step.status === "in_progress"
                    ? "shadow-md ring-1 ring-amber-300/60 border-l-[3px] border-l-amber-400"
                    : isCurrentFocus
                    ? "shadow-sm ring-1 ring-primary/20"
                    : "shadow-sm"}
                `}>
                  {/* Card header — always visible */}
                  <button
                    type="button"
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 ${isCollapsible ? "cursor-pointer hover:bg-black/[0.02]" : "cursor-default"}`}
                    onClick={() => isCollapsible && toggleExpanded(step.id)}
                  >
                    <div className={`p-1.5 rounded-lg border ${card.border} shrink-0 bg-white/60`}>
                      {meta?.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-sm font-semibold ${step.status === "cancelled" ? "text-slate-400 line-through" : "text-slate-800"}`}>
                          {STEP_NAMES[step.stepKey] || step.stepKey}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${card.badge}`}>
                          {step.status === "pending"      ? "Pendente"
                          : step.status === "in_progress" ? "Em andamento"
                          : step.status === "completed"   ? "Concluído"
                          : "Cancelado"}
                        </span>
                        {duration && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600 border border-slate-200">
                            {duration}
                          </span>
                        )}
                        {step.autoStatus === "completed" && step.status === "completed" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-600 border border-emerald-100 inline-flex items-center gap-1">
                            <RefreshCw className="w-2.5 h-2.5" />auto
                          </span>
                        )}
                      </div>
                      {!expanded && (
                        <p className="text-xs text-slate-400 mt-0.5 truncate">
                          {step.completedAt  ? `Concluído ${formatDate(step.completedAt)}`
                          : step.cancelledAt ? `Cancelado ${formatDate(step.cancelledAt)}`
                          : meta?.description}
                        </p>
                      )}
                    </div>
                    {isCollapsible && (
                      <div className="shrink-0 text-slate-300">
                        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    )}
                  </button>

                  {/* ── Expanded body ── */}
                  {expanded && (
                    <div className="px-4 pb-4 space-y-3 border-t border-slate-100/80">
                      <p className="text-xs text-slate-500 pt-3">{meta?.description}</p>

                      {/* Dates / meta */}
                      <div className="space-y-1.5 text-xs text-slate-500">
                        {step.startedAt && (
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3 shrink-0" />
                            Iniciado em {formatDate(step.startedAt)}
                          </div>
                        )}
                        {step.completedAt && (
                          <div className="flex items-center gap-1.5">
                            <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
                            Concluído em {formatDate(step.completedAt)}
                          </div>
                        )}
                        {step.cancelledAt && (
                          <div className="flex items-center gap-1.5">
                            <XCircle className="w-3 h-3 text-red-400 shrink-0" />
                            Cancelado em {formatDate(step.cancelledAt)}
                          </div>
                        )}
                        {step.responsibleName && (
                          <div className="flex items-center gap-1.5">
                            <UserCheck className="w-3 h-3 shrink-0" />
                            Responsável: <strong className="text-slate-700 ml-0.5">{step.responsibleName}</strong>
                          </div>
                        )}
                        {step.updatedByUserName && (
                          <div className="flex items-center gap-1.5">
                            <Info className="w-3 h-3 shrink-0" />
                            Atualizado por <strong className="text-slate-700 mx-0.5">{step.updatedByUserName}</strong> em {formatDate(step.updatedAt)}
                          </div>
                        )}
                      </div>

                      {/* Notes */}
                      {step.notes && (
                        <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">
                          <span className="font-semibold text-slate-400 uppercase tracking-wide text-[10px]">Obs · </span>
                          {step.notes}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center justify-between gap-2 flex-wrap pt-0.5">
                        {hasLink ? (
                          <button
                            type="button"
                            onClick={() => handleShortcut(step)}
                            className="text-xs text-primary/70 hover:text-primary flex items-center gap-1 transition-colors font-medium"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                            {JOURNEY_META[step.stepKey]?.actionLabel || "Abrir"}
                          </button>
                        ) : <div />}
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="ghost" size="icon"
                            className="h-7 w-7 text-slate-400 hover:text-slate-600"
                            title="Editar observações"
                            onClick={() => { setEditingStep(step); setEditNotes(step.notes ?? ""); setEditResponsible(step.responsibleName ?? ""); }}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          {step.status !== "completed" && step.status !== "cancelled" && (
                            <Button
                              variant="ghost" size="icon"
                              className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                              title="Cancelar etapa"
                              disabled={cancelMutation.isPending}
                              onClick={() => setCancelConfirmStep(step)}
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Edit dialog ── */}
      <Dialog open={!!editingStep} onOpenChange={(open) => !open && setEditingStep(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar etapa</DialogTitle>
            <DialogDescription>{STEP_NAMES[editingStep?.stepKey ?? ""] || editingStep?.stepKey}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Profissional responsável</Label>
              <Input placeholder="Nome do responsável" value={editResponsible} onChange={(e) => setEditResponsible(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Observações</Label>
              <Textarea className="min-h-[100px] resize-none" placeholder="Adicione observações sobre esta etapa..." value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditingStep(null)}>Cancelar</Button>
            <Button
              disabled={editMutation.isPending}
              onClick={() => editingStep && editMutation.mutate({ stepId: editingStep.id, notes: editNotes, responsibleName: editResponsible })}
            >
              {editMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Cancel confirm ── */}
      <AlertDialog open={!!cancelConfirmStep} onOpenChange={(open) => !open && setCancelConfirmStep(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar etapa?</AlertDialogTitle>
            <AlertDialogDescription>
              A etapa <strong>{STEP_NAMES[cancelConfirmStep?.stepKey ?? ""] || cancelConfirmStep?.stepKey}</strong> será
              marcada como cancelada. Pode ser revertida pelo administrador via "Reiniciar".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Não cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => cancelConfirmStep && cancelMutation.mutate({ stepId: cancelConfirmStep.id })}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Sim, cancelar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Reset confirm ── */}
      <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reiniciar jornada?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as etapas serão redefinidas para o status inicial com base nos registros clínicos existentes.
              Observações e responsáveis salvos manualmente serão perdidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
            >
              {resetMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Reiniciar jornada
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Audit Log Tab (dedicated full view) ────────────────────────────────────────


