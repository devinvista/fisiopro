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

type AuditAction = "all" | "create" | "update" | "delete";

const ENTITY_LABELS: Record<string, { label: string; icon: string }> = {
  anamnesis:      { label: "Anamnese",              icon: "📋" },
  evaluation:     { label: "Avaliação Física",       icon: "🔍" },
  evolution:      { label: "Evolução de Sessão",     icon: "📈" },
  discharge:      { label: "Alta Fisioterapêutica",  icon: "✅" },
  treatment_plan: { label: "Plano de Tratamento",    icon: "🎯" },
  financial:      { label: "Financeiro",             icon: "💰" },
  attachment:     { label: "Exame / Anexo",          icon: "📎" },
  atestado:       { label: "Atestado",               icon: "📄" },
  patient:        { label: "Cadastro do Paciente",   icon: "👤" },
};

const ACTION_STYLES: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  create: { label: "Criado",   bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-400" },
  update: { label: "Editado",  bg: "bg-blue-50",    text: "text-blue-700",    dot: "bg-blue-400"    },
  delete: { label: "Excluído", bg: "bg-red-50",     text: "text-red-700",     dot: "bg-red-400"     },
};

function AuditLogSection({ patientId }: { patientId: number }) {
  const [open, setOpen] = useState(false);
  const token = () => localStorage.getItem("fisiogest_token");
  const { data: logs = [], isLoading } = useQuery<any[]>({
    queryKey: [`/api/audit-log/patients/${patientId}`],
    queryFn: () => fetch(`/api/audit-log/patients/${patientId}`, {
      headers: { Authorization: `Bearer ${token()}` },
    }).then(r => r.json()),
    enabled: !!patientId,
    staleTime: 30_000,
  });

  const recentCount = logs.length;

  return (
    <div className="mt-6 border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <div className="w-7 h-7 rounded-lg bg-slate-200 flex items-center justify-center shrink-0">
          <Lock className="w-3.5 h-3.5 text-slate-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-700">Log de Auditoria do Prontuário</p>
          <p className="text-xs text-slate-500">
            {isLoading ? "Carregando…" : recentCount > 0 ? `${recentCount} registro(s) de alteração` : "Nenhuma alteração registrada"}
          </p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
      </button>

      {open && (
        <div className="divide-y divide-slate-100">
          {isLoading && (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
            </div>
          )}
          {!isLoading && logs.length === 0 && (
            <p className="text-sm text-slate-400 py-5 text-center">
              Nenhuma alteração registrada ainda.
            </p>
          )}
          {!isLoading && logs.length > 0 && (
            <div className="max-h-96 overflow-y-auto">
              {logs.map((log: any) => {
                const style = ACTION_STYLES[log.action] || ACTION_STYLES.update;
                const entity = ENTITY_LABELS[log.entityType] || { label: log.entityType, icon: "📝" };
                return (
                  <div key={log.id} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                    <div className="shrink-0 mt-0.5">
                      <span className="text-base">{entity.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                        <span className="text-xs font-semibold text-slate-800">{entity.label}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}>
                          {style.label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-snug">{log.summary || entity.label}</p>
                      {log.userName && (
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          por <span className="font-medium text-slate-500">{log.userName}</span>
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-[11px] text-slate-400 whitespace-nowrap mt-0.5">
                      {format(new Date(log.createdAt), "dd/MM HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Jornada do Cliente ─────────────────────────────────────────────────────────




export function AuditLogTab({ patientId }: { patientId: number }) {
  const [filter, setFilter] = useState<AuditAction>("all");
  const token = () => localStorage.getItem("fisiogest_token");

  const { data: logs = [], isLoading } = useQuery<any[]>({
    queryKey: [`/api/audit-log/patients/${patientId}`],
    queryFn: () =>
      fetch(`/api/audit-log/patients/${patientId}`, {
        headers: { Authorization: `Bearer ${token()}` },
      }).then((r) => r.json()),
    enabled: !!patientId,
    staleTime: 30_000,
  });

  const filtered = filter === "all" ? logs : logs.filter((l) => l.action === filter);

  const counts = {
    all: logs.length,
    create: logs.filter((l) => l.action === "create").length,
    update: logs.filter((l) => l.action === "update").length,
    delete: logs.filter((l) => l.action === "delete").length,
  };

  // Group by calendar date
  const grouped: Record<string, any[]> = {};
  for (const log of filtered) {
    const day = format(new Date(log.createdAt), "yyyy-MM-dd");
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(log);
  }
  const days = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  function dayLabel(dateStr: string) {
    const d = new Date(dateStr + "T12:00:00");
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (format(d, "yyyy-MM-dd") === format(today, "yyyy-MM-dd")) return "Hoje";
    if (format(d, "yyyy-MM-dd") === format(yesterday, "yyyy-MM-dd")) return "Ontem";
    return format(d, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  }

  const filterButtons: { key: AuditAction; label: string; color: string; activeClass: string }[] = [
    { key: "all",    label: `Todos (${counts.all})`,          color: "border-slate-200 text-slate-600", activeClass: "bg-slate-800 text-white border-slate-800" },
    { key: "create", label: `Criações (${counts.create})`,    color: "border-emerald-200 text-emerald-700", activeClass: "bg-emerald-600 text-white border-emerald-600" },
    { key: "update", label: `Edições (${counts.update})`,     color: "border-blue-200 text-blue-700",    activeClass: "bg-blue-600 text-white border-blue-600" },
    { key: "delete", label: `Exclusões (${counts.delete})`,   color: "border-red-200 text-red-600",      activeClass: "bg-red-600 text-white border-red-600" },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
          <ShieldAlert className="w-5 h-5 text-slate-600" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Log de Auditoria do Prontuário</h3>
          <p className="text-sm text-slate-500">
            Rastreabilidade completa — todas as criações, edições e exclusões ficam registradas com usuário e horário.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Criações", value: counts.create, bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-400" },
          { label: "Edições",  value: counts.update, bg: "bg-blue-50",    text: "text-blue-700",    dot: "bg-blue-400"    },
          { label: "Exclusões",value: counts.delete, bg: "bg-red-50",     text: "text-red-600",     dot: "bg-red-400"     },
        ].map((s) => (
          <div key={s.label} className={`rounded-xl p-3 ${s.bg} flex items-center gap-2.5`}>
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.dot}`} />
            <div>
              <p className={`text-lg font-bold leading-none ${s.text}`}>{s.value}</p>
              <p className={`text-xs mt-0.5 ${s.text} opacity-80`}>{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filter buttons */}
      <div className="flex flex-wrap gap-2">
        {filterButtons.map((btn) => (
          <button
            key={btn.key}
            onClick={() => setFilter(btn.key)}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
              filter === btn.key ? btn.activeClass : `bg-white ${btn.color} hover:bg-slate-50`
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Log list */}
      {isLoading ? (
        <div className="py-12 text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-300" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-200">
          <CardContent className="p-12 text-center text-slate-400">
            <Lock className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum registro encontrado</p>
            <p className="text-sm mt-1">
              {filter === "all"
                ? "Ainda não há ações registradas neste prontuário."
                : "Nenhum registro para o filtro selecionado."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {days.map((day) => (
            <div key={day}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {dayLabel(day)}
                </span>
                <div className="flex-1 h-px bg-slate-100" />
                <span className="text-xs text-slate-300">{grouped[day].length}</span>
              </div>
              <div className="space-y-1">
                {grouped[day].map((log: any) => {
                  const style = ACTION_STYLES[log.action] || ACTION_STYLES.update;
                  const entity = ENTITY_LABELS[log.entityType] || { label: log.entityType, icon: "📝" };
                  return (
                    <div
                      key={log.id}
                      className="flex items-start gap-3 px-4 py-3 rounded-xl border border-slate-100 bg-white hover:bg-slate-50 transition-colors"
                    >
                      <div className="shrink-0 w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center mt-0.5 text-sm">
                        {entity.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="text-xs font-semibold text-slate-800">{entity.label}</span>
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                            {style.label}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 leading-snug">{log.summary || entity.label}</p>
                        {log.userName && (
                          <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                            <UserCheck className="w-3 h-3" />
                            <span className="font-medium text-slate-500">{log.userName}</span>
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-[11px] text-slate-400 whitespace-nowrap mt-0.5 tabular-nums">
                        {format(new Date(log.createdAt), "HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Appointment History Tab ────────────────────────────────────────────────────

