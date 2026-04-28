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
import { useState, useEffect, useRef } from "react";
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
    const html = generateContractHTML(patient, form, planItems, clinic);
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

          <Button size="sm" variant="outline" className="w-full sm:w-auto h-10 gap-1.5 rounded-xl border-primary/30 text-primary hover:bg-primary/5"
            onClick={handleCreatePlan} disabled={creatingNew}>
            {creatingNew ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Plus className="w-4 h-4 shrink-0" />}
            Novo Plano
          </Button>
        </div>
      </div>

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

          <CardContent className="p-6 space-y-6">
            {/* Objectives and techniques */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Target className="w-4 h-4 text-primary" /> Objetivos do Tratamento
                </Label>
                <Textarea
                  className="min-h-[120px] bg-slate-50 border-slate-200 focus:bg-white transition-colors"
                  placeholder="Quais os principais objetivos desta etapa? (ex: redução de dor, ganho de amplitude...)"
                  value={form.objectives} onChange={e => setForm({ ...form, objectives: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-primary" /> Condutas e Técnicas
                </Label>
                <Textarea
                  className="min-h-[120px] bg-slate-50 border-slate-200 focus:bg-white transition-colors"
                  placeholder="Quais técnicas serão aplicadas? (ex: liberação miofascial, exercícios cinesioterapêuticos...)"
                  value={form.techniques} onChange={e => setForm({ ...form, techniques: e.target.value })}
                />
              </div>
            </div>

            {/* Responsible Professional */}
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

            {/* Frequency, start date, estimated sessions */}
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

            {/* Status + Prazo */}
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

            {/* Materialização */}
            <MaterializeBlock
              planId={selectedPlanId!}
              materializedAt={selectedPlan?.materializedAt ?? null}
              planItems={planItems}
              onChanged={() => {
                queryClient.invalidateQueries({ queryKey: plansKey });
                queryClient.invalidateQueries({ queryKey: planItemsKey ?? [] });
                queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/appointments`] });
              }}
            />

            {/* Sprint 2 — Faturamento e validade de créditos */}
            <BillingSettingsBlock
              form={form}
              setForm={setForm}
              isAccepted={!!selectedPlan?.acceptedAt}
            />

            {/* Sprint 4 — Fechamento mensal de avulsos */}
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

            {/* Sprint 3 — Extrato de créditos do paciente */}
            <CreditsStatementBlock patientId={patientId} />

            {/* Session progress */}
            {(form.estimatedSessions || completedSessions > 0) && (
              <div className="pt-2 border-t border-slate-100 space-y-2">
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
                  <p className="text-xs text-slate-400">{completedSessions} sessão(ões) concluída(s). Defina o total estimado para ver o progresso.</p>
                )}
              </div>
            )}

            {/* Items section */}
            <TreatmentPlanItemsSection planId={selectedPlanId ?? undefined} planItems={planItems} planItemsKey={planItemsKey} />

            {/* Save button */}
            <div className="pt-3 flex sm:justify-end">
              <Button onClick={handleSave} className="w-full sm:w-auto h-11 sm:px-8 rounded-xl shadow-md shadow-primary/20 gap-1.5" disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                Salvar Plano
              </Button>
            </div>
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
