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
import { PhotosTab } from "./photos-tab";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

// ─── Print stack & shared formatters extraídos para _patient-detail/ ──────────
import type { PatientBasic, ClinicInfo, PkgOption, PlanProcedureItem } from "./_patient-detail/types";
import {
  statusConfig,
  formatDate,
  formatDateTime,
  formatCurrency,
  fmtCur,
  todayBRTDate,
  InfoBlock,
} from "./_patient-detail/utils/format";
import {
  ExportProntuarioButton,
  fetchClinicForPrint,
  printDocument,
  generateDischargeHTML,
  generateEvolutionsHTML,
  generatePlanHTML,
  generateContractHTML,
} from "./_patient-detail/utils/print-html";

// ─── Tabs extraídos ────────────────────────────────────────────────────────
import { AtestadosTab } from "./_patient-detail/tabs/AtestadosTab";
import { DischargeTab } from "./_patient-detail/tabs/DischargeTab";
import { FinancialTab } from "./_patient-detail/tabs/FinancialTab";
import { HistoryTab } from "./_patient-detail/tabs/HistoryTab";
import { AuditLogTab } from "./_patient-detail/tabs/AuditLogTab";
import { JornadaTab } from "./_patient-detail/tabs/JornadaTab";
import { EvolutionsTab } from "./_patient-detail/tabs/EvolutionsTab";
import { TreatmentPlanTab } from "./_patient-detail/tabs/TreatmentPlanTab";
import { EvaluationsTab } from "./_patient-detail/tabs/EvaluationsTab";
import { AnamnesisTab } from "./_patient-detail/tabs/AnamnesisTab";


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

function EditPatientDialog({
  patient,
  open,
  onClose,
  onSaved,
}: {
  patient: PatientData;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
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
    // Convert empty strings to undefined for optional fields so the generated
    // API client type (string | undefined) is satisfied. The backend Zod schema
    // treats undefined as "not provided" and stores null in the database.
    const payload = {
      ...form,
      birthDate: form.birthDate || undefined,
      email: form.email || undefined,
      address: form.address || undefined,
      profession: form.profession || undefined,
      emergencyContact: form.emergencyContact || undefined,
      notes: form.notes || undefined,
    };
    mutation.mutate(
      { id: patient.id, data: payload },
      {
        onSuccess: () => {
          toast({ title: "Cadastro atualizado", description: "Os dados do paciente foram salvos com sucesso." });
          onSaved();
          onClose();
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.message ?? "Não foi possível atualizar o cadastro.";
          toast({ variant: "destructive", title: "Erro ao salvar", description: msg });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[620px] border-none shadow-2xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl flex items-center gap-2">
            <Pencil className="w-5 h-5 text-primary" /> Editar Cadastro
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            {isAdmin
              ? "Todos os campos estão disponíveis para edição."
              : "Você pode editar dados de contato e informações pessoais."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* ── Identidade (somente admin) ── */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
              Identificação
              {!isAdmin && (
                <span className="ml-2 inline-flex items-center gap-1 text-slate-300 normal-case tracking-normal font-normal">
                  <Lock className="w-3 h-3" /> restrito ao administrador
                </span>
              )}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700">Nome Completo *</Label>
                <Input
                  required
                  disabled={!isAdmin}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="h-10 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700">CPF *</Label>
                <Input
                  required
                  disabled={!isAdmin}
                  value={form.cpf}
                  onChange={(e) => setForm({ ...form, cpf: maskCpf(e.target.value) })}
                  placeholder="000.000.000-00"
                  className="h-10 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* ── Contato ── */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">Contato</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700">Telefone *</Label>
                <Input
                  required
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })}
                  placeholder="(11) 99999-0000"
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700">E-mail</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="h-10"
                />
              </div>
            </div>
          </div>

          {/* ── Dados Pessoais ── */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">Dados Pessoais</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700">Data de Nascimento</Label>
                <DatePickerPTBR
                  value={form.birthDate}
                  onChange={(v) => setForm({ ...form, birthDate: v })}
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700">Profissão</Label>
                <Input
                  value={form.profession}
                  onChange={(e) => setForm({ ...form, profession: e.target.value })}
                  placeholder="Ex: Professora"
                  className="h-10"
                />
              </div>
            </div>
            <div className="mt-4 space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">Endereço</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Rua, número - Bairro - Cidade"
                className="h-10"
              />
            </div>
          </div>

          {/* ── Emergência + Notas ── */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">Informações Adicionais</p>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-500" /> Contato de Emergência
                </Label>
                <Input
                  value={form.emergencyContact}
                  onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })}
                  placeholder="Nome — Telefone — Parentesco"
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700">Observações</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Observações clínicas ou administrativas relevantes..."
                  className="min-h-[80px] bg-slate-50 border-slate-200 focus:bg-white resize-none"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl">
              Cancelar
            </Button>
            <Button type="submit" className="h-10 px-8 rounded-xl shadow-md shadow-primary/20" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              Salvar Alterações
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

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
    const validTabs = ["jornada","anamnesis","evaluations","treatment","evolutions","history","financial","atestados","discharge","auditoria"];
    return validTabs.includes(tabParam ?? "") ? (tabParam as string) : "jornada";
  });

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
        onError: () => {
          toast({ variant: "destructive", title: "Erro ao excluir", description: "Não foi possível excluir o paciente." });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <AppLayout title="Carregando...">
        <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>
      </AppLayout>
    );
  }

  if (!patient) {
    return (
      <AppLayout title="Paciente não encontrado">
        <div className="flex flex-col items-center justify-center p-20 text-slate-400">
          <User className="w-16 h-16 mb-4 opacity-40" />
          <p className="text-lg font-medium">Paciente não encontrado</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Prontuário do Paciente">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Dialogs */}
        {canEdit && (
          <EditPatientDialog
            patient={patient as PatientData}
            open={editOpen}
            onClose={() => setEditOpen(false)}
            onSaved={() => {
              queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}`] });
              refetch();
            }}
          />
        )}

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir paciente?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação é permanente e removerá <strong>{patient.name}</strong> e todos os seus dados clínicos. Esta operação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                Sim, excluir permanentemente
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="border-none shadow-xl bg-white overflow-hidden">
            <div className="h-28 bg-gradient-to-r from-primary to-primary/60" />
            <CardContent className="px-5 pb-5 pt-0 relative">
              <div className="w-20 h-20 rounded-2xl bg-white shadow-lg flex items-center justify-center text-3xl font-bold text-primary border-4 border-white -mt-10 mb-3">
                {patient.name.charAt(0)}
              </div>
              <h2 className="text-xl font-bold text-foreground leading-tight">{patient.name}</h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary mt-1 mb-4">
                Paciente Ativo
              </span>
              <div className="space-y-2.5 text-sm">
                <div className="flex items-center gap-2.5 text-slate-600">
                  <Phone className="w-4 h-4 text-slate-400 shrink-0" /> {patient.phone}
                </div>
                {patient.email && (
                  <div className="flex items-center gap-2.5 text-slate-600">
                    <Mail className="w-4 h-4 text-slate-400 shrink-0" /> {patient.email}
                  </div>
                )}
                {patient.birthDate && (
                  <div className="flex items-center gap-2.5 text-slate-600">
                    <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>
                      {formatDate(patient.birthDate)}
                      <span className="ml-1.5 px-1.5 py-0.5 bg-primary/10 text-primary text-xs font-semibold rounded-full">
                        {differenceInYears(new Date(), parseISO(patient.birthDate))} anos
                      </span>
                    </span>
                  </div>
                )}
                {patient.address && (
                  <div className="flex items-start gap-2.5 text-slate-600">
                    <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" /> {patient.address}
                  </div>
                )}
                {patient.profession && (
                  <div className="flex items-center gap-2.5 text-slate-600">
                    <UserCheck className="w-4 h-4 text-slate-400 shrink-0" /> {patient.profession}
                  </div>
                )}
                {patient.emergencyContact && (
                  <div className="flex items-start gap-2.5 text-slate-600">
                    <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] text-amber-600 font-semibold uppercase leading-none mb-0.5">Contato de Emergência</p>
                      <p className="text-sm text-slate-700">{patient.emergencyContact}</p>
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-2 gap-3">
                <div className="text-center p-3 bg-slate-50 rounded-xl">
                  <p className="text-[10px] text-slate-500 font-semibold uppercase mb-1">Consultas</p>
                  <p className="text-2xl font-bold text-slate-800">{patient.totalAppointments || 0}</p>
                </div>
                <div className="text-center p-3 bg-slate-50 rounded-xl">
                  <p className="text-[10px] text-slate-500 font-semibold uppercase mb-1">Total Gasto</p>
                  <p className="text-sm font-bold text-slate-800">{formatCurrency(patient.totalSpent || 0)}</p>
                </div>
              </div>
              {patient.cpf && (
                <div className="mt-3 p-3 bg-slate-50 rounded-xl">
                  <p className="text-[10px] text-slate-500 font-semibold uppercase mb-0.5">CPF</p>
                  <p className="text-sm font-medium text-slate-700">{displayCpf(patient.cpf)}</p>
                </div>
              )}
              {patient.notes && (
                <div className="mt-3 p-3 bg-amber-50 rounded-xl border border-amber-100">
                  <p className="text-[10px] text-amber-700 font-semibold uppercase mb-0.5">Observações</p>
                  <p className="text-xs text-amber-800">{patient.notes}</p>
                </div>
              )}

              {/* ── Export PDF ── */}
              <div className="mt-4 pt-4 border-t border-slate-100">
                <ExportProntuarioButton patientId={patientId} patient={patient} />
              </div>

              {/* ── Action buttons ── */}
              {(canEdit || canDelete) && (
                <div className="mt-3 flex flex-col gap-2">
                  {canEdit && (
                    <Button
                      variant="outline"
                      className="w-full h-9 rounded-xl text-sm border-primary/30 text-primary hover:bg-primary/5 hover:border-primary"
                      onClick={() => setEditOpen(true)}
                    >
                      <Pencil className="w-3.5 h-3.5 mr-2" /> Editar Cadastro
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      variant="outline"
                      className="w-full h-9 rounded-xl text-sm border-red-200 text-red-600 hover:bg-red-50 hover:border-red-400"
                      onClick={() => setDeleteOpen(true)}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-2" /> Excluir Paciente
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-2">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="mb-5 space-y-1">
              {/* Jornada do Cliente — featured tab */}
              <TabsList className="w-full bg-gradient-to-r from-primary/5 to-emerald-50 p-1 rounded-xl shadow-sm border border-primary/20 h-auto flex">
                <TabsTrigger
                  value="jornada"
                  className="flex-1 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white text-xs py-2.5 flex items-center justify-center gap-1.5 data-[state=inactive]:text-primary font-semibold"
                >
                  <Milestone className="w-3.5 h-3.5 shrink-0" /> Jornada do Cliente
                </TabsTrigger>
              </TabsList>
              {/* Main 6 tabs — scrollable on mobile, 3-col grid on md+ */}
              <TabsList className="w-full bg-white p-1 rounded-xl shadow-sm border border-slate-200 h-auto flex flex-wrap gap-1">
                {[
                  { value: "anamnesis",   icon: <ClipboardList className="w-3.5 h-3.5 shrink-0" />, label: "Anamnese" },
                  { value: "evaluations", icon: <Activity className="w-3.5 h-3.5 shrink-0" />,      label: "Avaliações" },
                  { value: "treatment",   icon: <Target className="w-3.5 h-3.5 shrink-0" />,         label: "Plano Trat." },
                  { value: "evolutions",  icon: <TrendingUp className="w-3.5 h-3.5 shrink-0" />,     label: "Evoluções" },
                  { value: "history",     icon: <History className="w-3.5 h-3.5 shrink-0" />,        label: "Histórico" },
                  { value: "financial",   icon: <DollarSign className="w-3.5 h-3.5 shrink-0" />,     label: "Financeiro" },
                ].map(tab => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="flex-1 basis-[calc(33.33%-4px)] min-w-[90px] rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white text-xs py-2.5 flex items-center justify-center gap-1.5"
                  >
                    {tab.icon}
                    <span className="truncate">{tab.label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
              {/* Fotos + Atestados + Alta + Auditoria row */}
              <TabsList className="w-full bg-white p-1 rounded-xl shadow-sm border border-dashed border-slate-300 h-auto flex gap-1">
                <TabsTrigger
                  value="photos"
                  className="flex-1 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white text-xs py-2 flex items-center justify-center gap-1.5 data-[state=inactive]:text-slate-500"
                >
                  <Camera className="w-3.5 h-3.5 shrink-0" /> Fotos
                </TabsTrigger>
                <TabsTrigger
                  value="atestados"
                  className="flex-1 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white text-xs py-2 flex items-center justify-center gap-1.5 data-[state=inactive]:text-slate-500"
                >
                  <ScrollText className="w-3.5 h-3.5 shrink-0" /> Atestados
                </TabsTrigger>
                <TabsTrigger
                  value="discharge"
                  className="flex-1 rounded-lg data-[state=active]:bg-green-600 data-[state=active]:text-white text-xs py-2 flex items-center justify-center gap-1.5 data-[state=inactive]:text-slate-500"
                >
                  <LogOut className="w-3.5 h-3.5 shrink-0" /> Alta Fisioterapêutica
                </TabsTrigger>
                {isSuperAdmin && (
                  <TabsTrigger
                    value="auditoria"
                    className="flex-1 rounded-lg data-[state=active]:bg-slate-800 data-[state=active]:text-white text-xs py-2 flex items-center justify-center gap-1.5 data-[state=inactive]:text-slate-500"
                  >
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" /> Auditoria
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            <TabsContent value="jornada"><JornadaTab patientId={patientId} onNavigateToTab={setActiveTab} /></TabsContent>
            <TabsContent value="anamnesis"><AnamnesisTab patientId={patientId} /></TabsContent>
            <TabsContent value="photos"><PhotosTab patientId={patientId} /></TabsContent>
            <TabsContent value="evaluations"><EvaluationsTab patientId={patientId} /></TabsContent>
            <TabsContent value="treatment"><TreatmentPlanTab patientId={patientId} patient={patient ? { name: patient.name, cpf: patient.cpf, birthDate: patient.birthDate, phone: patient.phone } : undefined} /></TabsContent>
            <TabsContent value="evolutions"><EvolutionsTab patientId={patientId} patient={patient ? { name: patient.name, cpf: patient.cpf, birthDate: patient.birthDate, phone: patient.phone } : undefined} /></TabsContent>
            <TabsContent value="history">
              <HistoryTab patientId={patientId} patient={patient ? { name: patient.name, cpf: patient.cpf || "", birthDate: patient.birthDate } : { name: "", cpf: "" }} />
            </TabsContent>
            <TabsContent value="financial"><FinancialTab patientId={patientId} /></TabsContent>
            <TabsContent value="atestados">
              <AtestadosTab patientId={patientId} patient={patient ? { name: patient.name, cpf: patient.cpf || "", birthDate: patient.birthDate } : { name: "", cpf: "" }} />
            </TabsContent>
            <TabsContent value="discharge">
              <DischargeTab patientId={patientId} patient={patient ? { name: patient.name, cpf: patient.cpf, birthDate: patient.birthDate, phone: patient.phone } : undefined} />
            </TabsContent>
            {isSuperAdmin && (
              <TabsContent value="auditoria">
                <AuditLogTab patientId={patientId} />
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>
    </AppLayout>
  );
}
