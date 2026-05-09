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

// ─── Gender color helpers ───────────────────────────────────────────────────────
type SexType = "M" | "F" | "O" | null | undefined;

function genderGradient(sex: SexType): { from: string; to: string; css: string } {
  if (sex === "F") return { from: "#ec4899", to: "#be185d", css: "linear-gradient(135deg, #f472b6 0%, #be185d 100%)" };
  if (sex === "M") return { from: "#3b82f6", to: "#4f46e5", css: "linear-gradient(135deg, #60a5fa 0%, #4338ca 100%)" };
  return { from: "#0d9488", to: "#0891b2", css: "linear-gradient(135deg, #2dd4bf 0%, #0284c7 100%)" };
}

function genderAvatarColor(sex: SexType): string {
  if (sex === "F") return "#ec4899";
  if (sex === "M") return "#3b82f6";
  return "#0d9488";
}

function getInitials(name: string) {
  return name.split(" ").filter(Boolean).map((n: string) => n[0]).slice(0, 2).join("").toUpperCase();
}

function whatsappLink(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits.startsWith("55") ? digits : `55${digits}`}`;
}

// ─── Patient data interface ────────────────────────────────────────────────────
interface PatientData {
  id: number; name: string; cpf: string; phone: string;
  email?: string | null; birthDate?: string | null;
  sex?: string | null;
  address?: string | null; profession?: string | null;
  emergencyContact?: string | null; notes?: string | null;
}

// ─── Edit Dialog ───────────────────────────────────────────────────────────────
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
    sex: (patient.sex ?? "") as "" | "M" | "F" | "O",
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
        sex: (patient.sex ?? "") as "" | "M" | "F" | "O",
        address: patient.address ?? "",
        profession: patient.profession ?? "",
        emergencyContact: patient.emergencyContact ?? "",
        notes: patient.notes ?? "",
      });
    }
  }, [open, patient]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = patientFormSchema.safeParse({ ...form, sex: form.sex || undefined });
    if (!parsed.success) {
      toast({ variant: "destructive", title: "Dados inválidos", description: parsed.error.issues[0]?.message ?? "Verifique os campos." });
      return;
    }
    const payload = buildPatientPayload(parsed.data);
    mutation.mutate(
      { id: patient.id, data: payload },
      {
        onSuccess: () => {
          toast({ title: "Cadastro atualizado", description: "Os dados foram salvos." });
          onSaved(); onClose();
        },
        onError: (err: any) => {
          toast({ variant: "destructive", title: "Erro ao salvar", description: err?.response?.data?.message ?? "Não foi possível atualizar." });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
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
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">
              Identificação
              {!isAdmin && <span className="ml-2 inline-flex items-center gap-1 text-slate-300 normal-case tracking-normal font-normal"><Lock className="w-3 h-3" /> restrito ao administrador</span>}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nome Completo *</Label>
                <Input required disabled={!isAdmin} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="h-10 rounded-xl disabled:bg-slate-50 disabled:text-slate-400" />
              </div>
              <div className="space-y-1.5">
                <Label>CPF *</Label>
                <Input required disabled={!isAdmin} inputMode="numeric" maxLength={14} value={form.cpf}
                  onChange={e => setForm({ ...form, cpf: maskCpf(e.target.value) })} placeholder="000.000.000-00"
                  className="h-10 rounded-xl font-mono disabled:bg-slate-50 disabled:text-slate-400" />
              </div>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Contato</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Telefone *</Label>
                <Input required type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: maskPhone(e.target.value) })}
                  placeholder="(11) 99999-0000" className="h-10 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="h-10 rounded-xl" />
              </div>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Dados Pessoais</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Data de Nascimento</Label>
                <DatePickerPTBR value={form.birthDate} onChange={v => setForm({ ...form, birthDate: v })} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label>Sexo</Label>
                <Select value={form.sex} onValueChange={v => setForm({ ...form, sex: v as "" | "M" | "F" | "O" })}>
                  <SelectTrigger className="h-10 rounded-xl">
                    <SelectValue placeholder="Selecionar…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="F">Feminino</SelectItem>
                    <SelectItem value="M">Masculino</SelectItem>
                    <SelectItem value="O">Outro / Não informado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Profissão</Label>
                <Input value={form.profession} onChange={e => setForm({ ...form, profession: e.target.value })}
                  placeholder="Ex: Professora" className="h-10 rounded-xl" />
              </div>
            </div>
            <div className="mt-4 space-y-1.5">
              <Label>Endereço</Label>
              <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
                placeholder="Rua e número" className="h-10 rounded-xl" />
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Informações Adicionais</p>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5 text-amber-500" /> Contato de Emergência</Label>
              <Input value={form.emergencyContact} onChange={e => setForm({ ...form, emergencyContact: e.target.value })}
                placeholder="Nome — Telefone" className="h-10 rounded-xl" />
            </div>
          </div>

          <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4 space-y-1.5">
            <Label className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-primary" /> Observações desta clínica</Label>
            <p className="text-[11px] text-slate-400">Não compartilhadas com outras clínicas.</p>
            <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              placeholder="Histórico, alergias, restrições…" className="min-h-[80px] bg-white resize-none rounded-xl" />
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

// ─── LGPD Export Button ────────────────────────────────────────────────────────
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
    } finally { setLoading(false); }
  }
  return (
    <DropdownMenuItem onClick={handleExport} disabled={loading} className="gap-2 text-slate-600">
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
      Exportar dados (LGPD)
    </DropdownMenuItem>
  );
}

// ─── Access Requests ───────────────────────────────────────────────────────────
interface AccessRequest {
  id: number; cpf: string; requestingClinicId: number; requestingClinicName: string;
  sourceClinicId?: number; sourceClinicName?: string; scope: string;
  status: "pending" | "approved" | "denied"; message?: string | null;
  createdAt: string; respondedAt?: string | null;
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
      const csrf = document.cookie.split(";").find(c => c.trim().startsWith("fisiogest_csrf="))?.split("=")[1];
      const res = await apiFetch(`/api/patients/access-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(csrf ? { "x-csrf-token": decodeURIComponent(csrf) } : {}) },
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
            <Button size="sm" variant="outline" className="flex-1 h-7 text-[11px] rounded-lg border-red-200 text-red-600 hover:bg-red-50"
              disabled={respondMutation.isPending} onClick={() => respondMutation.mutate({ id: req.id, status: "denied" })}>
              <XCircle className="w-3 h-3 mr-1" /> Negar
            </Button>
            <Button size="sm" className="flex-1 h-7 text-[11px] rounded-lg"
              disabled={respondMutation.isPending} onClick={() => respondMutation.mutate({ id: req.id, status: "approved" })}>
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
      const norm = cpf.replace(/\D/g, "");
      return all.filter(r => r.cpf === norm || (r as any).cpf?.replace?.(/\D/g, "") === norm);
    },
    staleTime: 30_000,
  });
  if (isLoading || !data || data.length === 0) return null;
  const statusMap = {
    pending:  { label: "Aguardando", bg: "bg-amber-100", text: "text-amber-700",  icon: <Clock className="w-3 h-3" /> },
    approved: { label: "Aprovado",   bg: "bg-green-100", text: "text-green-700",  icon: <CheckCircle className="w-3 h-3" /> },
    denied:   { label: "Negado",     bg: "bg-red-100",   text: "text-red-600",    icon: <XCircle className="w-3 h-3" /> },
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

// ─── Main Page ─────────────────────────────────────────────────────────────────
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
    const baseTabs = ["jornada","anamnesis","evaluations","treatment","evolutions","history","financial","atestados","discharge","photos"];
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
    if (journeyPhase === 2) setActiveTab(t => t === "jornada" ? "evolutions" : t);
  }, [journeyPhase]);

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
        <div className="flex justify-center py-24"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>
      </AppLayout>
    );
  }

  if (!patient) {
    return (
      <AppLayout title="Paciente não encontrado">
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <User className="w-16 h-16 mb-4 opacity-20" />
          <p className="text-lg font-semibold text-slate-500">Paciente não encontrado</p>
          <Button variant="ghost" className="mt-4 gap-1.5" onClick={() => setLocation("/pacientes")}>
            <ChevronLeft className="w-4 h-4" /> Voltar à lista
          </Button>
        </div>
      </AppLayout>
    );
  }

  const inits = getInitials(patient.name);
  const sex = (patient as any).sex as SexType;
  const gradient = genderGradient(sex);
  const age = patient.birthDate ? differenceInYears(new Date(), parseISO(patient.birthDate)) : null;
  const isDiscarged = journeyData?.meta?.hasDischarge;

  // ── Tab definitions ──────────────────────────────────────────────────────────
  // Primary row — active clinical workflow
  const primaryTabs = [
    ...(showJornadaTab ? [{ value: "jornada",    icon: <Milestone className="w-3.5 h-3.5" />,    label: "Jornada"    }] : []),
    { value: "anamnesis",   icon: <ClipboardList className="w-3.5 h-3.5" />, label: "Anamnese"   },
    { value: "evaluations", icon: <Activity className="w-3.5 h-3.5" />,      label: "Avaliações" },
    { value: "treatment",   icon: <Target className="w-3.5 h-3.5" />,        label: "Plano"      },
    { value: "evolutions",  icon: <TrendingUp className="w-3.5 h-3.5" />,    label: "Evoluções"  },
  ];

  // Secondary row — grouped by category
  const historyTabs = [
    { value: "history",   icon: <History className="w-3.5 h-3.5" />,   label: "Consultas",  color: "primary" },
    { value: "financial", icon: <DollarSign className="w-3.5 h-3.5" />, label: "Financeiro", color: "primary" },
  ];

  const documentTabs = [
    { value: "photos",    icon: <Camera className="w-3.5 h-3.5" />,     label: "Fotos",     color: "primary" },
    { value: "atestados", icon: <ScrollText className="w-3.5 h-3.5" />, label: "Atestados", color: "primary" },
    { value: "discharge", icon: <LogOut className="w-3.5 h-3.5" />,     label: "Alta",      color: "emerald" },
    ...(isSuperAdmin ? [{ value: "auditoria", icon: <ShieldAlert className="w-3.5 h-3.5" />, label: "Auditoria", color: "slate" }] : []),
  ];

  return (
    <AppLayout
      title={patient.name}
      breadcrumbs={[
        { label: "Pacientes", href: "/pacientes" },
        { label: patient.name },
      ]}
    >

      {/* Dialogs */}
      {canEdit && (
        <EditPatientDialog patient={patient as PatientData} open={editOpen} onClose={() => setEditOpen(false)}
          onSaved={() => { queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}`] }); refetch(); }} />
      )}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir paciente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente e removerá <strong>{patient.name}</strong> e todos os seus dados.
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

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5 items-start">

        {/* ── Sidebar ───────────────────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Profile Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

            {/* ── Gradient header ──────────────────────────────────────────── */}
            <div
              className="relative p-5 pb-5 overflow-hidden"
              style={{ background: gradient.css }}
            >
              {/* Decorative blur circles */}
              <div className="absolute -top-6 -right-6 w-28 h-28 rounded-full bg-white/10 blur-2xl pointer-events-none" />
              <div className="absolute -bottom-8 -left-4 w-24 h-24 rounded-full bg-white/10 blur-2xl pointer-events-none" />

              {/* Back + Actions row */}
              <div className="flex items-center justify-between mb-4 relative">
                <button
                  onClick={() => setLocation("/pacientes")}
                  className="flex items-center gap-1 text-white/75 hover:text-white text-xs font-semibold transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Pacientes
                </button>

                {(canEdit || canDelete || isSuperAdmin) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="w-7 h-7 rounded-lg text-white/70 hover:text-white hover:bg-white/20 transition-colors">
                        <MoreVertical className="w-3.5 h-3.5" />
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

              {/* Avatar + name — vertical centered layout so long names never clip */}
              <div className="flex flex-col items-center text-center gap-3 mb-5 relative">
                <div
                  className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-extrabold text-white shrink-0 shadow-xl ring-[3px] ring-white/30 select-none"
                  style={{ background: "rgba(255,255,255,0.22)", backdropFilter: "blur(10px)" }}
                >
                  {inits}
                </div>
                <div className="w-full">
                  <h2 className="font-extrabold text-lg text-white leading-snug drop-shadow-sm break-words">{patient.name}</h2>
                  <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2">
                    {isDiscarged ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-white/20 text-white px-2.5 py-1 rounded-full border border-white/25 backdrop-blur-sm">
                        <BadgeCheck className="w-2.5 h-2.5" /> Alta emitida
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-400/30 text-white px-2.5 py-1 rounded-full border border-emerald-300/30">
                        <CheckCircle className="w-2.5 h-2.5" /> Ativo
                      </span>
                    )}
                    {age !== null && (
                      <span className="text-[10px] font-semibold text-white/90 bg-white/15 px-2.5 py-1 rounded-full border border-white/20">
                        {age} anos
                      </span>
                    )}
                    {sex && sex !== "O" && (
                      <span className="text-[10px] font-semibold text-white/90 bg-white/15 px-2.5 py-1 rounded-full border border-white/20">
                        {sex === "F" ? "Feminino" : "Masculino"}
                      </span>
                    )}
                    {patient.profession && (
                      <span className="text-[10px] font-semibold text-white/80 bg-white/10 px-2.5 py-1 rounded-full border border-white/15 italic">
                        {patient.profession}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2.5 relative">
                <div className="bg-white/15 backdrop-blur-sm rounded-2xl px-4 py-3 border border-white/20 text-center">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-white/60 mb-1">Consultas</p>
                  <p className="text-3xl font-black text-white tabular-nums leading-none">{patient.totalAppointments || 0}</p>
                </div>
                <div className="bg-white/15 backdrop-blur-sm rounded-2xl px-4 py-3 border border-white/20 text-center">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-white/60 mb-1">Total gasto</p>
                  <p className="text-base font-extrabold text-white tabular-nums leading-tight mt-1">{formatCurrency(patient.totalSpent || 0)}</p>
                </div>
              </div>
            </div>

            {/* ── Card body ─────────────────────────────────────────────────── */}
            <div className="p-4 space-y-4">

              {/* Quick actions */}
              <div className="flex gap-2">
                <a
                  href={whatsappLink(patient.phone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Abrir no WhatsApp"
                  className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white transition-colors shadow-sm"
                >
                  <MessageCircle className="w-4 h-4" />
                </a>
                <div className="flex-1">
                  <ExportProntuarioButton patientId={patientId} patient={patient} />
                </div>
              </div>

              {/* Contact info */}
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 overflow-hidden">
                <ContactRow icon={<Phone className="w-3.5 h-3.5 text-slate-400" />}>
                  <a href={`tel:${patient.phone}`} className="text-sm text-slate-700 hover:text-primary transition-colors font-medium">{patient.phone}</a>
                </ContactRow>
                {patient.email && (
                  <ContactRow icon={<Mail className="w-3.5 h-3.5 text-slate-400" />}>
                    <a href={`mailto:${patient.email}`} className="text-sm text-slate-700 hover:text-primary transition-colors break-all">{patient.email}</a>
                  </ContactRow>
                )}
                {patient.birthDate && (
                  <ContactRow icon={<Calendar className="w-3.5 h-3.5 text-slate-400" />}>
                    <span className="text-sm text-slate-700">{formatDate(patient.birthDate)}{age !== null && <span className="text-slate-400 ml-1.5">({age} anos)</span>}</span>
                  </ContactRow>
                )}
                {patient.address && (
                  <ContactRow icon={<MapPin className="w-3.5 h-3.5 text-slate-400" />}>
                    <span className="text-sm text-slate-600 break-words">{patient.address}</span>
                  </ContactRow>
                )}
                {patient.cpf && (
                  <ContactRow icon={<ShieldCheck className="w-3.5 h-3.5 text-slate-400" />}>
                    <span className="text-xs font-mono text-slate-500 tracking-wider">{displayCpf(patient.cpf)}</span>
                  </ContactRow>
                )}
              </div>

              {/* Emergency contact */}
              {patient.emergencyContact && (
                <div className="flex items-start gap-3 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
                  <ShieldAlert className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[9px] font-bold text-amber-600 uppercase tracking-widest mb-0.5">Contato de emergência</p>
                    <p className="text-sm text-slate-700 break-words">{patient.emergencyContact}</p>
                  </div>
                </div>
              )}

              {/* Clinic notes */}
              {patient.notes && (
                <div className="px-3 py-2.5 rounded-xl bg-primary/[0.04] border border-primary/15">
                  <p className="text-[9px] font-bold text-primary uppercase tracking-widest mb-1 flex items-center gap-1">
                    <Building2 className="w-3 h-3" /> Obs. desta clínica
                  </p>
                  <p className="text-sm text-slate-600 leading-relaxed break-words">{patient.notes}</p>
                </div>
              )}
            </div>
          </div>

          {/* Access requests */}
          {canEdit && patient.cpf && <AccessRequestsPanel cpf={patient.cpf} />}
          {patient.cpf && <OutgoingAccessRequestsPanel cpf={patient.cpf} />}
        </div>

        {/* ── Main Content ──────────────────────────────────────────────────── */}
        <div className="min-w-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">

            {/* ── Tab bar — two rows, no scrollbar ─────────────────────── */}
            <div className="mb-5 space-y-0">

              {/* Row 1 — primary underline tabs */}
              <TabsList className="flex w-full bg-transparent rounded-none border-b border-slate-200 h-auto gap-0 p-0">
                {primaryTabs.map(tab => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className={cn(
                      "flex-1 min-w-0 whitespace-nowrap rounded-none border-b-2 -mb-px h-10 px-2 text-[11px] gap-1 font-medium",
                      "bg-transparent shadow-none transition-colors",
                      "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50/60",
                      tab.value === "jornada"
                        ? "data-[state=active]:border-primary data-[state=active]:text-primary data-[state=inactive]:text-primary/70 data-[state=inactive]:font-semibold"
                        : "data-[state=active]:border-primary data-[state=active]:text-primary",
                      "data-[state=active]:bg-transparent data-[state=active]:shadow-none",
                    )}
                  >
                    {tab.icon}
                    <span className="truncate">{tab.label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* Row 2 — grouped secondary tabs */}
              <TabsList className="flex items-center justify-start gap-1 pt-2 pb-2 px-0 h-auto bg-transparent rounded-none border-b border-slate-100">

                {/* Group: Histórico */}
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-300 pr-1 select-none">Histórico</span>
                {historyTabs.map(tab => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className={cn(
                      "inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium transition-colors",
                      "bg-transparent shadow-none border border-transparent",
                      "text-slate-400 hover:text-slate-600 hover:bg-slate-100",
                      "data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-primary/20",
                    )}
                  >
                    {tab.icon} {tab.label}
                  </TabsTrigger>
                ))}

                {/* Separator */}
                <div className="w-px h-4 bg-slate-200 mx-1.5 shrink-0" />

                {/* Group: Documentos */}
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-300 pr-1 select-none">Documentos</span>
                {documentTabs.map(tab => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className={cn(
                      "inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium transition-colors",
                      "bg-transparent shadow-none border border-transparent",
                      "text-slate-400 hover:text-slate-600 hover:bg-slate-100",
                      tab.color === "emerald"
                        ? "data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700 data-[state=active]:border-emerald-200"
                        : tab.color === "slate"
                        ? "data-[state=active]:bg-slate-100 data-[state=active]:text-slate-700 data-[state=active]:border-slate-300"
                        : "data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-primary/20",
                    )}
                  >
                    {tab.icon} {tab.label}
                  </TabsTrigger>
                ))}

              </TabsList>

            </div>

            {/* ── Tab content ─────────────────────────────────────────────── */}
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

// ─── Contact Row helper ────────────────────────────────────────────────────────
function ContactRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 text-slate-500">
        {icon}
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
