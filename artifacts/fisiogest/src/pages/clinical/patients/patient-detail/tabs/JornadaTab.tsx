import { useLocation } from "wouter";
import { apiFetchJson, apiSendJson } from "@/lib/api";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2, Calendar, Activity, ClipboardList,
  FileText, Plus, ChevronDown, ChevronUp, User,
  Stethoscope, Target, CheckCircle, Clock, XCircle,
  LogOut, Pencil, Trash2, BadgeCheck, CalendarDays,
  Package, RefreshCw,
  Milestone, RotateCcw,
  Check, ArrowUpRight, Zap, X,
  TrendingUp, AlertTriangle, Sparkles, ShieldCheck,
  ClipboardCheck, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { VoiceTextarea as Textarea } from "@/components/ui/voice-textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useToast } from "@/lib/toast";
import { format, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/hooks/use-auth";

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

interface TreatmentPlanProgress {
  planId: number;
  estimatedSessions: number;
  completedSessions: number;
  pct: number;
  isNearingCompletion: boolean;
  planStatus: string;
  startDate: string | null;
}

interface JourneyMeta {
  firstConsultationCompleted: boolean;
  hasDischarge: boolean;
  treatmentPlanProgress: TreatmentPlanProgress | null;
}

interface JourneyResponse {
  steps: JourneyStep[];
  meta: JourneyMeta;
}

type JourneyStatus = "pending" | "in_progress" | "completed" | "cancelled";

const STEP_NAMES: Record<string, string> = {
  cadastro:         "Cadastro do Paciente",
  anamnese:         "Anamnese Clínica",
  avaliacao:        "Avaliação Física",
  plano_tratamento: "Plano de Tratamento",
  procedimentos:    "Procedimentos / Pacotes",
  aceite_plano:     "Aceite do Plano",
  geracao_agenda:   "Geração da Agenda",
  tratamento:       "Tratamento em Andamento",
  alta:             "Alta Fisioterapêutica",
};

const STEP_DESC: Record<string, string> = {
  cadastro:         "Dados pessoais, contato e histórico do paciente registrados",
  anamnese:         "Histórico clínico, queixa principal e escala de dor coletados",
  avaliacao:        "Avaliação física, funcional e postural realizada",
  plano_tratamento: "Objetivos, técnicas e frequência de tratamento definidos",
  procedimentos:    "Procedimentos, pacotes de sessões e preços configurados no plano",
  aceite_plano:     "Paciente assinou e aceitou formalmente o contrato e o plano de tratamento",
  geracao_agenda:   "Consultas geradas automaticamente conforme o plano aceito",
  tratamento:       "Sessões de fisioterapia em execução",
  alta:             "Alta fisioterapêutica formal emitida (COFFITO)",
};

const STEP_TO_TAB: Record<string, string> = {
  anamnese:         "anamnesis",
  avaliacao:        "evaluations",
  plano_tratamento: "treatment",
  procedimentos:    "treatment",
  aceite_plano:     "treatment",
  geracao_agenda:   "treatment",
  tratamento:       "evolutions",
  alta:             "discharge",
};

const STEP_TO_ROUTE: Record<string, string> = {};

const STEP_ICON: Record<string, React.ReactNode> = {
  cadastro:         <User className="w-4 h-4" />,
  anamnese:         <ClipboardList className="w-4 h-4" />,
  avaliacao:        <Activity className="w-4 h-4" />,
  plano_tratamento: <Target className="w-4 h-4" />,
  procedimentos:    <Package className="w-4 h-4" />,
  aceite_plano:     <FileText className="w-4 h-4" />,
  geracao_agenda:   <CalendarDays className="w-4 h-4" />,
  tratamento:       <TrendingUp className="w-4 h-4" />,
  alta:             <BadgeCheck className="w-4 h-4" />,
};

const STEP_CTA: Record<string, string> = {
  anamnese:         "Preencher Anamnese",
  avaliacao:        "Registrar Avaliação",
  plano_tratamento: "Criar Plano",
  procedimentos:    "Ver Procedimentos",
  aceite_plano:     "Aceitar Plano",
  geracao_agenda:   "Ver Plano",
  tratamento:       "Ver Evoluções",
  alta:             "Emitir Alta",
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

function fmtDate(val: string | null | undefined) {
  if (!val) return null;
  try { return format(new Date(val), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }); } catch { return null; }
}

// ── Onboarding Phase (Phase 1) ─────────────────────────────────────────────────
function OnboardingPhase({
  steps,
  focusStep,
  expandedSteps,
  toggleExpanded,
  isExpanded,
  handleShortcut,
  isAdmin,
  cancelMutation,
  editMutation,
  resetMutation,
  setCancelConfirmStep,
  setEditingStep,
  setEditNotes,
  setEditResponsible,
  setResetConfirmOpen,
  editingStep,
  editNotes,
  editResponsible,
  cancelConfirmStep,
  resetConfirmOpen,
}: {
  steps: JourneyStep[];
  focusStep: JourneyStep | undefined;
  expandedSteps: Set<number>;
  toggleExpanded: (id: number) => void;
  isExpanded: (step: JourneyStep) => boolean;
  handleShortcut: (step: JourneyStep) => void;
  isAdmin: boolean;
  cancelMutation: any;
  editMutation: any;
  resetMutation: any;
  setCancelConfirmStep: (s: JourneyStep | null) => void;
  setEditingStep: (s: JourneyStep | null) => void;
  setEditNotes: (v: string) => void;
  setEditResponsible: (v: string) => void;
  setResetConfirmOpen: (v: boolean) => void;
  editingStep: JourneyStep | null;
  editNotes: string;
  editResponsible: string;
  cancelConfirmStep: JourneyStep | null;
  resetConfirmOpen: boolean;
}) {
  const ONBOARDING_STEPS = ["cadastro", "anamnese", "avaliacao", "plano_tratamento", "procedimentos", "aceite_plano", "geracao_agenda"];
  const TREATMENT_STEPS = ["tratamento", "alta"];

  const onboardingSteps = steps.filter(s => ONBOARDING_STEPS.includes(s.stepKey));
  const treatmentSteps = steps.filter(s => TREATMENT_STEPS.includes(s.stepKey));

  const onboardingCompleted = onboardingSteps.filter(s => s.status === "completed").length;
  const onboardingActive = onboardingSteps.filter(s => s.status !== "cancelled").length;
  const pct = onboardingActive > 0 ? Math.round((onboardingCompleted / onboardingActive) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Progress summary */}
      <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Milestone className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-slate-700">Onboarding do Cliente</span>
          </div>
          <span className="text-sm font-bold text-primary">{pct}%</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
          <div
            className="h-full bg-gradient-to-r from-primary to-teal-500 rounded-full transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-slate-400">
          {onboardingCompleted} de {onboardingActive} etapas de captação concluídas · A jornada se encerra ao completar a primeira sessão
        </p>
      </div>

      {/* Next action banner */}
      {focusStep && (
        <div className={`rounded-xl p-4 border flex items-center gap-3 ${
          focusStep.status === "in_progress" ? "bg-amber-50 border-amber-200" : "bg-primary/5 border-primary/20"
        }`}>
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
            focusStep.status === "in_progress" ? "bg-amber-100" : "bg-primary/10"
          }`}>
            <Zap className={`w-4.5 h-4.5 ${focusStep.status === "in_progress" ? "text-amber-600" : "text-primary"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-[10px] font-bold uppercase tracking-wider ${
              focusStep.status === "in_progress" ? "text-amber-600" : "text-primary"
            }`}>
              {focusStep.status === "in_progress" ? "Em andamento agora" : "Próxima ação necessária"}
            </p>
            <p className="text-sm font-bold text-slate-800 truncate mt-0.5">
              {STEP_NAMES[focusStep.stepKey] || focusStep.stepKey}
            </p>
            <p className="text-xs text-slate-500 mt-0.5 truncate">{STEP_DESC[focusStep.stepKey]}</p>
          </div>
          {(STEP_TO_TAB[focusStep.stepKey] || STEP_TO_ROUTE[focusStep.stepKey]) && (
            <Button
              variant="default"
              size="sm"
              className="h-8 text-xs gap-1.5 shrink-0 shadow-sm"
              onClick={() => handleShortcut(focusStep)}
            >
              {STEP_CTA[focusStep.stepKey] || "Abrir"}
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      )}

      {/* Onboarding steps timeline */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3 px-1">
          Etapas de Captação
        </p>
        <StepTimeline
          steps={onboardingSteps}
          expandedSteps={expandedSteps}
          toggleExpanded={toggleExpanded}
          isExpanded={isExpanded}
          handleShortcut={handleShortcut}
          isAdmin={isAdmin}
          setCancelConfirmStep={setCancelConfirmStep}
          setEditingStep={setEditingStep}
          setEditNotes={setEditNotes}
          setEditResponsible={setEditResponsible}
          focusStep={focusStep}
        />
      </div>

      {/* Upcoming treatment steps (grayed) */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-300 mb-3 px-1">
          Etapas de Tratamento (após 1ª sessão)
        </p>
        <div className="space-y-2 opacity-50">
          {treatmentSteps.map((step) => (
            <div key={step.id} className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-dashed border-slate-200 bg-slate-50">
              <div className="w-7 h-7 rounded-full border-2 border-slate-200 bg-white flex items-center justify-center shrink-0">
                <div className="w-3.5 h-3.5 text-slate-300">{STEP_ICON[step.stepKey]}</div>
              </div>
              <span className="text-sm font-medium text-slate-400">{STEP_NAMES[step.stepKey]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Admin reset */}
      {isAdmin && (
        <div className="flex justify-end pt-1">
          <Button
            variant="ghost" size="sm"
            className="h-7 gap-1.5 text-xs text-slate-400 hover:text-red-500"
            onClick={() => setResetConfirmOpen(true)}
            disabled={resetMutation.isPending}
          >
            <RotateCcw className="w-3 h-3" /> Reiniciar jornada
          </Button>
        </div>
      )}

      <Dialogs
        editingStep={editingStep}
        editNotes={editNotes}
        editResponsible={editResponsible}
        setEditNotes={setEditNotes}
        setEditResponsible={setEditResponsible}
        setEditingStep={setEditingStep}
        editMutation={editMutation}
        cancelConfirmStep={cancelConfirmStep}
        setCancelConfirmStep={setCancelConfirmStep}
        cancelMutation={cancelMutation}
        resetConfirmOpen={resetConfirmOpen}
        setResetConfirmOpen={setResetConfirmOpen}
        resetMutation={resetMutation}
      />
    </div>
  );
}

// ── Treatment Phase (Phase 2) ──────────────────────────────────────────────────
function TreatmentPhase({
  steps,
  meta,
  handleShortcut,
}: {
  steps: JourneyStep[];
  meta: JourneyMeta;
  handleShortcut: (step: JourneyStep) => void;
}) {
  const plan = meta.treatmentPlanProgress;
  const tratamentoStep = steps.find(s => s.stepKey === "tratamento");
  const altaStep = steps.find(s => s.stepKey === "alta");

  return (
    <div className="space-y-4">
      {/* Treatment active card */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
          <CheckCircle className="w-5 h-5 text-emerald-600" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Onboarding concluído</p>
          <p className="text-sm font-semibold text-slate-800 mt-0.5">Paciente em tratamento ativo</p>
          <p className="text-xs text-slate-500 mt-0.5">Primeira sessão realizada com sucesso</p>
        </div>
        <div className="w-8 h-8 rounded-full bg-emerald-200 flex items-center justify-center shrink-0">
          <Check className="w-4 h-4 text-emerald-700" />
        </div>
      </div>

      {/* Session progress */}
      {plan ? (
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-semibold text-slate-700">Progresso do Plano</span>
            </div>
            <span className="text-sm font-bold text-slate-800">{plan.pct}%</span>
          </div>
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full transition-all duration-700"
              style={{ width: `${plan.pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{plan.completedSessions} sessões realizadas</span>
            <span>{plan.estimatedSessions} sessões no plano</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-50">
            <p className="text-xs text-slate-400">
              A jornada reativará automaticamente quando o plano estiver próximo da conclusão (≥ 80%)
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500">
            <Info className="w-4 h-4" />
            <p className="text-sm">Nenhum plano de tratamento ativo com estimativa de sessões cadastrado.</p>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-2">
        {tratamentoStep && (
          <button
            className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-100 bg-white hover:bg-slate-50 text-left transition-colors"
            onClick={() => handleShortcut(tratamentoStep)}
          >
            <div className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center shrink-0">
              <ClipboardCheck className="w-4 h-4 text-sky-500" />
            </div>
            <span className="text-xs font-semibold text-slate-700 leading-tight">Registrar Evolução</span>
          </button>
        )}
        {altaStep && altaStep.status !== "completed" && (
          <button
            className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-100 bg-white hover:bg-slate-50 text-left transition-colors opacity-50"
            disabled
          >
            <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
              <BadgeCheck className="w-4 h-4 text-slate-400" />
            </div>
            <span className="text-xs font-semibold text-slate-400 leading-tight">Alta disponível ao concluir plano</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Nearing Completion Phase (Phase 3) ────────────────────────────────────────
function NearingCompletionPhase({
  steps,
  meta,
  handleShortcut,
  isAdmin,
  cancelMutation,
  editMutation,
  resetMutation,
  setCancelConfirmStep,
  setEditingStep,
  setEditNotes,
  setEditResponsible,
  setResetConfirmOpen,
  expandedSteps,
  toggleExpanded,
  isExpanded,
  editingStep,
  editNotes,
  editResponsible,
  cancelConfirmStep,
  resetConfirmOpen,
}: {
  steps: JourneyStep[];
  meta: JourneyMeta;
  handleShortcut: (step: JourneyStep) => void;
  isAdmin: boolean;
  cancelMutation: any;
  editMutation: any;
  resetMutation: any;
  setCancelConfirmStep: (s: JourneyStep | null) => void;
  setEditingStep: (s: JourneyStep | null) => void;
  setEditNotes: (v: string) => void;
  setEditResponsible: (v: string) => void;
  setResetConfirmOpen: (v: boolean) => void;
  expandedSteps: Set<number>;
  toggleExpanded: (id: number) => void;
  isExpanded: (step: JourneyStep) => boolean;
  editingStep: JourneyStep | null;
  editNotes: string;
  editResponsible: string;
  cancelConfirmStep: JourneyStep | null;
  resetConfirmOpen: boolean;
}) {
  const plan = meta.treatmentPlanProgress;
  const completionSteps = steps.filter(s => ["tratamento", "alta"].includes(s.stepKey));
  const altaStep = steps.find(s => s.stepKey === "alta");

  const urgencyLevel = plan ? (plan.pct >= 100 ? "critical" : plan.pct >= 90 ? "high" : "medium") : "medium";

  return (
    <div className="space-y-4">
      {/* Alert banner */}
      <div className={`rounded-xl p-4 border flex items-start gap-3 ${
        urgencyLevel === "critical"
          ? "bg-red-50 border-red-200"
          : urgencyLevel === "high"
          ? "bg-orange-50 border-orange-200"
          : "bg-amber-50 border-amber-200"
      }`}>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
          urgencyLevel === "critical" ? "bg-red-100" : urgencyLevel === "high" ? "bg-orange-100" : "bg-amber-100"
        }`}>
          <AlertTriangle className={`w-4.5 h-4.5 ${
            urgencyLevel === "critical" ? "text-red-600" : urgencyLevel === "high" ? "text-orange-600" : "text-amber-600"
          }`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-[10px] font-bold uppercase tracking-wider ${
            urgencyLevel === "critical" ? "text-red-600" : urgencyLevel === "high" ? "text-orange-600" : "text-amber-600"
          }`}>
            {urgencyLevel === "critical" ? "Plano concluído — providenciar alta" : "Plano próximo da conclusão"}
          </p>
          <p className="text-sm font-bold text-slate-800 mt-0.5">
            {plan
              ? `${plan.completedSessions} de ${plan.estimatedSessions} sessões realizadas (${plan.pct}%)`
              : "Plano em fase final de tratamento"}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {meta.hasDischarge
              ? "Alta já emitida — plano concluído com sucesso."
              : "Considere emitir a alta fisioterapêutica ou renovar o plano de tratamento."}
          </p>
        </div>
      </div>

      {/* Session progress */}
      {plan && (
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-slate-700">Progresso do Plano</span>
            <span className={`text-sm font-bold ${
              urgencyLevel === "critical" ? "text-red-600" : urgencyLevel === "high" ? "text-orange-600" : "text-amber-600"
            }`}>{plan.pct}%</span>
          </div>
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                urgencyLevel === "critical" ? "bg-red-400" : urgencyLevel === "high" ? "bg-orange-400" : "bg-amber-400"
              }`}
              style={{ width: `${Math.min(plan.pct, 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{plan.completedSessions} sessões realizadas</span>
            <span>{plan.estimatedSessions} sessões no plano</span>
          </div>
        </div>
      )}

      {/* CTA buttons */}
      {!meta.hasDischarge && (
        <div className="grid grid-cols-2 gap-2">
          {altaStep && (
            <Button
              className={`h-10 gap-1.5 text-sm font-semibold rounded-xl ${
                urgencyLevel === "critical"
                  ? "bg-red-600 hover:bg-red-700"
                  : urgencyLevel === "high"
                  ? "bg-orange-600 hover:bg-orange-700"
                  : "bg-amber-600 hover:bg-amber-700"
              }`}
              onClick={() => handleShortcut(altaStep)}
            >
              <BadgeCheck className="w-4 h-4" />
              Emitir Alta
            </Button>
          )}
          <Button
            variant="outline"
            className="h-10 gap-1.5 text-sm font-semibold rounded-xl border-slate-200"
            onClick={() => handleShortcut(steps.find(s => s.stepKey === "plano_tratamento") ?? steps[0])}
          >
            <RefreshCw className="w-4 h-4" />
            Renovar Plano
          </Button>
        </div>
      )}

      {/* Completion steps timeline */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3 px-1">
          Etapas de Conclusão
        </p>
        <StepTimeline
          steps={completionSteps}
          expandedSteps={expandedSteps}
          toggleExpanded={toggleExpanded}
          isExpanded={isExpanded}
          handleShortcut={handleShortcut}
          isAdmin={isAdmin}
          setCancelConfirmStep={setCancelConfirmStep}
          setEditingStep={setEditingStep}
          setEditNotes={setEditNotes}
          setEditResponsible={setEditResponsible}
          focusStep={completionSteps.find(s => s.status !== "completed" && s.status !== "cancelled")}
        />
      </div>

      {/* Admin reset */}
      {isAdmin && (
        <div className="flex justify-end pt-1">
          <Button
            variant="ghost" size="sm"
            className="h-7 gap-1.5 text-xs text-slate-400 hover:text-red-500"
            onClick={() => setResetConfirmOpen(true)}
            disabled={resetMutation.isPending}
          >
            <RotateCcw className="w-3 h-3" /> Reiniciar jornada
          </Button>
        </div>
      )}

      <Dialogs
        editingStep={editingStep}
        editNotes={editNotes}
        editResponsible={editResponsible}
        setEditNotes={setEditNotes}
        setEditResponsible={setEditResponsible}
        setEditingStep={setEditingStep}
        editMutation={editMutation}
        cancelConfirmStep={cancelConfirmStep}
        setCancelConfirmStep={setCancelConfirmStep}
        cancelMutation={cancelMutation}
        resetConfirmOpen={resetConfirmOpen}
        setResetConfirmOpen={setResetConfirmOpen}
        resetMutation={resetMutation}
      />
    </div>
  );
}

// ── Shared: Step Timeline ──────────────────────────────────────────────────────
function StepTimeline({
  steps,
  expandedSteps,
  toggleExpanded,
  isExpanded,
  handleShortcut,
  isAdmin,
  setCancelConfirmStep,
  setEditingStep,
  setEditNotes,
  setEditResponsible,
  focusStep,
}: {
  steps: JourneyStep[];
  expandedSteps: Set<number>;
  toggleExpanded: (id: number) => void;
  isExpanded: (step: JourneyStep) => boolean;
  handleShortcut: (step: JourneyStep) => void;
  isAdmin: boolean;
  setCancelConfirmStep: (s: JourneyStep | null) => void;
  setEditingStep: (s: JourneyStep | null) => void;
  setEditNotes: (v: string) => void;
  setEditResponsible: (v: string) => void;
  focusStep: JourneyStep | undefined;
}) {
  return (
    <div>
      {steps.map((step, idx) => {
        const circle = CIRCLE_STYLE[step.status] || CIRCLE_STYLE.pending;
        const card = CARD_STYLE[step.status] || CARD_STYLE.pending;
        const isLast = idx === steps.length - 1;
        const expanded = isExpanded(step);
        const isCurrentFocus = focusStep?.id === step.id;
        const isCollapsible = step.status === "completed" || step.status === "cancelled";
        const hasLink = !!(STEP_TO_TAB[step.stepKey] || STEP_TO_ROUTE[step.stepKey]);

        const getDuration = () => {
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
          <div key={step.id} className="flex gap-3">
            <div className="flex flex-col items-center flex-shrink-0">
              <div className={`
                relative z-10 w-8 h-8 rounded-full border-2 flex items-center justify-center
                font-bold text-sm transition-all duration-200 shrink-0
                ${circle.ring} ${circle.bg} ${circle.text}
                ${isCurrentFocus && step.status === "in_progress"
                  ? "ring-2 ring-offset-2 ring-amber-400 shadow-md scale-105"
                  : isCurrentFocus
                  ? "ring-2 ring-offset-1 ring-primary/40 shadow-sm"
                  : ""}
              `}>
                {step.status === "completed"
                  ? <Check className="w-3.5 h-3.5" />
                  : step.status === "cancelled"
                  ? <XCircle className="w-3 h-3" />
                  : <span className="text-[11px] font-bold leading-none">{step.stepOrder}</span>
                }
              </div>
              {!isLast && (
                <div className={`w-0.5 flex-1 min-h-[18px] mt-0.5 mb-0.5 rounded-full ${CONNECTOR_COLOR[step.status]}`} />
              )}
            </div>

            <div className={`
              flex-1 mb-3 rounded-xl border overflow-hidden transition-all duration-200
              ${card.border} ${card.bg}
              ${isCurrentFocus && step.status === "in_progress"
                ? "shadow-md ring-1 ring-amber-300/60 border-l-[3px] border-l-amber-400"
                : isCurrentFocus
                ? "shadow-sm ring-1 ring-primary/20"
                : "shadow-sm"}
            `}>
              <button
                type="button"
                className={`w-full text-left px-3.5 py-3 flex items-center gap-3 ${isCollapsible ? "cursor-pointer hover:bg-black/[0.02]" : "cursor-default"}`}
                onClick={() => isCollapsible && toggleExpanded(step.id)}
              >
                <div className={`p-1.5 rounded-lg border ${card.border} shrink-0 bg-white/60`}>
                  <div className="w-3.5 h-3.5">{STEP_ICON[step.stepKey]}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-sm font-semibold leading-tight ${step.status === "cancelled" ? "text-slate-400 line-through" : "text-slate-800"}`}>
                      {STEP_NAMES[step.stepKey] || step.stepKey}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${card.badge}`}>
                      {step.status === "pending" ? "Pendente"
                        : step.status === "in_progress" ? "Em andamento"
                        : step.status === "completed" ? "Concluído"
                        : "Cancelado"}
                    </span>
                    {getDuration() && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600 border border-slate-200">
                        {getDuration()}
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
                      {step.completedAt ? `Concluído ${fmtDate(step.completedAt)}`
                        : step.cancelledAt ? `Cancelado ${fmtDate(step.cancelledAt)}`
                        : STEP_DESC[step.stepKey]}
                    </p>
                  )}
                </div>
                {isCollapsible && (
                  <div className="shrink-0 text-slate-300">
                    {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                )}
              </button>

              {expanded && (
                <div className="px-3.5 pb-3.5 space-y-3 border-t border-slate-100/80">
                  <p className="text-xs text-slate-500 pt-3">{STEP_DESC[step.stepKey]}</p>

                  <div className="space-y-1 text-xs text-slate-500">
                    {step.startedAt && (
                      <p className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-slate-300 shrink-0" />
                        Iniciado: {fmtDate(step.startedAt)}
                      </p>
                    )}
                    {step.completedAt && (
                      <p className="flex items-center gap-1.5">
                        <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                        Concluído: {fmtDate(step.completedAt)}
                      </p>
                    )}
                    {step.cancelledAt && (
                      <p className="flex items-center gap-1.5">
                        <X className="w-3 h-3 text-red-400 shrink-0" />
                        Cancelado: {fmtDate(step.cancelledAt)}
                      </p>
                    )}
                    {step.responsibleName && (
                      <p className="flex items-center gap-1.5">
                        <User className="w-3 h-3 text-slate-300 shrink-0" />
                        Responsável: {step.responsibleName}
                      </p>
                    )}
                    {step.updatedByUserName && (
                      <p className="flex items-center gap-1.5">
                        <Pencil className="w-3 h-3 text-slate-300 shrink-0" />
                        Atualizado por: {step.updatedByUserName}
                      </p>
                    )}
                  </div>

                  {step.notes && (
                    <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Observações</p>
                      <p className="text-xs text-slate-600 whitespace-pre-line">{step.notes}</p>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-0.5 flex-wrap">
                    {hasLink && step.status !== "cancelled" && (
                      <Button
                        variant="outline" size="sm"
                        className="h-7 text-xs gap-1 border-slate-200 text-slate-600 hover:border-primary/40 hover:text-primary"
                        onClick={() => handleShortcut(step)}
                      >
                        <ArrowUpRight className="w-3 h-3" />
                        {STEP_CTA[step.stepKey] || "Abrir"}
                      </Button>
                    )}
                    {isAdmin && step.status !== "cancelled" && (
                      <>
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 text-xs gap-1 text-slate-400 hover:text-slate-600"
                          onClick={() => { setEditingStep(step); setEditNotes(step.notes ?? ""); setEditResponsible(step.responsibleName ?? ""); }}
                        >
                          <Pencil className="w-3 h-3" /> Editar
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 text-xs gap-1 text-red-400 hover:text-red-600"
                          onClick={() => setCancelConfirmStep(step)}
                        >
                          <XCircle className="w-3 h-3" /> Cancelar
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Shared: Dialogs ────────────────────────────────────────────────────────────
function Dialogs({
  editingStep, editNotes, editResponsible, setEditNotes, setEditResponsible,
  setEditingStep, editMutation, cancelConfirmStep, setCancelConfirmStep,
  cancelMutation, resetConfirmOpen, setResetConfirmOpen, resetMutation,
}: {
  editingStep: JourneyStep | null;
  editNotes: string;
  editResponsible: string;
  setEditNotes: (v: string) => void;
  setEditResponsible: (v: string) => void;
  setEditingStep: (s: JourneyStep | null) => void;
  editMutation: any;
  cancelConfirmStep: JourneyStep | null;
  setCancelConfirmStep: (s: JourneyStep | null) => void;
  cancelMutation: any;
  resetConfirmOpen: boolean;
  setResetConfirmOpen: (v: boolean) => void;
  resetMutation: any;
}) {
  return (
    <>
      {/* Edit dialog */}
      {editingStep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-800">Editar etapa: {STEP_NAMES[editingStep.stepKey]}</h3>
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-semibold text-slate-600">Responsável</Label>
                <Input
                  value={editResponsible}
                  onChange={e => setEditResponsible(e.target.value)}
                  placeholder="Nome do profissional responsável"
                  className="mt-1 h-9 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600">Observações</Label>
                <Textarea
                  value={editNotes}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditNotes(e.target.value)}
                  placeholder="Observações sobre esta etapa..."
                  className="mt-1 text-sm min-h-[80px]"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setEditingStep(null)}>Cancelar</Button>
              <Button
                size="sm"
                disabled={editMutation.isPending}
                onClick={() => editMutation.mutate({ stepId: editingStep.id, notes: editNotes, responsibleName: editResponsible })}
              >
                {editMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Salvar"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel confirm */}
      <AlertDialog open={!!cancelConfirmStep} onOpenChange={() => setCancelConfirmStep(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar etapa?</AlertDialogTitle>
            <AlertDialogDescription>
              A etapa "{cancelConfirmStep ? STEP_NAMES[cancelConfirmStep.stepKey] : ""}" será marcada como cancelada.
              O status automático continuará sendo calculado normalmente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => cancelConfirmStep && cancelMutation.mutate({ stepId: cancelConfirmStep.id })}
            >
              {cancelMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset confirm */}
      <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reiniciar jornada?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as etapas serão recriadas com status inicial. O status automático (baseado no cadastro real do paciente)
              será recalculado imediatamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => resetMutation.mutate()}
            >
              {resetMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Reiniciar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────
export function JornadaTab({ patientId, onNavigateToTab }: { patientId: number; onNavigateToTab: (tab: string) => void }) {
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

  const { data: journeyData, isLoading } = useQuery<JourneyResponse>({
    queryKey: [`/api/patients/${patientId}/journey`],
    queryFn: () => apiFetchJson<JourneyResponse>(`/api/patients/${patientId}/journey`),
    enabled: !!patientId,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const steps = journeyData?.steps ?? [];
  const meta = journeyData?.meta ?? { firstConsultationCompleted: false, hasDischarge: false, treatmentPlanProgress: null };

  const invalidateJourney = () =>
    queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/journey`] });

  const cancelMutation = useMutation({
    mutationFn: ({ stepId }: { stepId: number }) =>
      apiSendJson(`/api/patients/${patientId}/journey/${stepId}`, "PATCH", { action: "cancel" }),
    onSuccess: () => { invalidateJourney(); setCancelConfirmStep(null); toast({ title: "Etapa cancelada" }); },
    onError: () => toast({ title: "Erro ao cancelar etapa", variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: ({ stepId, notes, responsibleName }: { stepId: number; notes: string; responsibleName: string }) =>
      apiSendJson(`/api/patients/${patientId}/journey/${stepId}`, "PATCH", { action: "edit", notes, responsibleName }),
    onSuccess: () => { invalidateJourney(); setEditingStep(null); toast({ title: "Observações salvas" }); },
    onError: () => toast({ title: "Erro ao salvar alterações", variant: "destructive" }),
  });

  const resetMutation = useMutation({
    mutationFn: () => apiSendJson(`/api/patients/${patientId}/journey/reset`, "POST"),
    onSuccess: () => { invalidateJourney(); setResetConfirmOpen(false); toast({ title: "Jornada reiniciada" }); },
    onError: () => toast({ title: "Erro ao reiniciar jornada", variant: "destructive" }),
  });

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

  const focusStep =
    steps.find(s => s.status === "in_progress") ||
    steps.find(s => {
      if (s.status !== "pending") return false;
      const prev = steps.find(p => p.stepOrder === s.stepOrder - 1);
      return !prev || prev.status !== "pending";
    });

  // ── Determine Phase ────────────────────────────────────────────────────────
  // Phase 1: No first consultation completed → onboarding
  // Phase 2: First consultation done, plan progress < 80% → treatment (at rest)
  // Phase 3: First consultation done, plan progress ≥ 80% OR discharged → nearing completion / alta
  const phase: 1 | 2 | 3 = !meta.firstConsultationCompleted
    ? 1
    : meta.hasDischarge || (meta.treatmentPlanProgress?.isNearingCompletion ?? false)
    ? 3
    : 2;

  const sharedProps = {
    steps,
    meta,
    handleShortcut,
    isAdmin,
    cancelMutation,
    editMutation,
    resetMutation,
    setCancelConfirmStep,
    setEditingStep,
    setEditNotes,
    setEditResponsible,
    setResetConfirmOpen,
    expandedSteps,
    toggleExpanded,
    isExpanded,
    editingStep,
    editNotes,
    editResponsible,
    cancelConfirmStep,
    resetConfirmOpen,
  };

  // Phase label/badge
  const PHASE_CONFIG = {
    1: { label: "Onboarding", color: "text-violet-700", bg: "bg-violet-100", icon: <Milestone className="w-3.5 h-3.5" /> },
    2: { label: "Em Tratamento", color: "text-emerald-700", bg: "bg-emerald-100", icon: <TrendingUp className="w-3.5 h-3.5" /> },
    3: { label: "Próximo da Alta", color: "text-amber-700", bg: "bg-amber-100", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  };
  const phaseCfg = PHASE_CONFIG[phase];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Milestone className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-slate-800">Jornada do Cliente</h3>
              {!isLoading && steps.length > 0 && (
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${phaseCfg.bg} ${phaseCfg.color}`}>
                  {phaseCfg.icon}
                  {phaseCfg.label}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500">
              {phase === 1 && "Guia de captação até a primeira sessão"}
              {phase === 2 && "Paciente em tratamento ativo — acompanhe o progresso"}
              {phase === 3 && "Plano próximo da conclusão — providenciar alta ou renovação"}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
        </div>
      ) : steps.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
          <Milestone className="w-8 h-8 mb-2 opacity-30" />
          <p className="text-sm font-medium">Nenhuma etapa encontrada</p>
        </div>
      ) : phase === 1 ? (
        <OnboardingPhase
          {...sharedProps}
          focusStep={focusStep}
        />
      ) : phase === 2 ? (
        <TreatmentPhase
          steps={steps}
          meta={meta}
          handleShortcut={handleShortcut}
        />
      ) : (
        <NearingCompletionPhase
          {...sharedProps}
        />
      )}
    </div>
  );
}
