import { useParams, useLocation } from "wouter";
import { apiFetch, apiFetchJson, apiSendJson } from "@/lib/api";
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
import { useState, useEffect, useRef, useMemo } from "react";
import { useToast } from "@/lib/toast";
import { format, differenceInYears, differenceInDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DatePickerPTBR } from "@/components/ui/date-picker-ptbr";
import { useAuth } from "@/hooks/use-auth";
import { PlanBadge } from "@/components/guards/plan-badge";
import { maskCpf, maskPhone, displayCpf } from "@/utils/masks";
import { PhotosTab } from "../../photos-tab";

// ─── Print stack & shared formatters extraídos para patient-detail/ ──────────
import type { PatientBasic, ClinicInfo, PkgOption, PlanProcedureItem } from "../types";
import {
  statusConfig,
  formatDate,
  formatDateTime,
  formatCurrency,
  fmtCur,
  todayBRTDate,
  todayBRTString,
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

import { TreatmentPlanItemsSection } from "./treatment-plan/TreatmentPlanItemsSection";
import { ObjectivesField } from "./treatment-plan/ObjectivesField";
import { WeeklyAgendaPreview } from "./treatment-plan/WeeklyAgendaPreview";
import { PlanInstallmentsPanel } from "./treatment-plan/PlanInstallmentsPanel";
import { AcceptanceScheduleEditor } from "./treatment-plan/AcceptanceScheduleEditor";

// ─── Treatment Plan Tab ─────────────────────────────────────────────────────────

export function TreatmentPlanTab({ patientId, patient }: { patientId: number; patient?: PatientBasic }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: clinic } = useQuery<ClinicInfo | null>({ queryKey: ["clinic-current"], queryFn: fetchClinicForPrint, staleTime: 60000 });

  // ─── All plans list ──────────────────────────────────────────────────────
  const plansKey = [`/api/patients/${patientId}/treatment-plans`];
  const { data: allPlans = [], isLoading: plansLoading } = useQuery<any[]>({
    queryKey: plansKey,
    queryFn: () => apiFetchJson<any[]>(`/api/patients/${patientId}/treatment-plans`),
    enabled: !!patientId,
  });

  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Auto-select most recent active plan on load
  useEffect(() => {
    if (allPlans.length > 0 && selectedPlanId === null) {
      const active = allPlans.find(p => p.status === "ativo") ?? allPlans[0];
      setSelectedPlanId(active.id);
    }
  }, [allPlans, selectedPlanId]);

  const selectedPlan = allPlans.find(p => p.id === selectedPlanId) ?? null;

  // ─── Plan items for selected plan ───────────────────────────────────────
  const planItemsKey = selectedPlanId ? [`/api/treatment-plans/${selectedPlanId}/procedures`] : null;
  const { data: planItems = [] } = useQuery<PlanProcedureItem[]>({
    queryKey: planItemsKey ?? ["plan-items-disabled"],
    queryFn: () => apiFetchJson<PlanProcedureItem[]>(`/api/treatment-plans/${selectedPlanId}/procedures`),
    enabled: !!selectedPlanId,
  });

  const { data: appointments = [] } = useQuery<any[]>({
    queryKey: [`/api/patients/${patientId}/appointments`],
    queryFn: () => apiFetchJson<any[]>(`/api/patients/${patientId}/appointments`),
    enabled: !!patientId,
  });

  const completedSessions = appointments.filter((a: any) => a.status === "concluido" || a.status === "presenca").length;

  const { data: professionals = [] } = useQuery<{ id: number; name: string; roles: string[] }[]>({
    queryKey: ["/api/users/professionals"],
    queryFn: () => apiFetchJson<{ id: number; name: string; roles: string[] }[]>("/api/users/professionals"),
  });

  // ─── Form state per selected plan ───────────────────────────────────────
  const emptyForm = {
    objectives: "",
    techniques: "",
    frequency: "",
    estimatedSessions: "" as string | number,
    startDate: "",
    responsibleProfessional: "",
    status: "ativo" as "ativo" | "concluido" | "suspenso",
    durationMonths: 12 as number,
    // Sprint 2 — modelo de faturamento e validade de créditos
    paymentMode: "" as "" | "prepago" | "postpago",
    monthlyCreditValidityDays: "" as string | number,
    replacementCreditValidityDays: "" as string | number,
    avulsoBillingMode: "porSessao" as "porSessao" | "mensalConsolidado",
    avulsoBillingDay: "" as string | number,
    // Observações internas — visíveis SOMENTE para a equipe da clínica.
    // Nunca enviadas no contrato impresso, link público de aceite ou e-mail.
    internalNotes: "",
  };
  const [form, setForm] = useState(emptyForm);
  const planItemsInitRef = useRef(false);

  useEffect(() => {
    planItemsInitRef.current = false;
    if (selectedPlan) {
      setForm({
        objectives: selectedPlan.objectives || "",
        techniques: selectedPlan.techniques || "",
        frequency: selectedPlan.frequency || "",
        estimatedSessions: selectedPlan.estimatedSessions || "",
        startDate: selectedPlan.startDate || "",
        responsibleProfessional: selectedPlan.responsibleProfessional || "",
        status: (selectedPlan.status as "ativo" | "concluido" | "suspenso") || "ativo",
        durationMonths: selectedPlan.durationMonths ?? 12,
        paymentMode: (selectedPlan.paymentMode as "" | "prepago" | "postpago") || "",
        monthlyCreditValidityDays: selectedPlan.monthlyCreditValidityDays ?? "",
        replacementCreditValidityDays: selectedPlan.replacementCreditValidityDays ?? "",
        avulsoBillingMode:
          (selectedPlan.avulsoBillingMode as "porSessao" | "mensalConsolidado") || "porSessao",
        avulsoBillingDay: selectedPlan.avulsoBillingDay ?? "",
        internalNotes: selectedPlan.internalNotes || "",
      });
    } else {
      setForm(emptyForm);
    }
  }, [selectedPlanId, allPlans]);

  // Auto-sync sessions/freq from plan items
  useEffect(() => {
    if (!planItemsInitRef.current) { planItemsInitRef.current = true; return; }
    if (planItems.length === 0) return;
    const totalSess = planItems.reduce((s, i) => i.packageType === "mensal" ? s : s + (i.totalSessions ?? 0), 0);
    const spwValues = planItems.map(i => i.sessionsPerWeek ?? 0).filter(v => v > 0);
    const maxSpw = spwValues.length > 0 ? Math.max(...spwValues) : 0;
    const freqStr = maxSpw > 0 ? `${maxSpw}x/semana` : "";
    setForm(f => ({ ...f, ...(totalSess > 0 ? { estimatedSessions: totalSess } : {}), ...(freqStr ? { frequency: freqStr } : {}) }));
  }, [planItems]);

  // ─── Mutations ───────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!selectedPlanId) return;
    setSaving(true);
    try {
      await apiSendJson(`/api/patients/${patientId}/treatment-plans/${selectedPlanId}`, "PUT", {
        ...form,
        estimatedSessions: form.estimatedSessions ? Number(form.estimatedSessions) : null,
        durationMonths: form.durationMonths ? Number(form.durationMonths) : null,
        // Sprint 2 — campos de faturamento (vazio → null para o backend ignorar/limpar)
        paymentMode: form.paymentMode || null,
        monthlyCreditValidityDays:
          form.monthlyCreditValidityDays === "" ? null : Number(form.monthlyCreditValidityDays),
        replacementCreditValidityDays:
          form.replacementCreditValidityDays === ""
            ? null
            : Number(form.replacementCreditValidityDays),
        avulsoBillingMode: form.avulsoBillingMode || "porSessao",
        avulsoBillingDay:
          form.avulsoBillingDay === "" ? null : Number(form.avulsoBillingDay),
        internalNotes: form.internalNotes.trim() ? form.internalNotes : null,
      });
      queryClient.invalidateQueries({ queryKey: plansKey });
      toast({ title: "Plano de tratamento salvo!" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleCreatePlan = async () => {
    setCreatingNew(true);
    try {
      const newPlan = await apiSendJson<any>(`/api/patients/${patientId}/treatment-plans`, "POST", {
        startDate: todayBRTString(),
        status: "ativo",
      });
      queryClient.invalidateQueries({ queryKey: plansKey });
      setSelectedPlanId(newPlan.id);
      toast({ title: "Novo plano de tratamento iniciado!" });
    } catch (err: any) {
      toast({ title: "Erro ao criar plano", description: err.message, variant: "destructive" });
    } finally {
      setCreatingNew(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiSendJson(`/api/patients/${patientId}/treatment-plans/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: plansKey });
      setSelectedPlanId(null);
      setDeletingId(null);
      toast({ title: "Plano excluído com sucesso." });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const handlePrintPlan = () => {
    if (!selectedPlan || !patient) return;
    const html = generatePlanHTML(patient, form, appointments, planItems, clinic);
    printDocument(html, `Plano de Tratamento — ${patient.name}`);
  };

  const handlePrintContract = () => {
    if (!selectedPlan || !patient) return;
    const acceptance = selectedPlan?.acceptedAt
      ? {
          acceptedAt: selectedPlan.acceptedAt,
          acceptedBySignature: selectedPlan.acceptedBySignature ?? null,
          acceptedIp: selectedPlan.acceptedIp ?? null,
          acceptedDevice: selectedPlan.acceptedDevice ?? null,
          acceptedVia: selectedPlan.acceptedVia ?? "presencial",
        }
      : null;
    const html = generateContractHTML(patient, form, planItems, clinic, acceptance);
    printDocument(html, `Contrato — ${patient.name}`);
  };

  if (plansLoading) return <div className="p-8 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary opacity-20" /></div>;

  return (
    <div className="space-y-6">
      {/* Plan selector header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 bg-primary/10 rounded-xl shrink-0">
            <ClipboardList className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-slate-800 truncate">Planos de Tratamento</h3>
            <p className="text-xs text-slate-400 truncate">Gerencie os objetivos e condutas do paciente</p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {allPlans.length > 0 && (
            <Select value={String(selectedPlanId ?? "")} onValueChange={v => setSelectedPlanId(Number(v))}>
              <SelectTrigger className="w-full sm:w-[240px] h-10 bg-slate-50 border-slate-200 rounded-xl">
                <SelectValue placeholder="Selecione um plano..." />
              </SelectTrigger>
              <SelectContent>
                {allPlans.map(p => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.status === "ativo" ? "🟢" : p.status === "concluido" ? "🔵" : "⚪"} Plano {formatDate(p.startDate)} {p.status === "ativo" ? "(Atual)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {allPlans.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="w-full sm:w-auto h-10 gap-1.5 rounded-xl"
              onClick={() => setHistoryOpen(true)}
              title="Ver histórico completo de planos do paciente"
            >
              <History className="w-4 h-4 shrink-0" />
              Histórico
              <span className="ml-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
                {allPlans.length}
              </span>
            </Button>
          )}

          <Button size="sm" variant="outline" className="w-full sm:w-auto h-10 gap-1.5 rounded-xl border-primary/30 text-primary hover:bg-primary/5"
            onClick={handleCreatePlan} disabled={creatingNew}>
            {creatingNew ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Plus className="w-4 h-4 shrink-0" />}
            Novo Plano
          </Button>
        </div>
      </div>

      <PlanHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        plans={allPlans}
        selectedPlanId={selectedPlanId}
        onSelect={(id) => {
          setSelectedPlanId(id);
          setHistoryOpen(false);
        }}
      />

      {selectedPlanId ? (
        <Card className="border-none shadow-sm overflow-hidden bg-white">
          <CardHeader className="border-b border-slate-50 bg-slate-50/30 pb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-base sm:text-lg flex items-center gap-2 min-w-0">
                    <span className="truncate">Detalhes do Tratamento</span>
                    <Badge variant={selectedPlan?.status === "ativo" ? "default" : "secondary"} className="capitalize h-5 text-[10px] shrink-0">
                      {selectedPlan?.status || "Ativo"}
                    </Badge>
                  </CardTitle>
                </div>
                <CardDescription className="text-xs">
                  Iniciado em {formatDate(selectedPlan?.startDate)} • {planItems.length} item(s) vinculados
                </CardDescription>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <Button size="sm" variant="outline" className="flex-1 sm:flex-none h-9 sm:h-8 gap-1 text-xs rounded-xl" onClick={handlePrintPlan}>
                  <Printer className="w-3.5 h-3.5 shrink-0" /> Plano
                </Button>
                <Button size="sm" variant="outline" className="flex-1 sm:flex-none h-9 sm:h-8 gap-1 text-xs rounded-xl" onClick={handlePrintContract}>
                  <ScrollText className="w-3.5 h-3.5 shrink-0" /> Contrato
                </Button>

                <AlertDialog>
                  <Button asChild size="sm" variant="ghost" className="h-9 w-9 sm:h-8 sm:w-8 p-0 text-slate-400 hover:text-red-500 hover:bg-red-50 shrink-0">
                    <div className="cursor-pointer"><Trash2 className="w-4 h-4" /></div>
                  </Button>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir Plano de Tratamento?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta ação não pode ser desfeita. Isso removerá as definições de objetivos, condutas e os vínculos de procedimentos deste plano específico.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteMutation.mutate(selectedPlanId!)}>
                        Sim, Excluir Plano
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {/* Sprint 5 — UI consolidada: Itens / Aceite / Cobrança / Sessões.
                Cada aba isola um aspecto do plano, evitando o scroll-épico do
                modelo anterior em coluna única. As mutações ficam dentro da
                aba "Itens" (campos editáveis); aceite e cobrança são read-only
                após o aceite formal. */}
            <Tabs defaultValue="itens" className="w-full">
              <TabsList className="w-full justify-start gap-1 px-6 pt-4 pb-0 bg-transparent border-b border-slate-100 rounded-none h-auto">
                <TabsTrigger value="itens" className="data-[state=active]:bg-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-none rounded-lg gap-1.5 text-xs">
                  <ClipboardList className="w-3.5 h-3.5" /> Itens
                </TabsTrigger>
                <TabsTrigger value="aceite" className="data-[state=active]:bg-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-none rounded-lg gap-1.5 text-xs">
                  <PenLine className="w-3.5 h-3.5" /> Aceite
                  {selectedPlan?.acceptedAt ? (
                    <BadgeCheck className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                  )}
                </TabsTrigger>
                <TabsTrigger value="cobranca" className="data-[state=active]:bg-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-none rounded-lg gap-1.5 text-xs">
                  <DollarSign className="w-3.5 h-3.5" /> Cobrança
                </TabsTrigger>
                <TabsTrigger value="sessoes" className="data-[state=active]:bg-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-none rounded-lg gap-1.5 text-xs">
                  <Activity className="w-3.5 h-3.5" /> Sessões
                </TabsTrigger>
              </TabsList>

              {/* ── Aba Itens ────────────────────────────────────────────── */}
              <TabsContent value="itens" className="p-6 space-y-6 mt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <ObjectivesField
                    patientId={patientId}
                    value={form.objectives}
                    onChange={(v) => setForm({ ...form, objectives: v })}
                  />
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      <Stethoscope className="w-4 h-4 text-primary" /> Condutas e Técnicas
                    </Label>
                    <Textarea
                      className="min-h-[140px] bg-slate-50 border-slate-200 focus:bg-white transition-colors"
                      placeholder="Quais técnicas serão aplicadas? (ex: liberação miofascial, exercícios cinesioterapêuticos...)"
                      value={form.techniques} onChange={e => setForm({ ...form, techniques: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2 max-w-md">
                  <Label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-primary" /> Profissional Responsável
                  </Label>
                  <Select value={form.responsibleProfessional} onValueChange={v => setForm({ ...form, responsibleProfessional: v })}>
                    <SelectTrigger className="bg-slate-50 border-slate-200 focus:bg-white">
                      <SelectValue placeholder="Selecionar profissional..." />
                    </SelectTrigger>
                    <SelectContent>
                      {professionals.length === 0 && <SelectItem value="__none" disabled>Nenhum profissional cadastrado</SelectItem>}
                      {professionals.map(p => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                      Frequência
                      {planItems.length > 0 && <span className="text-[10px] text-slate-400 font-normal">— calculado dos itens</span>}
                    </Label>
                    <Input className="bg-slate-50 border-slate-200 focus:bg-white"
                      value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })} placeholder="Ex: 3x/semana..." />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-slate-700">Data de Início</Label>
                    <DatePickerPTBR className="bg-slate-50 border-slate-200 focus:bg-white h-9"
                      value={form.startDate} onChange={(v) => setForm({ ...form, startDate: v })} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                      Sessões Estimadas
                      {planItems.length > 0 && <span className="text-[10px] text-slate-400 font-normal">— calculado dos itens</span>}
                    </Label>
                    <Input type="number" min={1} className="bg-slate-50 border-slate-200 focus:bg-white"
                      value={form.estimatedSessions} onChange={e => setForm({ ...form, estimatedSessions: e.target.value })} placeholder="Ex: 20" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-slate-700">Status do Tratamento</Label>
                    <Select value={form.status} onValueChange={(v: "ativo" | "concluido" | "suspenso") => setForm({ ...form, status: v })}>
                      <SelectTrigger className="bg-slate-50 border-slate-200 w-48"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ativo">Ativo</SelectItem>
                        <SelectItem value="concluido">Concluído</SelectItem>
                        <SelectItem value="suspenso">Suspenso</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-slate-700">Prazo do plano (meses)</Label>
                    <Select
                      value={String(form.durationMonths ?? 12)}
                      onValueChange={v => setForm({ ...form, durationMonths: Number(v) })}
                    >
                      <SelectTrigger className="bg-slate-50 border-slate-200 w-48"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 6, 12, 24, 36].map(m => (
                          <SelectItem key={m} value={String(m)}>{m} {m === 1 ? "mês" : "meses"}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-slate-400">
                      Define até quando as consultas e faturas mensais serão geradas.
                    </p>
                  </div>
                </div>

                {/* ── Observações internas (não saem em contrato/link público) ── */}
                <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-sm font-semibold text-amber-900 flex items-center gap-2">
                      <Lock className="w-4 h-4" /> Observações internas (uso da equipe)
                    </Label>
                    <span className="text-[10px] text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-medium">
                      Não impresso no contrato
                    </span>
                  </div>
                  <Textarea
                    className="min-h-[90px] bg-white border-amber-200 focus:border-amber-400 transition-colors text-sm"
                    placeholder="Combinados com a recepção, particularidades de convênio, lembretes do profissional… Visível apenas dentro do sistema."
                    value={form.internalNotes}
                    onChange={e => setForm({ ...form, internalNotes: e.target.value })}
                    maxLength={5000}
                  />
                  <p className="text-[11px] text-amber-700/80">
                    Estas notas <strong>não aparecem</strong> no contrato impresso,
                    no link público de aceite nem em mensagens enviadas ao paciente.
                    {form.internalNotes.length > 0 && (
                      <span className="text-amber-600 ml-1">
                        ({form.internalNotes.length}/5000)
                      </span>
                    )}
                  </p>
                </div>

                <TreatmentPlanItemsSection planId={selectedPlanId ?? undefined} planItems={planItems} planItemsKey={planItemsKey} />

                <div className="pt-3 flex sm:justify-end">
                  <Button onClick={handleSave} className="w-full sm:w-auto h-11 sm:px-8 rounded-xl shadow-md shadow-primary/20 gap-1.5" disabled={saving}>
                    {saving && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                    Salvar Plano
                  </Button>
                </div>
              </TabsContent>

              {/* ── Aba Aceite ───────────────────────────────────────────── */}
              <TabsContent value="aceite" className="p-6 space-y-6 mt-0">
                <AcceptanceScheduleEditor
                  planId={selectedPlanId!}
                  planItems={planItems as any}
                  planItemsKey={planItemsKey}
                  isMaterialized={!!selectedPlan?.materializedAt}
                  isAccepted={!!selectedPlan?.acceptedAt}
                />

                <AcceptanceBlock
                  patientId={patientId}
                  planId={selectedPlanId!}
                  plan={selectedPlan}
                  patientName={patient?.name ?? ""}
                  patientPhone={patient?.phone ?? null}
                  patientEmail={(patient as any)?.email ?? null}
                  clinicName={clinic?.name ?? null}
                  onChanged={() => {
                    queryClient.invalidateQueries({ queryKey: plansKey });
                    queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/financial-records`] });
                    queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/credits`] });
                  }}
                />

                <WeeklyAgendaPreview
                  planItems={planItems as any}
                  startDate={selectedPlan?.startDate ?? form.startDate ?? null}
                  durationMonths={selectedPlan?.durationMonths ?? form.durationMonths ?? 12}
                />

                <MaterializeBlock
                  planId={selectedPlanId!}
                  materializedAt={selectedPlan?.materializedAt ?? null}
                  planItems={planItems}
                  onChanged={() => {
                    queryClient.invalidateQueries({ queryKey: plansKey });
                    queryClient.invalidateQueries({ queryKey: planItemsKey ?? [] });
                    queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/appointments`] });
                    queryClient.invalidateQueries({ queryKey: [`/api/treatment-plans/${selectedPlanId}/installments`] });
                  }}
                />
              </TabsContent>

              {/* ── Aba Cobrança ─────────────────────────────────────────── */}
              <TabsContent value="cobranca" className="p-6 space-y-6 mt-0">
                <PlanInstallmentsPanel
                  patientId={patientId}
                  planId={selectedPlanId!}
                  isAccepted={!!selectedPlan?.acceptedAt}
                  isMaterialized={!!selectedPlan?.materializedAt}
                />

                <BillingSettingsBlock
                  form={form}
                  setForm={setForm}
                  isAccepted={!!selectedPlan?.acceptedAt}
                />

                {selectedPlan?.acceptedAt && form.avulsoBillingMode === "mensalConsolidado" && (
                  <CloseMonthBlock
                    patientId={patientId}
                    planId={selectedPlanId!}
                    onClosed={() => {
                      queryClient.invalidateQueries({ queryKey: plansKey });
                      queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/appointments`] });
                      queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/financial-records`] });
                    }}
                  />
                )}

                <CreditsStatementBlock patientId={patientId} />
              </TabsContent>

              {/* ── Aba Sessões ──────────────────────────────────────────── */}
              <TabsContent value="sessoes" className="p-6 space-y-6 mt-0">
                {(form.estimatedSessions || completedSessions > 0) ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-primary" /> Progresso Geral de Sessões
                      </Label>
                      <span className={`text-sm font-bold ${form.estimatedSessions && completedSessions >= Number(form.estimatedSessions) ? "text-green-600" : "text-primary"}`}>
                        {completedSessions} / {form.estimatedSessions || "—"}
                      </span>
                    </div>
                    {form.estimatedSessions ? (
                      <>
                        <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                          <div className={`h-2.5 rounded-full transition-all duration-500 ${completedSessions >= Number(form.estimatedSessions) ? "bg-green-500" : "bg-primary"}`}
                            style={{ width: `${Math.min(100, (completedSessions / Number(form.estimatedSessions)) * 100)}%` }} />
                        </div>
                        <p className="text-xs text-slate-400">
                          {completedSessions >= Number(form.estimatedSessions)
                            ? "✓ Meta atingida! Considere registrar a alta."
                            : `${Math.max(0, Number(form.estimatedSessions) - completedSessions)} sessão(ões) restante(s)`}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-slate-400">{completedSessions} sessão(ões) concluída(s). Defina o total estimado na aba "Itens" para ver o progresso.</p>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 space-y-2">
                    <Activity className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="text-sm text-slate-500">Ainda não há sessões realizadas neste plano.</p>
                    <p className="text-xs text-slate-400">Defina o total estimado na aba "Itens" para acompanhar o progresso.</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-none shadow-sm">
          <CardContent className="p-10 text-center">
            <div className="space-y-3">
              <p className="text-slate-400 text-sm">Nenhum plano selecionado.</p>
              <Button size="sm" variant="outline" className="gap-1.5 rounded-xl border-primary/30 text-primary hover:bg-primary/5"
                onClick={handleCreatePlan} disabled={creatingNew}>
                {creatingNew ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Criar Primeiro Plano
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Evolutions Tab ─────────────────────────────────────────────────────────────


// ─── Evolution Templates ──────────────────────────────────────────────────────

// ─── Materialização do plano ────────────────────────────────────────────────
function MaterializeBlock({
  planId, materializedAt, planItems, onChanged,
}: {
  planId: number;
  materializedAt: string | null;
  planItems: any[];
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<"materialize" | "dematerialize" | null>(null);
  const [confirmDematerialize, setConfirmDematerialize] = useState(false);

  const monthlyItems = planItems.filter(i => i.packageType === "mensal");
  const hasMonthly = monthlyItems.length > 0;
  const isMaterialized = !!materializedAt;

  const totalApptsEstimate = monthlyItems.reduce((sum, i) => {
    let weekDaysCount = 0;
    try {
      const wd = i.weekDays ? (typeof i.weekDays === "string" ? JSON.parse(i.weekDays) : i.weekDays) : [];
      weekDaysCount = Array.isArray(wd) ? wd.length : 0;
    } catch { weekDaysCount = 0; }
    return sum + weekDaysCount * 4 * 12; // ~4 sem/mês × 12 meses
  }, 0);

  async function doMaterialize() {
    setBusy("materialize");
    try {
      const res = await apiSendJson<any>(`/api/treatment-plans/${planId}/materialize`, "POST", {});
      toast({
        title: "Plano materializado!",
        description: `Geradas ${res.appointmentsCreated ?? "?"} consultas e ${res.invoicesCreated ?? "?"} faturas mensais.`,
      });
      onChanged();
    } catch (err: any) {
      toast({ title: "Erro ao materializar", description: err.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function doDematerialize() {
    setBusy("dematerialize");
    try {
      const res = await apiSendJson<any>(`/api/treatment-plans/${planId}/materialize`, "DELETE", {});
      toast({
        title: "Materialização revertida",
        description: `Removidos ${res.appointmentsDeleted ?? "?"} consultas e ${res.invoicesDeleted ?? "?"} faturas.`,
      });
      onChanged();
      setConfirmDematerialize(false);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  if (!hasMonthly) return null;

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CalendarDays className="w-4 h-4 text-primary" />
        <h4 className="text-sm font-semibold text-slate-700">Geração de consultas e faturas</h4>
      </div>
      {isMaterialized ? (
        <div className="space-y-2">
          <p className="text-xs text-slate-600 flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-green-600" />
            Plano materializado em {new Date(materializedAt!).toLocaleDateString("pt-BR")}.
            Consultas e faturas mensais já estão na agenda e no financeiro.
          </p>
          <Button
            size="sm" variant="outline"
            className="h-8 gap-1.5 rounded-lg border-red-300 text-red-600 hover:bg-red-50"
            onClick={() => setConfirmDematerialize(true)}
            disabled={busy !== null}
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reverter materialização
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-600">
            Será gerada uma agenda completa do plano: aproximadamente
            {" "}<strong>{totalApptsEstimate} consultas</strong> e
            {" "}<strong>{monthlyItems.length * 12} faturas mensais</strong>{" "}
            (uma por mês de cada item de pacote mensal).
          </p>
          <p className="text-[11px] text-slate-400">
            Os dias da semana, horário e profissional definidos em cada item serão usados para criar as consultas.
          </p>
          <Button
            size="sm"
            className="h-9 gap-1.5 rounded-lg shadow-md shadow-primary/20"
            onClick={doMaterialize}
            disabled={busy !== null}
          >
            {busy === "materialize" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Materializar plano
          </Button>
        </div>
      )}

      <AlertDialog open={confirmDematerialize} onOpenChange={setConfirmDematerialize}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reverter materialização?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso apaga todas as consultas futuras (status agendado) e faturas pendentes
              não pagas vinculadas a este plano. Faturas já pagas permanecem.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy !== null}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={(e) => { e.preventDefault(); doDematerialize(); }}
              disabled={busy !== null}
            >
              {busy === "dematerialize" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sim, reverter"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Sprint 2 — Faturamento e validade de créditos ──────────────────────────
function BillingSettingsBlock({
  form, setForm, isAccepted,
}: {
  form: any;
  setForm: (fn: (prev: any) => any) => void;
  isAccepted: boolean;
}) {
  const lockMode = isAccepted; // paymentMode é comercial — após aceite, só renegociação muda
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <DollarSign className="w-4 h-4 text-amber-700" />
        <h4 className="text-sm font-semibold text-slate-700">Faturamento e validade de créditos</h4>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-600">Modo de pagamento</Label>
          <Select
            value={form.paymentMode || "_default"}
            onValueChange={(v) =>
              setForm((p: any) => ({ ...p, paymentMode: v === "_default" ? "" : v }))
            }
            disabled={lockMode}
          >
            <SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_default">Padrão do pacote</SelectItem>
              <SelectItem value="prepago">Pré-pago (cobrar antes)</SelectItem>
              <SelectItem value="postpago">Pós-pago (cobrar após uso)</SelectItem>
            </SelectContent>
          </Select>
          {lockMode && (
            <p className="text-[11px] text-slate-400">
              Já aceito — para mudar, use renegociação.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-slate-600">Cobrança de itens avulsos</Label>
          <Select
            value={form.avulsoBillingMode || "porSessao"}
            onValueChange={(v: "porSessao" | "mensalConsolidado") =>
              setForm((p: any) => ({ ...p, avulsoBillingMode: v }))
            }
          >
            <SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="porSessao">Por sessão (uma fatura por consulta)</SelectItem>
              <SelectItem value="mensalConsolidado">Mensal consolidado (uma fatura/mês)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-slate-600">
            Validade do crédito mensal (dias após o fim do mês)
          </Label>
          <Input
            type="number" min="0" max="365"
            placeholder="Padrão da clínica"
            value={form.monthlyCreditValidityDays}
            onChange={(e) =>
              setForm((p: any) => ({ ...p, monthlyCreditValidityDays: e.target.value }))
            }
            className="h-9 bg-white"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-slate-600">
            Validade do crédito de reposição (dias)
          </Label>
          <Input
            type="number" min="1" max="365"
            placeholder="Padrão da clínica"
            value={form.replacementCreditValidityDays}
            onChange={(e) =>
              setForm((p: any) => ({ ...p, replacementCreditValidityDays: e.target.value }))
            }
            className="h-9 bg-white"
          />
        </div>

        {form.avulsoBillingMode === "mensalConsolidado" && (
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">
              Dia do vencimento da fatura mensal
            </Label>
            <Input
              type="number" min="1" max="28"
              placeholder="Ex: 10"
              value={form.avulsoBillingDay}
              onChange={(e) =>
                setForm((p: any) => ({ ...p, avulsoBillingDay: e.target.value }))
              }
              className="h-9 bg-white"
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sprint 4 — Botão de fechamento mensal de avulsos ───────────────────────
function CloseMonthBlock({
  patientId, planId, onClosed,
}: {
  patientId: number;
  planId: number;
  onClosed: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [ref, setRef] = useState(() => new Date().toISOString().slice(0, 7));

  async function doClose() {
    setBusy(true);
    try {
      const res = await apiSendJson<any>(
        `/api/patients/${patientId}/treatment-plans/${planId}/close-month?ref=${ref}`,
        "POST", {},
      );
      if (res?.alreadyClosed) {
        toast({ title: "Mês já fechado", description: `Fatura #${res.financialRecordId} já existe.` });
      } else {
        toast({
          title: "Mês fechado!",
          description: `Fatura consolidada criada: R$ ${Number(res?.amount ?? 0).toFixed(2)} — ${res?.sessionsCount ?? 0} sessão(ões).`,
        });
      }
      onClosed();
    } catch (err: any) {
      toast({ title: "Erro ao fechar mês", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <CalendarDays className="w-4 h-4 text-blue-700" />
        <h4 className="text-sm font-semibold text-slate-700">Fechar mês de avulsos</h4>
      </div>
      <p className="text-xs text-slate-600">
        Consolida todas as sessões avulsas concluídas do mês em uma única fatura.
        A operação é idempotente.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="month" value={ref}
          onChange={(e) => setRef(e.target.value)}
          className="h-9 w-44 bg-white"
        />
        <Button
          size="sm"
          className="h-9 gap-1.5 rounded-lg"
          onClick={doClose}
          disabled={busy || !ref}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          Fechar mês
        </Button>
      </div>
    </div>
  );
}

// ─── Sprint 3 — Extrato de créditos do paciente ─────────────────────────────
function CreditsStatementBlock({ patientId }: { patientId: number }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery<any>({
    queryKey: [`/api/patients/${patientId}/session-credits/statement`],
    queryFn: () =>
      apiFetchJson<any>(`/api/patients/${patientId}/session-credits/statement`),
    enabled: open && !!patientId,
  });

  const labelsByOrigin: Record<string, string> = {
    mensal: "Pacote mensal",
    avulso: "Avulso",
    pacoteFechado: "Pacote fechado",
    reposicaoFalta: "Reposição (falta)",
    reposicaoRemarcacao: "Reposição (cancelamento)",
    cortesia: "Cortesia",
    ajuste: "Ajuste manual",
  };
  const labelsByStatus: Record<string, string> = {
    disponivel: "Disponível",
    pendentePagamento: "Pendente pagamento",
    consumido: "Consumido",
    expirado: "Expirado",
    estornado: "Estornado",
  };
  const colorByStatus: Record<string, string> = {
    disponivel: "bg-emerald-100 text-emerald-700 border-emerald-200",
    pendentePagamento: "bg-amber-100 text-amber-700 border-amber-200",
    consumido: "bg-slate-100 text-slate-600 border-slate-200",
    expirado: "bg-red-100 text-red-700 border-red-200",
    estornado: "bg-purple-100 text-purple-700 border-purple-200",
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <span className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          Extrato de créditos do paciente
        </span>
        <span className="text-xs text-slate-400">{open ? "Recolher" : "Expandir"}</span>
      </button>
      {open && (
        <div className="border-t border-slate-100 p-4 space-y-3">
          {isLoading && (
            <div className="text-center py-6">
              <Loader2 className="w-5 h-5 animate-spin mx-auto text-primary opacity-30" />
            </div>
          )}
          {!isLoading && data && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                {(["disponivel", "pendentePagamento", "consumido", "expirado", "estornado"] as const).map((s) => (
                  <div key={s} className={`rounded-lg border px-2 py-2 ${colorByStatus[s]}`}>
                    <p className="text-[11px] font-medium">{labelsByStatus[s]}</p>
                    <p className="text-base font-bold">
                      {data.totalsByStatus?.[s]?.remaining ?? 0}
                    </p>
                  </div>
                ))}
              </div>
              {Array.isArray(data.entries) && data.entries.length === 0 && (
                <p className="text-center text-xs text-slate-400 py-4">
                  Nenhum crédito registrado.
                </p>
              )}
              {Array.isArray(data.entries) && data.entries.length > 0 && (
                <div className="overflow-x-auto -mx-4">
                  <table className="w-full text-xs">
                    <thead className="text-slate-500 bg-slate-50">
                      <tr className="text-left">
                        <th className="px-3 py-2 font-medium">Procedimento</th>
                        <th className="px-3 py-2 font-medium">Origem</th>
                        <th className="px-3 py-2 font-medium">Mês ref.</th>
                        <th className="px-3 py-2 font-medium">Validade</th>
                        <th className="px-3 py-2 font-medium text-right">Restante</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.entries.slice(0, 50).map((e: any) => (
                        <tr key={e.id} className="hover:bg-slate-50/60">
                          <td className="px-3 py-2 text-slate-700">{e.procedureName ?? "—"}</td>
                          <td className="px-3 py-2 text-slate-600">
                            {labelsByOrigin[e.origin] ?? e.origin}
                          </td>
                          <td className="px-3 py-2 text-slate-500">{e.monthRef ?? "—"}</td>
                          <td className="px-3 py-2 text-slate-500">
                            {e.validUntil
                              ? new Date(e.validUntil).toLocaleDateString("pt-BR")
                              : "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-700">
                            {Math.max(0, (e.quantity ?? 0) - (e.usedQuantity ?? 0))}
                            <span className="text-slate-400 font-normal"> / {e.quantity}</span>
                          </td>
                          <td className="px-3 py-2">
                            <span className={`inline-block rounded px-1.5 py-0.5 border text-[10px] ${colorByStatus[e.status] ?? ""}`}>
                              {labelsByStatus[e.status] ?? e.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data.entries.length > 50 && (
                    <p className="text-[11px] text-slate-400 text-center py-2">
                      Exibindo 50 de {data.entries.length} créditos.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sprint 2 — Aceite formal do plano (LGPD trail) ─────────────────────────
//
// Antes do aceite: dois caminhos visíveis ao operador:
//   1) Coletar aceite presencial (modal com nome completo).
//   2) Gerar link público (válido 7 dias) p/ o paciente abrir e aceitar remoto.
//
// Após aceite: trilha imutável (data, nome, IP, dispositivo, via).

/**
 * Monta a URL `https://wa.me/<telefone>?text=...` a partir de um telefone
 * livre (com máscara, parênteses, traços etc.). Removemos tudo que não é
 * dígito; se o telefone tiver 10 ou 11 dígitos (formato BR sem DDI),
 * prefixamos com 55. Telefones que já vêm com DDI são preservados.
 */
function buildWhatsAppUrl(rawPhone: string, message: string): string {
  const digits = rawPhone.replace(/\D/g, "");
  const withCountry = digits.length === 10 || digits.length === 11
    ? `55${digits}`
    : digits;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`;
}

/**
 * Monta um `mailto:` clássico — o cliente de e-mail do dispositivo abre com
 * destinatário, assunto e corpo já preenchidos.
 */
function buildMailtoUrl(
  to: string,
  opts: { subject: string; body: string },
): string {
  const params = new URLSearchParams();
  params.set("subject", opts.subject);
  params.set("body", opts.body);
  // URLSearchParams troca espaço por '+', mas mailto espera %20.
  const qs = params.toString().replace(/\+/g, "%20");
  return `mailto:${to}?${qs}`;
}

/**
 * Texto-padrão amistoso que vai dentro da mensagem do WhatsApp e no corpo do
 * e-mail. Mantemos curto e escaneável; o link aparece em linha própria para
 * que os apps detectem como hyperlink.
 */
function buildShareMessage(opts: {
  patientName: string;
  clinicName: string | null;
  url: string;
  expiresAt: string;
}): string {
  const firstName = (opts.patientName || "").trim().split(/\s+/)[0] || "";
  const greet = firstName ? `Olá, ${firstName}!` : "Olá!";
  const clinicLine = opts.clinicName
    ? `Aqui é da ${opts.clinicName}.`
    : "Aqui é da clínica.";
  const expires = new Date(opts.expiresAt).toLocaleDateString("pt-BR");
  return [
    greet,
    "",
    `${clinicLine} Preparamos seu contrato do plano de tratamento.`,
    "Para revisar e assinar digitalmente, acesse o link abaixo:",
    "",
    opts.url,
    "",
    `O link é pessoal e fica disponível até ${expires}.`,
    "Qualquer dúvida, é só responder esta mensagem.",
  ].join("\n");
}

function AcceptanceBlock({
  patientId, planId, plan, onChanged,
  patientName, patientPhone, patientEmail, clinicName,
}: {
  patientId: number;
  planId: number;
  plan: any;
  onChanged: () => void;
  patientName: string;
  patientPhone: string | null;
  patientEmail: string | null;
  clinicName: string | null;
}) {
  const { toast } = useToast();
  const [openPresencial, setOpenPresencial] = useState(false);
  const [openLink, setOpenLink] = useState(false);
  const [signature, setSignature] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [linkInfo, setLinkInfo] = useState<{ url: string; expiresAt: string; reused: boolean } | null>(null);

  const isAccepted = !!plan?.acceptedAt;

  async function handlePresencial() {
    if (!signature.trim() || !agreed) return;
    setBusy(true);
    try {
      await apiSendJson(`/api/patients/${patientId}/treatment-plans/${planId}/accept`, "POST", {
        signature: signature.trim(),
      });
      toast({
        title: "Plano aceito!",
        description: "Faturas e créditos do mês foram gerados (sem agendamentos automáticos).",
      });
      setOpenPresencial(false);
      setSignature("");
      setAgreed(false);
      onChanged();
    } catch (err: any) {
      toast({
        title: "Erro ao aceitar plano",
        description: err?.message ?? "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateLink() {
    setBusy(true);
    try {
      const res = await apiSendJson<{ url: string; expiresAt: string; reused: boolean }>(
        `/api/patients/${patientId}/treatment-plans/${planId}/public-link`, "POST", {},
      );
      setLinkInfo(res);
      setOpenLink(true);
    } catch (err: any) {
      toast({
        title: "Não foi possível gerar o link",
        description: err?.message ?? "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  if (isAccepted) {
    const acceptedAt = plan.acceptedAt ? new Date(plan.acceptedAt) : null;
    const via = (plan.acceptedVia ?? "presencial") as string;
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-2">
        <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
          <BadgeCheck className="w-4 h-4" /> Plano aceito formalmente
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-700">
          <div>
            <span className="text-slate-500">Data:</span>{" "}
            <span className="font-medium">
              {acceptedAt ? acceptedAt.toLocaleString("pt-BR") : "—"}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Via:</span>{" "}
            <span className="font-medium capitalize">{via}</span>
          </div>
          {plan.acceptedBySignature && (
            <div className="sm:col-span-2">
              <span className="text-slate-500">Assinatura:</span>{" "}
              <span className="font-medium">{plan.acceptedBySignature}</span>
            </div>
          )}
          {plan.acceptedIp && (
            <div>
              <span className="text-slate-500">IP:</span>{" "}
              <span className="font-mono">{plan.acceptedIp}</span>
            </div>
          )}
          {plan.acceptedDevice && (
            <div className="sm:col-span-2 truncate">
              <span className="text-slate-500">Dispositivo:</span>{" "}
              <span className="font-mono text-[11px]">{plan.acceptedDevice}</span>
            </div>
          )}
        </div>
        <p className="text-[11px] text-slate-500 pt-1 border-t border-emerald-100">
          Trilha LGPD imutável. Alterações comerciais agora exigem renegociação (novo plano vinculado).
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-3">
        <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
          <PenLine className="w-4 h-4" /> Aceite formal pendente
        </div>
        <p className="text-xs text-slate-600">
          O aceite congela os preços vigentes e gera as faturas iniciais. NÃO cria
          agendamentos — use "Materializar agenda" abaixo se desejar a grade automática.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            type="button"
            size="sm"
            className="gap-1.5 rounded-xl"
            onClick={() => setOpenPresencial(true)}
            disabled={busy}
          >
            <ClipboardCheck className="w-4 h-4" /> Coletar aceite presencial
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5 rounded-xl"
            onClick={handleGenerateLink}
            disabled={busy}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            Gerar link de aceite (7 dias)
          </Button>
        </div>
      </div>

      <Dialog open={openPresencial} onOpenChange={setOpenPresencial}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Aceite presencial</DialogTitle>
            <DialogDescription>
              Peça ao paciente que digite o nome completo. Capturamos data, IP e
              dispositivo para a trilha LGPD.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="acc-sig">Nome completo (assinatura)</Label>
              <input
                id="acc-sig"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 focus:border-primary outline-none"
                placeholder="Ex.: Maria da Silva Souza"
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                autoFocus
              />
            </div>
            <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span>
                O paciente leu e concorda com os procedimentos, valores e condições
                deste plano.
              </span>
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpenPresencial(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={handlePresencial} disabled={busy || !signature.trim() || !agreed}>
              {busy && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />} Confirmar aceite
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openLink} onOpenChange={setOpenLink}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Link de aceite gerado</DialogTitle>
            <DialogDescription>
              Envie ao paciente. Válido até{" "}
              {linkInfo ? new Date(linkInfo.expiresAt).toLocaleString("pt-BR") : "—"}.
              {linkInfo?.reused && " (link existente reaproveitado)"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-mono break-all">
              {linkInfo?.url ?? ""}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={async () => {
                  if (!linkInfo) return;
                  try {
                    await navigator.clipboard.writeText(linkInfo.url);
                    toast({ title: "Link copiado!" });
                  } catch {
                    toast({ title: "Não foi possível copiar", variant: "destructive" });
                  }
                }}
              >
                <Paperclip className="w-4 h-4" /> Copiar
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                disabled={!patientPhone}
                title={!patientPhone ? "Paciente sem telefone cadastrado" : "Abrir WhatsApp"}
                onClick={() => {
                  if (!linkInfo || !patientPhone) return;
                  const wa = buildWhatsAppUrl(patientPhone, buildShareMessage({
                    patientName, clinicName, url: linkInfo.url, expiresAt: linkInfo.expiresAt,
                  }));
                  window.open(wa, "_blank", "noopener,noreferrer");
                }}
              >
                <Phone className="w-4 h-4" /> WhatsApp
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={!patientEmail}
                title={!patientEmail ? "Paciente sem e-mail cadastrado" : "Abrir e-mail"}
                onClick={() => {
                  if (!linkInfo) return;
                  const mailto = buildMailtoUrl(patientEmail ?? "", {
                    subject: `Contrato de plano de tratamento — ${clinicName ?? "Clínica"}`,
                    body: buildShareMessage({
                      patientName, clinicName, url: linkInfo.url, expiresAt: linkInfo.expiresAt,
                    }),
                  });
                  window.location.href = mailto;
                }}
              >
                <Mail className="w-4 h-4" /> E-mail
              </Button>
            </div>

            {(!patientPhone || !patientEmail) && (
              <p className="text-[11px] text-slate-500">
                {!patientPhone && "Cadastre um telefone no paciente para enviar via WhatsApp. "}
                {!patientEmail && "Cadastre um e-mail no paciente para enviar por e-mail."}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Histórico de planos do paciente ────────────────────────────────────────
//
// Diálogo com listagem cronológica (mais recente no topo) de TODOS os planos
// já criados para o paciente, com filtro por status. Permite ao operador
// pular para qualquer plano antigo (renegociado, cancelado, concluído) sem
// precisar contar com o dropdown no header.
//
// Cada cartão mostra: status, datas (início → fim), profissional, prazo,
// trilha de aceite (se houver) e um destaque visual no plano atualmente
// selecionado.
type PlanHistoryFilter = "todos" | "ativo" | "concluido" | "cancelado";

function PlanHistoryDialog({
  open, onOpenChange, plans, selectedPlanId, onSelect,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plans: any[];
  selectedPlanId: number | null;
  onSelect: (id: number) => void;
}) {
  const [filter, setFilter] = useState<PlanHistoryFilter>("todos");

  // Reseta o filtro toda vez que o diálogo abre, para que a navegação não
  // surpreenda o operador com um filtro residual de uma sessão anterior.
  useEffect(() => {
    if (open) setFilter("todos");
  }, [open]);

  // Contagem por status para exibir nas pills do filtro.
  const counts = useMemo(() => {
    const c = { todos: plans.length, ativo: 0, concluido: 0, cancelado: 0 };
    for (const p of plans) {
      const s = (p.status as string) ?? "ativo";
      if (s === "ativo") c.ativo += 1;
      else if (s === "concluido") c.concluido += 1;
      else if (s === "cancelado") c.cancelado += 1;
    }
    return c;
  }, [plans]);

  // Lista filtrada e ordenada por data de início desc (mais recente primeiro).
  // Plano sem startDate vai para o final — improvável, mas mantém estabilidade.
  const sorted = useMemo(() => {
    const filtered = filter === "todos"
      ? plans
      : plans.filter((p) => (p.status ?? "ativo") === filter);
    return [...filtered].sort((a, b) => {
      const da = a.startDate ? new Date(a.startDate).getTime() : 0;
      const db = b.startDate ? new Date(b.startDate).getTime() : 0;
      if (db !== da) return db - da;
      return (b.id ?? 0) - (a.id ?? 0);
    });
  }, [plans, filter]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" /> Histórico de planos
          </DialogTitle>
          <DialogDescription>
            Linha do tempo cronológica de todos os planos do paciente.
            Clique em um cartão para abri-lo na aba.
          </DialogDescription>
        </DialogHeader>

        {/* Filtro por status — chips ao invés de dropdown para acesso rápido */}
        <div className="flex flex-wrap gap-1.5 pb-1 pt-1 border-b border-slate-100">
          {(
            [
              { key: "todos", label: "Todos", count: counts.todos },
              { key: "ativo", label: "Ativos", count: counts.ativo },
              { key: "concluido", label: "Concluídos", count: counts.concluido },
              { key: "cancelado", label: "Cancelados", count: counts.cancelado },
            ] as { key: PlanHistoryFilter; label: string; count: number }[]
          ).map((opt) => {
            const active = filter === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setFilter(opt.key)}
                disabled={opt.count === 0 && opt.key !== "todos"}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                }`}
              >
                {opt.label}
                <span className={`ml-1.5 text-[10px] font-semibold ${
                  active ? "text-primary-foreground/80" : "text-slate-400"
                }`}>
                  {opt.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Lista de cartões — área rolável */}
        <div className="flex-1 overflow-y-auto -mx-6 px-6 py-2 space-y-2">
          {sorted.length === 0 ? (
            <div className="text-center py-10 text-sm text-slate-400">
              Nenhum plano com este filtro.
            </div>
          ) : (
            sorted.map((p) => (
              <PlanHistoryCard
                key={p.id}
                plan={p}
                isSelected={p.id === selectedPlanId}
                onClick={() => onSelect(p.id)}
              />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PlanHistoryCard({
  plan, isSelected, onClick,
}: {
  plan: any;
  isSelected: boolean;
  onClick: () => void;
}) {
  const status = (plan.status as string) ?? "ativo";
  const accepted = !!plan.acceptedAt;

  // Mapa de visual por status (cor da borda + selo).
  const statusStyle =
    status === "ativo"
      ? { border: "border-emerald-200", badge: "bg-emerald-100 text-emerald-700", label: "Ativo" }
      : status === "concluido"
      ? { border: "border-blue-200", badge: "bg-blue-100 text-blue-700", label: "Concluído" }
      : status === "cancelado"
      ? { border: "border-slate-200", badge: "bg-slate-100 text-slate-600", label: "Cancelado" }
      : { border: "border-slate-200", badge: "bg-slate-100 text-slate-600", label: status };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-xl border bg-white p-3.5 transition-all hover:shadow-sm hover:border-primary/30 ${
        isSelected
          ? "ring-2 ring-primary/40 border-primary/50 shadow-sm"
          : statusStyle.border
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusStyle.badge}`}>
              {statusStyle.label}
            </span>
            {accepted && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                <BadgeCheck className="w-3 h-3" /> Assinado
              </span>
            )}
            {isSelected && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                Selecionado
              </span>
            )}
          </div>

          <div className="text-sm font-semibold text-slate-800 truncate">
            Plano iniciado em {formatDate(plan.startDate) || "—"}
          </div>

          <div className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-0.5">
            {plan.endDate && (
              <span>
                <span className="text-slate-400">Término previsto:</span>{" "}
                {formatDate(plan.endDate)}
              </span>
            )}
            {plan.durationMonths != null && (
              <span>
                <span className="text-slate-400">Prazo:</span>{" "}
                {plan.durationMonths} {plan.durationMonths === 1 ? "mês" : "meses"}
              </span>
            )}
            {plan.responsibleProfessional && (
              <span className="truncate max-w-[200px]">
                <span className="text-slate-400">Profissional:</span>{" "}
                {plan.responsibleProfessional}
              </span>
            )}
          </div>

          {accepted && plan.acceptedAt && (
            <div className="text-[11px] text-emerald-700 pt-0.5">
              Assinado em {formatDateTime(plan.acceptedAt)}
              {plan.acceptedVia && (
                <span className="text-emerald-600/80"> ({plan.acceptedVia})</span>
              )}
            </div>
          )}
        </div>

        <ArrowUpRight className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
      </div>
    </button>
  );
}
