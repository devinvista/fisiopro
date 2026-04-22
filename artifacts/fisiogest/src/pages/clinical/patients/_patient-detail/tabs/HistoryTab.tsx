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
import { AtestadoDialog } from "./AtestadosTab";

// ─── Extracted from patients/[id].tsx ──────────────────────────────────────

export function HistoryTab({ patientId, patient }: { patientId: number; patient: PatientBasic }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: appointments = [], isLoading } = useQuery<any[]>({
    queryKey: [`/api/patients/${patientId}/appointments`],
    queryFn: () => fetch(`/api/patients/${patientId}/appointments`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("fisiogest_token")}` }
    }).then(r => r.json()),
    enabled: !!patientId,
  });
  const [dialogAppt, setDialogAppt] = useState<any | null>(null);
  const [rescheduleAppt, setRescheduleAppt] = useState<any | null>(null);
  const [rescheduleForm, setRescheduleForm] = useState({ date: "", startTime: "" });
  const [rescheduleBusy, setRescheduleBusy] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = appointments.filter((a: any) =>
    (a.date > today || (a.date === today && ["agendado", "confirmado", "compareceu"].includes(a.status))) &&
    !["cancelado", "remarcado", "concluido", "faltou"].includes(a.status)
  ).sort((a: any, b: any) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  const past = appointments.filter((a: any) =>
    !upcoming.includes(a)
  ).sort((a: any, b: any) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));

  const openReschedule = (appt: any) => {
    setRescheduleAppt(appt);
    setRescheduleForm({ date: appt.date, startTime: appt.startTime });
  };

  const handleReschedule = async () => {
    if (!rescheduleAppt) return;
    setRescheduleBusy(true);
    try {
      const token = localStorage.getItem("fisiogest_token");
      const res = await fetch(`/api/appointments/${rescheduleAppt.id}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(rescheduleForm),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ variant: "destructive", title: "Erro ao remarcar", description: err.message || "Verifique o horário e tente novamente." });
        return;
      }
      toast({ title: "Remarcado com sucesso!", description: `Nova consulta em ${rescheduleForm.date} às ${rescheduleForm.startTime}.` });
      setRescheduleAppt(null);
      queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/appointments`] });
    } catch {
      toast({ variant: "destructive", title: "Erro ao remarcar." });
    } finally {
      setRescheduleBusy(false);
    }
  };

  if (isLoading) return <div className="p-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>;

  const renderCard = (appt: any) => {
    const cfg = statusConfig[appt.status] || statusConfig.agendado;
    const isConcluido = appt.status === "concluido";
    const canReschedule = ["agendado", "confirmado", "faltou", "cancelado"].includes(appt.status);
    return (
      <Card key={appt.id} className="border border-slate-200 shadow-sm">
        <CardContent className="p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex flex-col items-center justify-center text-primary shrink-0">
            <span className="text-lg font-bold leading-none">{format(parseISO(appt.date), "d")}</span>
            <span className="text-[10px] uppercase font-medium opacity-70">
              {format(parseISO(appt.date), "MMM", { locale: ptBR })}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-800 truncate">{appt.procedure?.name || "Procedimento não informado"}</p>
            <p className="text-sm text-slate-500">{appt.startTime} — {appt.endTime} &bull; {formatDate(appt.date)}</p>
            {appt.notes && <p className="text-xs text-slate-400 mt-0.5 truncate">{appt.notes}</p>}
            {appt.status === "remarcado" && appt.rescheduledToId && (
              <p className="text-xs text-purple-500 mt-0.5">Remarcado para novo agendamento</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canReschedule && (
              <Button variant="outline" size="sm"
                className="h-8 gap-1.5 text-xs border-purple-200 text-purple-700 hover:bg-purple-50"
                onClick={() => openReschedule(appt)}>
                <RefreshCw className="w-3.5 h-3.5" /> Remarcar
              </Button>
            )}
            {isConcluido && (
              <Button variant="outline" size="sm"
                className="h-8 gap-1.5 text-xs border-slate-200 text-slate-600 hover:text-primary hover:border-primary"
                onClick={() => setDialogAppt(appt)}>
                <ScrollText className="w-3.5 h-3.5" /> Atestado
              </Button>
            )}
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.color}`}>
              {cfg.icon} {cfg.label}
            </span>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-slate-800">Histórico de Consultas</h3>
        <p className="text-sm text-slate-500">{appointments.length} consulta(s) registrada(s)</p>
      </div>

      {appointments.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-200">
          <CardContent className="p-12 text-center text-slate-400">
            <History className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Nenhuma consulta registrada</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-700">Próximas consultas</span>
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">{upcoming.length}</span>
              </div>
              {upcoming.map(renderCard)}
            </div>
          )}
          {past.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-500">Histórico passado</span>
                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-semibold">{past.length}</span>
              </div>
              {past.map(renderCard)}
            </div>
          )}
        </>
      )}

      <AtestadoDialog
        open={!!dialogAppt}
        onClose={() => setDialogAppt(null)}
        patientId={patientId}
        patient={patient}
        appointmentDate={dialogAppt?.date}
        defaultType="comparecimento"
      />

      {/* Reschedule dialog */}
      <Dialog open={!!rescheduleAppt} onOpenChange={(open) => { if (!open) setRescheduleAppt(null); }}>
        <DialogContent className="sm:max-w-[380px] rounded-2xl">
          <DialogHeader>
            <DialogTitle>Remarcar consulta</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-slate-500">
              Selecione nova data e horário para: <strong>{rescheduleAppt?.procedure?.name}</strong>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Nova data</Label>
                <DatePickerPTBR value={rescheduleForm.date} onChange={(v) => setRescheduleForm(f => ({ ...f, date: v }))} className="rounded-xl h-10" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Novo horário</Label>
                <input
                  type="time"
                  value={rescheduleForm.startTime}
                  onChange={(e) => setRescheduleForm(f => ({ ...f, startTime: e.target.value }))}
                  className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="rounded-xl flex-1" onClick={() => setRescheduleAppt(null)}>Cancelar</Button>
            <Button className="rounded-xl flex-1" onClick={handleReschedule} disabled={rescheduleBusy}>
              {rescheduleBusy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              Confirmar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Financial Tab ──────────────────────────────────────────────────────────────


export function txTypeLabel(transactionType: string | null | undefined): { label: string; color: string; icon: string } {
  switch (transactionType) {
    case "creditoAReceber": return { label: "A Receber", color: "border-blue-200 text-blue-700 bg-blue-50", icon: "↑" };
    case "cobrancaSessao":  return { label: "A Receber (Sessão)", color: "border-blue-200 text-blue-700 bg-blue-50", icon: "↑" };
    case "cobrancaMensal":  return { label: "Mensalidade", color: "border-violet-200 text-violet-700 bg-violet-50", icon: "↑" };
    case "pagamento":       return { label: "Pagamento", color: "border-green-200 text-green-700 bg-green-50", icon: "✓" };
    case "usoCredito":      return { label: "Uso de Crédito", color: "border-amber-200 text-amber-700 bg-amber-50", icon: "C" };
    case "creditoSessao":   return { label: "Crédito de Sessão", color: "border-teal-200 text-teal-700 bg-teal-50", icon: "C" };
    case "ajuste":          return { label: "Ajuste", color: "border-orange-200 text-orange-700 bg-orange-50", icon: "~" };
    case "estorno":         return { label: "Estorno", color: "border-red-200 text-red-700 bg-red-50", icon: "↩" };
    default:                return { label: "Transação", color: "border-slate-200 text-slate-600 bg-slate-50", icon: "·" };
  }
}

export function statusLabel(status: string | null | undefined): { label: string; dot: string } {
  switch (status) {
    case "pago":      return { label: "Pago", dot: "bg-green-500" };
    case "cancelado": return { label: "Cancelado", dot: "bg-red-400" };
    case "estornado": return { label: "Estornado", dot: "bg-red-400" };
    default:          return { label: "Pendente", dot: "bg-amber-400" };
  }
}

export function subscriptionStatusStyle(status: string) {
  switch (status) {
    case "ativa": return "bg-green-50 text-green-700 border-green-200";
    case "pausada": return "bg-amber-50 text-amber-700 border-amber-200";
    default: return "bg-red-50 text-red-600 border-red-200";
  }
}

