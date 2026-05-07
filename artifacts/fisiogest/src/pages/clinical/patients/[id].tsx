import { useParams, useLocation } from "wouter";
import { apiFetch, apiFetchJson } from "@/lib/api";
import { downloadPatientExport } from "@/lib/lgpd";
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  ShieldCheck, Link2, Camera, UserPlus, Building2, Bell,
  MoreVertical, MessageCircle, ChevronLeft, CalendarPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { VoiceTextarea as Textarea } from "@/components/ui/voice-textarea";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useToast } from "@/lib/toast";
import { format, differenceInYears, differenceInDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DatePickerPTBR } from "@/components/ui/date-picker-ptbr";
import { useAuth } from "@/hooks/use-auth";
import { PlanBadge } from "@/components/guards/plan-badge";
import { maskCpf, maskPhone, displayCpf } from "@/utils/masks";
import { patientFormSchema, buildPatientPayload } from "@/schemas/patient.schema";
import { cn } from "@/lib/utils";
const PhotosTab = lazy(() =>
  import("./photos-tab").then((m) => ({ default: m.PhotosTab })),
);

import type { PatientBasic, ClinicInfo, PkgOption, PlanProcedureItem } from "./patient-detail/types";
import {
  statusConfig,
  formatDate,
  formatDateTime,
  formatCurrency,
  fmtCur,
  todayBRTDate,
  InfoBlock,
} from "./patient-detail/utils/format";
import {
  ExportProntuarioButton,
  fetchClinicForPrint,
  printDocument,
  generateDischargeHTML,
  generateEvolutionsHTML,
  generatePlanHTML,
  generateContractHTML,
} from "./patient-detail/utils/print-html";

const AtestadosTab = lazy(() =>
  import("./patient-detail/tabs/AtestadosTab").then((m) => ({ default: m.AtestadosTab })),
);
const DischargeTab = lazy(() =>
  import("./patient-detail/tabs/DischargeTab").then((m) => ({ default: m.DischargeTab })),
);
const FinancialTab = lazy(() =>
  import("./patient-detail/tabs/FinancialTab").then((m) => ({ default: m.FinancialTab })),
);
const HistoryTab = lazy(() =>
  import("./patient-detail/tabs/HistoryTab").then((m) => ({ default: m.HistoryTab })),
);
const AuditLogTab = lazy(() =>
  import("./patient-detail/tabs/AuditLogTab").then((m) => ({ default: m.AuditLogTab })),
);
const JornadaTab = lazy(() =>
  import("./patient-detail/tabs/JornadaTab").then((m) => ({ default: m.JornadaTab })),
);
const EvolutionsTab = lazy(() =>
  import("./patient-detail/tabs/EvolutionsTab").then((m) => ({ default: m.EvolutionsTab })),
);
const TreatmentPlanTab = lazy(() =>
  import("./patient-detail/tabs/TreatmentPlanTab").then((m) => ({ default: m.TreatmentPlanTab })),
);
const EvaluationsTab = lazy(() =>
  import("./patient-detail/tabs/EvaluationsTab").then((m) => ({ default: m.EvaluationsTab })),
);
const AnamnesisTab = lazy(() =>
  import("./patient-detail/tabs/AnamnesisTab").then((m) => ({ default: m.AnamnesisTab })),
);

function TabLoader() {
  return (
    <div className="flex h-48 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

// ─── Avatar palette ───────────────────────────────────────────────────────────
const AVATAR_PALETTES = [
  { bg: "bg-teal-100",    text: "text-teal-700",    ring: "ring-teal-200"    },
  { bg: "bg-sky-100",     text: "text-sky-700",     ring: "ring-sky-200"     },
  { bg: "bg-violet-100",  text: "text-violet-700",  ring: "ring-violet-200"  },
  { bg: "bg-pink-100",    text: "text-pink-700",    ring: "ring-pink-200"    },
  { bg: "bg-amber-100",   text: "text-amber-700",   ring: "ring-amber-200"   },
  { bg: "bg-emerald-100", text: "text-emerald-700", ring: "ring-emerald-200" },
  { bg: "bg-blue-100",    text: "text-blue-700",    ring: "ring-blue-200"    },
  { bg: "bg-rose-100",    text: "text-rose-700",    ring: "ring-rose-200"    },
];
function avatarPalette(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_PALETTES[Math.abs(h) % AVATAR_PALETTES.length];
}
function whatsappLink(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits.startsWith("55") ? digits : `55${digits}`}`;
}

// ─── Patient data interface ───────────────────────────────────────────────────
interface PatientData {
  id: number;
  name: string;
  cpf: string;
  phone: string;
  email?: string | null;
  birthDate?: string | null;
  address?: string | null;
  profession?: string | null;
  emergencyContact?: string | null;
  notes?: string | null;
}

// ─── Edit Dialog ──────────────────────────────────────────────────────────────
function EditPatientDialog({
  patient, open, onClose, onSaved,
}: {
  patient: PatientData; open: boolean; onClose: () => void; onSaved: () => void;
}) {
  const { hasPermission, hasRole } = useAuth();
  const { toast } = useToast();
  const mutation = useUpdatePatient();
  const isAdmin = hasRole("admin");

  const [form, setForm] = useState({
    name: patient.name ?? "",
    cpf: maskCpf(patient.cpf ?? ""),
    phone: maskPhone(patient.phone ?? ""),
    email: patient.email ?? "",
    birthDate: patient.birthDate ?? "",
    address: patient.address ?? "",
    profession: patient.profession ?? "",
    emergencyContact: patient.emergencyContact ?? "",
    notes: patient.notes ?? "",
  });

  useEffect(() => {
    if (open) {
      setForm({
        name: patient.name ?? "",
        cpf: maskCpf(patient.cpf ?? ""),
        phone: maskPhone(patient.phone ?? ""),
        email: patient.email ?? "",
        birthDate: patient.birthDate ?? "",
        address: patient.address ?? "",
        profession: patient.profession ?? "",
        emergencyContact: patient.emergencyContact ?? "",
        notes: patient.notes ?? "",
      });
    }
  }, [open, patient]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = patientFormSchema.safeParse(form);
    if (!parsed.success) {
      toast({ variant: "destructive", title: "Dados inválidos", description: parsed.error.issues[0]?.message ?? "Verifique os campos do paciente." });
      return;
    }
    const payload = buildPatientPayload(parsed.data);
    mutation.mutate(
      { id: patient.id, data: payload },
      {
        onSuccess: () => {
          toast({ title: "Cadastro atualizado", description: "Os dados do paciente foram salvos." });
          onSaved();
          onClose();
        },
        onError: (err: any) => {
          toast({ variant: "destructive", title: "Erro ao salvar", description: err?.response?.data?.message ?? "Não foi possível atualizar." });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[620px] border-none shadow-2xl rounded-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl flex items-center gap-2">
            <Pencil className="w-5 h-5 text-primary" /> Editar Cadastro
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            {isAdmin ? "Todos os campos estão disponíveis." : "Você pode editar contato e dados pessoais."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
              Identificação
              {!isAdmin && <span className="ml-2 inline-flex items-center gap-1 text-slate-300 normal-case tracking-normal font-normal"><Lock className="w-3 h-3" /> restrito ao administrador</span>}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nome Completo *</Label>
                <Input required disabled={!isAdmin} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="h-10 disabled:bg-slate-50 disabled:text-slate-400" />
              </div>
              <div className="space-y-1.5">
                <Label>CPF *</Label>
                <Input required disabled={!isAdmin} inputMode="numeric" maxLength={14} value={form.cpf} onChange={e => setForm({ ...form, cpf: maskCpf(e.target.value) })} placeholder="000.000.000-00" className="h-10 disabled:bg-slate-50 disabled:text-slate-400" />
              </div>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">Contato</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Telefone *</Label>
                <Input required type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: maskPhone(e.target.value) })} placeholder="(11) 99999-0000" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="h-10" />
              </div>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">Dados Pessoais</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Data de Nascimento</Label>
                <DatePickerPTBR value={form.birthDate} onChange={v => setForm({ ...form, birthDate: v })} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label>Profissão</Label>
                <Input value={form.profession} onChange={e => setForm({ ...form, profession: e.target.value })} placeholder="Ex: Professora" className="h-10" />
              </div>
            </div>
            <div className="mt-4 space-y-1.5">
              <Label>Endereço</Label>
              <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Rua e número" className="h-10" />
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">Informações Adicionais</p>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5 text-amber-500" /> Contato de Emergência</Label>
              <Input value={form.emergencyContact} onChange={e => setForm({ ...form, emergencyContact: e.target.value })} placeholder="Nome — Telefone" className="h-10" />
            </div>
          </div>

          <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4 space-y-1.5">
            <Label className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-primary" /> Observações desta clínica</Label>
            <p className="text-[11px] text-slate-400">Não compartilhadas com outras clínicas.</p>
            <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Histórico, alergias, restrições…" className="min-h-[80px] bg-white resize-none" />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl">Cancelar</Button>
            <Button type="submit" className="h-10 px-8 rounded-xl" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              Salvar Alterações
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── LGPD Export Button ───────────────────────────────────────────────────────
function ExportLgpdButton({ patientId }: { patientId: number }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      await downloadPatientExport(patientId);
      toast({ title: "Exportação iniciada", description: "Arquivo JSON com dados do paciente baixado." });
    } catch (err) {
      toast({ variant: "destructive", title: "Falha na exportação", description: err instanceof Error ? err.message : "Tente novamente." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <DropdownMenuItem onClick={handleExport} disabled={loading} className="gap-2 text-slate-600">
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
      Exportar dados (LGPD)
    </DropdownMenuItem>
  );
}

// ─── Access Requests Panels ───────────────────────────────────────────────────
interface AccessRequest {
  id: number;
  cpf: string;
  requestingClinicId: number;
  requestingClinicName: string;
  sourceClinicId?: number;
  sourceClinicName?: string;
  scope: string;
  status: "pending" | "approved" | "denied";
  message?: string | null;
  createdAt: string;
  respondedAt?: string | null;
}

function AccessRequestsPanel({ cpf }: { cpf: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery<AccessRequest[]>({
    queryKey: ["/api/patients/access-requests/incoming", cpf],
    queryFn: async () => {
      const res = await apiFetch(`/api/patients/access-requests/incoming?cpf=${encodeURIComponent(cpf)}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const respondMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: "approved" | "denied" }) => {
      const csrfCookie = document.cookie.split(";").find(c => c.trim().startsWith("fisiogest_csrf="))?.split("=")[1];
      const res = await apiFetch(`/api/patients/access-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(csrfCookie ? { "x-csrf-token": decodeURIComponent(csrfCookie) } : {}) },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Falha ao responder solicitação");
      return res.json();
    },
    onSuccess: (_, vars) => {
      toast({
        title: vars.status === "approved" ? "Acesso aprovado" : "Acesso negado",
        description: vars.status === "approved" ? "A clínica poderá visualizar os dados clínicos." : "Solicitação recusada.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/patients/access-requests/incoming", cpf] });
      refetch();
    },
    onError: () => toast({ variant: "destructive", title: "Erro", description: "Não foi possível processar a resposta." }),
  });

  const pending = (data ?? []).filter(r => r.status === "pending");
  if (isLoading || pending.length === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Bell className="w-4 h-4 text-amber-600" />
        <p className="text-sm font-semibold text-slate-800">Solicitações de acesso</p>
        <span className="ml-auto flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold">{pending.length}</span>
      </div>
      {pending.map(req => (
        <div key={req.id} className="rounded-xl border border-amber-200 bg-white p-3 space-y-2">
          <div className="flex items-start gap-2">
            <Building2 className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-700 truncate">{req.requestingClinicName}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {new Date(req.createdAt).toLocaleDateString("pt-BR")} · {req.scope === "clinical_records" ? "Prontuário completo" : req.scope}
              </p>
              {req.message && <p className="text-[10px] text-slate-500 mt-1 italic">"{req.message}"</p>}
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1 h-7 text-[11px] rounded-lg border-red-200 text-red-600 hover:bg-red-50" disabled={respondMutation.isPending} onClick={() => respondMutation.mutate({ id: req.id, status: "denied" })}>
              <XCircle className="w-3 h-3 mr-1" /> Negar
            </Button>
            <Button size="sm" className="flex-1 h-7 text-[11px] rounded-lg" disabled={respondMutation.isPending} onClick={() => respondMutation.mutate({ id: req.id, status: "approved" })}>
              {respondMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <><CheckCircle className="w-3 h-3 mr-1" /> Aprovar</>}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function OutgoingAccessRequestsPanel({ cpf }: { cpf: string }) {
  const { data, isLoading } = useQuery<AccessRequest[]>({
    queryKey: ["/api/patients/access-requests/outgoing", cpf],
    queryFn: async () => {
      const res = await apiFetch(`/api/patients/access-requests/outgoing`);
      if (!res.ok) return [];
      const all: AccessRequest[] = await res.json();
      const normalizedCpf = cpf.replace(/\D/g, "");
      return all.filter(r => r.cpf === normalizedCpf || (r as any).cpf?.replace?.(/\D/g, "") === normalizedCpf);
    },
    staleTime: 30_000,
  });

  if (isLoading || !data || data.length === 0) return null;

  const statusMap = {
    pending:  { label: "Aguardando", bg: "bg-amber-100",  text: "text-amber-700",  icon: <Clock className="w-3 h-3" /> },
    approved: { label: "Aprovado",   bg: "bg-green-100",  text: "text-green-700",  icon: <CheckCircle className="w-3 h-3" /> },
    denied:   { label: "Negado",     bg: "bg-red-100",    text: "text-red-600",    icon: <XCircle className="w-3 h-3" /> },
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ArrowUpRight className="w-4 h-4 text-slate-400" />
        <p className="text-sm font-semibold text-slate-700">Solicitações enviadas</p>
      </div>
      {data.map(req => {
        const s = statusMap[req.status] ?? statusMap.pending;
        return (
          <div key={req.id} className="flex items-start gap-2">
            <Building2 className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-600 truncate">{req.sourceClinicName ?? "Clínica"}</p>
              <p className="text-[10px] text-slate-400">{new Date(req.createdAt).toLocaleDateString("pt-BR")}</p>
            </div>
            <span className={cn("flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full", s.bg, s.text)}>
              {s.icon} {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PatientDetail() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const patientId = Number(id);
  const { data: patient, isLoading, refetch } = useGetPatient(patientId);
  const { hasPermission, isSuperAdmin } = useAuth();
  const { toast } = useToast();
  const deleteMutation = useDeletePatient();
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(() => {
    const tabParam = new URLSearchParams(window.location.search).get("tab");
    const baseTabs = ["jornada","anamnesis","evaluations","treatment","evolutions","history","financial","atestados","discharge"];
    const validTabs = isSuperAdmin ? [...baseTabs, "auditoria"] : baseTabs;
    return validTabs.includes(tabParam ?? "") ? (tabParam as string) : "jornada";
  });

  const { data: journeyData } = useQuery<{
    steps: unknown[];
    meta: {
      firstConsultationCompleted: boolean;
      hasDischarge: boolean;
      treatmentPlanProgress: { isNearingCompletion: boolean } | null;
    };
  }>({
    queryKey: [`/api/patients/${patientId}/journey`],
    queryFn: () => apiFetchJson(`/api/patients/${patientId}/journey`),
    enabled: !!patientId,
    staleTime: 0,
  });

  const journeyPhase: 1 | 2 | 3 = !journeyData
    ? 1
    : !journeyData.meta?.firstConsultationCompleted
    ? 1
    : journeyData.meta?.hasDischarge || journeyData.meta?.treatmentPlanProgress?.isNearingCompletion
    ? 3
    : 2;

  const showJornadaTab = journeyPhase !== 2;

  useEffect(() => {
    if (activeTab === "jornada" && journeyPhase === 2) setActiveTab("evolutions");
  }, [activeTab, journeyPhase]);

  const canEdit = hasPermission("patients.update");
  const canDelete = hasPermission("patients.delete");

  const handleDelete = () => {
    deleteMutation.mutate(
      { id: patientId },
      {
        onSuccess: () => {
          toast({ title: "Paciente excluído", description: "O cadastro foi removido permanentemente." });
          setLocation("/pacientes");
        },
        onError: () => toast({ variant: "destructive", title: "Erro ao excluir", description: "Não foi possível excluir o paciente." }),
      }
    );
  };

  if (isLoading) {
    return (
      <AppLayout title="Carregando…">
        <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>
      </AppLayout>
    );
  }

  if (!patient) {
    return (
      <AppLayout title="Paciente não encontrado">
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <User className="w-16 h-16 mb-4 opacity-30" />
          <p className="text-lg font-medium">Paciente não encontrado</p>
          <Button variant="ghost" className="mt-4 gap-1.5" onClick={() => setLocation("/pacientes")}>
            <ChevronLeft className="w-4 h-4" /> Voltar à lista
          </Button>
        </div>
      </AppLayout>
    );
  }

  const initials = patient.name.split(" ").filter(Boolean).map((n: string) => n[0]).slice(0, 2).join("").toUpperCase();
  const palette = avatarPalette(patient.name);
  const age = patient.birthDate ? differenceInYears(new Date(), parseISO(patient.birthDate)) : null;
  const isDiscarged = journeyData?.meta?.hasDischarge;

  // ── Tab definitions ─────────────────────────────────────────────────────────
  const primaryTabs = [
    ...(showJornadaTab ? [{ value: "jornada", icon: <Milestone className="w-3.5 h-3.5 shrink-0" />, label: "Jornada" }] : []),
    { value: "anamnesis",   icon: <ClipboardList className="w-3.5 h-3.5 shrink-0" />, label: "Anamnese"   },
    { value: "evaluations", icon: <Activity className="w-3.5 h-3.5 shrink-0" />,      label: "Avaliações" },
    { value: "treatment",   icon: <Target className="w-3.5 h-3.5 shrink-0" />,        label: "Plano"      },
    { value: "evolutions",  icon: <TrendingUp className="w-3.5 h-3.5 shrink-0" />,    label: "Evoluções"  },
    { value: "history",     icon: <History className="w-3.5 h-3.5 shrink-0" />,       label: "Histórico"  },
    { value: "financial",   icon: <DollarSign className="w-3.5 h-3.5 shrink-0" />,    label: "Financeiro" },
  ];

  const secondaryTabs = [
    { value: "photos",    icon: <Camera className="w-3.5 h-3.5 shrink-0" />,     label: "Fotos",     extra: "" },
    { value: "atestados", icon: <ScrollText className="w-3.5 h-3.5 shrink-0" />, label: "Atestados", extra: "" },
    { value: "discharge", icon: <LogOut className="w-3.5 h-3.5 shrink-0" />,     label: "Alta",      extra: "data-[state=active]:bg-emerald-600" },
    ...(isSuperAdmin ? [{ value: "auditoria", icon: <ShieldAlert className="w-3.5 h-3.5 shrink-0" />, label: "Auditoria", extra: "data-[state=active]:bg-slate-700" }] : []),
  ];

  return (
    <AppLayout title="Prontuário do Paciente">

      {/* Dialogs */}
      {canEdit && (
        <EditPatientDialog patient={patient as PatientData} open={editOpen} onClose={() => setEditOpen(false)} onSaved={() => { queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}`] }); refetch(); }} />
      )}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir paciente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente e removerá <strong>{patient.name}</strong> e todos os seus dados. Não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white" disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Excluir permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5 min-w-0 items-start">

        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <div className="space-y-4 min-w-0">

          {/* Profile Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

            {/* Header strip */}
            <div className={cn("h-2 w-full", palette.bg)} />

            <div className="p-4 pb-5">
              {/* Avatar + Name + Actions */}
              <div className="flex items-start gap-3 mb-4">
                <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-xl shrink-0 ring-4", palette.bg, palette.text, palette.ring)}>
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="font-bold text-base text-slate-800 leading-tight truncate">{patient.name}</h2>
                  <div className="flex items-center flex-wrap gap-1.5 mt-1">
                    {isDiscarged ? (
                      <span className="text-[10px] font-semibold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full flex items-center gap-1"><BadgeCheck className="w-3 h-3" /> Alta emitida</span>
                    ) : (
                      <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Ativo</span>
                    )}
                    {age !== null && (
                      <span className="text-[10px] font-medium bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{age} anos</span>
                    )}
                  </div>
                </div>
                {/* Actions dropdown */}
                {(canEdit || canDelete || isSuperAdmin) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="w-8 h-8 shrink-0 rounded-xl text-slate-400 hover:text-slate-600">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 rounded-xl shadow-lg border-slate-200">
                      {canEdit && (
                        <DropdownMenuItem onClick={() => setEditOpen(true)} className="gap-2">
                          <Pencil className="w-3.5 h-3.5" /> Editar cadastro
                        </DropdownMenuItem>
                      )}
                      {isSuperAdmin && <ExportLgpdButton patientId={patientId} />}
                      {canDelete && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setDeleteOpen(true)} className="gap-2 text-red-600 focus:text-red-600 focus:bg-red-50">
                            <Trash2 className="w-3.5 h-3.5" /> Excluir paciente
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {/* Quick actions */}
              <div className="flex gap-2 mb-4">
                <a
                  href={whatsappLink(patient.phone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 transition-colors"
                >
                  <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                </a>
                <div className="flex-1">
                  <ExportProntuarioButton patientId={patientId} patient={patient} />
                </div>
              </div>

              {/* Stats strip */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">Consultas</p>
                  <p className="text-2xl font-extrabold text-slate-800 tabular-nums">{patient.totalAppointments || 0}</p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">Total gasto</p>
                  <p className="text-sm font-bold text-slate-800 tabular-nums">{formatCurrency(patient.totalSpent || 0)}</p>
                </div>
              </div>

              {/* Contact info */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2.5 text-sm text-slate-600">
                  <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <a href={`tel:${patient.phone}`} className="hover:text-primary transition-colors truncate">{patient.phone}</a>
                </div>
                {patient.email && (
                  <div className="flex items-center gap-2.5 text-sm text-slate-600">
                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <a href={`mailto:${patient.email}`} className="hover:text-primary transition-colors truncate">{patient.email}</a>
                  </div>
                )}
                {patient.birthDate && (
                  <div className="flex items-center gap-2.5 text-sm text-slate-600">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{formatDate(patient.birthDate)}</span>
                  </div>
                )}
                {patient.address && (
                  <div className="flex items-start gap-2.5 text-sm text-slate-600">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <span className="truncate">{patient.address}</span>
                  </div>
                )}
                {patient.profession && (
                  <div className="flex items-center gap-2.5 text-sm text-slate-600">
                    <UserCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{patient.profession}</span>
                  </div>
                )}
                {patient.cpf && (
                  <div className="flex items-center gap-2.5 text-sm text-slate-500">
                    <ShieldCheck className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                    <span className="font-mono text-xs">{displayCpf(patient.cpf)}</span>
                  </div>
                )}
              </div>

              {/* Emergency contact */}
              {patient.emergencyContact && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-100">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wide mb-0.5">Emergência</p>
                      <p className="text-xs text-slate-700">{patient.emergencyContact}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Clinic notes */}
              {patient.notes && (
                <div className="mt-3 p-2.5 rounded-xl bg-primary/[0.04] border border-primary/15">
                  <p className="text-[10px] font-bold text-primary uppercase tracking-wide mb-1 flex items-center gap-1">
                    <Building2 className="w-3 h-3" /> Obs. desta clínica
                  </p>
                  <p className="text-xs text-slate-600 leading-relaxed">{patient.notes}</p>
                </div>
              )}
            </div>
          </div>

          {/* Access requests */}
          {canEdit && patient.cpf && <AccessRequestsPanel cpf={patient.cpf} />}
          {patient.cpf && <OutgoingAccessRequestsPanel cpf={patient.cpf} />}
        </div>

        {/* ── Main Content ─────────────────────────────────────────────────── */}
        <div className="min-w-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="mb-5 space-y-1.5">

              {/* Primary tabs */}
              <div className="-mx-1 px-1 overflow-x-auto">
                <TabsList className="inline-flex w-auto min-w-full bg-white p-1 rounded-xl shadow-sm border border-slate-200 h-auto gap-1">
                  {primaryTabs.map(tab => (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className={cn(
                        "shrink-0 whitespace-nowrap rounded-lg text-xs py-2 px-3 flex items-center gap-1.5 font-medium",
                        "data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-sm",
                        "data-[state=inactive]:text-slate-500 data-[state=inactive]:hover:text-slate-700 data-[state=inactive]:hover:bg-slate-50",
                        tab.value === "jornada" && "data-[state=inactive]:text-primary data-[state=inactive]:font-semibold"
                      )}
                    >
                      {tab.icon} {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              {/* Secondary tabs */}
              <div className="-mx-1 px-1 overflow-x-auto">
                <TabsList className="inline-flex w-auto bg-white p-1 rounded-xl shadow-sm border border-dashed border-slate-200 h-auto gap-1">
                  {secondaryTabs.map(tab => (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className={cn(
                        "shrink-0 whitespace-nowrap rounded-lg text-xs py-1.5 px-3 flex items-center gap-1.5",
                        "data-[state=inactive]:text-slate-400 data-[state=inactive]:hover:text-slate-600 data-[state=inactive]:hover:bg-slate-50",
                        tab.extra || "data-[state=active]:bg-primary data-[state=active]:text-white"
                      )}
                    >
                      {tab.icon} {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </div>

            <TabsContent value="jornada">
              <Suspense fallback={<TabLoader />}><JornadaTab patientId={patientId} onNavigateToTab={setActiveTab} /></Suspense>
            </TabsContent>
            <TabsContent value="anamnesis">
              <Suspense fallback={<TabLoader />}><AnamnesisTab patientId={patientId} /></Suspense>
            </TabsContent>
            <TabsContent value="photos">
              <Suspense fallback={<TabLoader />}><PhotosTab patientId={patientId} /></Suspense>
            </TabsContent>
            <TabsContent value="evaluations">
              <Suspense fallback={<TabLoader />}><EvaluationsTab patientId={patientId} /></Suspense>
            </TabsContent>
            <TabsContent value="treatment">
              <Suspense fallback={<TabLoader />}>
                <TreatmentPlanTab patientId={patientId} patient={patient ? { name: patient.name, cpf: patient.cpf, birthDate: patient.birthDate, phone: patient.phone } : undefined} />
              </Suspense>
            </TabsContent>
            <TabsContent value="evolutions">
              <Suspense fallback={<TabLoader />}>
                <EvolutionsTab patientId={patientId} patient={patient ? { name: patient.name, cpf: patient.cpf, birthDate: patient.birthDate, phone: patient.phone } : undefined} />
              </Suspense>
            </TabsContent>
            <TabsContent value="history">
              <Suspense fallback={<TabLoader />}>
                <HistoryTab patientId={patientId} patient={patient ? { name: patient.name, cpf: patient.cpf || "", birthDate: patient.birthDate } : { name: "", cpf: "" }} />
              </Suspense>
            </TabsContent>
            <TabsContent value="financial">
              <Suspense fallback={<TabLoader />}><FinancialTab patientId={patientId} /></Suspense>
            </TabsContent>
            <TabsContent value="atestados">
              <Suspense fallback={<TabLoader />}>
                <AtestadosTab patientId={patientId} patient={patient ? { name: patient.name, cpf: patient.cpf || "", birthDate: patient.birthDate } : { name: "", cpf: "" }} />
              </Suspense>
            </TabsContent>
            <TabsContent value="discharge">
              <Suspense fallback={<TabLoader />}>
                <DischargeTab patientId={patientId} patient={patient ? { name: patient.name, cpf: patient.cpf, birthDate: patient.birthDate, phone: patient.phone } : undefined} />
              </Suspense>
            </TabsContent>
            {isSuperAdmin && (
              <TabsContent value="auditoria">
                <Suspense fallback={<TabLoader />}><AuditLogTab patientId={patientId} /></Suspense>
              </TabsContent>
            )}
          </Tabs>
        </div>

      </div>
    </AppLayout>
  );
}
