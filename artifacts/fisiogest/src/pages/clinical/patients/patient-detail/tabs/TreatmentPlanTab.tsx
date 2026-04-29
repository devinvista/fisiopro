import { apiFetchJson, apiSendJson } from "@/lib/api";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2, ClipboardList, History, Plus, Pencil, Trash2, ScrollText, Printer,
  BadgeCheck, Lock, ArrowRight, ChevronDown, ChevronUp, Stethoscope, UserCheck,
  Activity, Sparkles, CalendarRange,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { VoiceTextarea as Textarea } from "@/components/ui/voice-textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useState, useEffect, useRef, useMemo } from "react";
import { useToast } from "@/lib/toast";
import { DatePickerPTBR } from "@/components/ui/date-picker-ptbr";

import type { PatientBasic, ClinicInfo, PlanProcedureItem } from "../types";
import { formatDate, todayBRTString } from "../utils/format";
import {
  fetchClinicForPrint,
  printDocument,
  generatePlanHTML,
  generateContractHTML,
} from "../utils/print-html";

import { TreatmentPlanItemsSection } from "./treatment-plan/TreatmentPlanItemsSection";
import { ObjectivesField } from "./treatment-plan/ObjectivesField";
import { PlanInstallmentsPanel } from "./treatment-plan/PlanInstallmentsPanel";
import { AcceptanceScheduleEditor } from "./treatment-plan/AcceptanceScheduleEditor";
import { AvulsoMonthlyEstimate } from "./treatment-plan/AvulsoMonthlyEstimate";
import { AcceptanceBlock } from "./treatment-plan/AcceptanceBlock";
import { MaterializeBlock } from "./treatment-plan/MaterializeBlock";
import { BillingSettingsBlock } from "./treatment-plan/BillingSettingsBlock";
import { CloseMonthBlock } from "./treatment-plan/CloseMonthBlock";
import { CreditsStatementBlock } from "./treatment-plan/CreditsStatementBlock";
import { PlanHistoryDialog } from "./treatment-plan/PlanHistoryDialog";
import { PlanStepper, type PlanStepKey } from "./treatment-plan/PlanStepper";

// ───────────────────────────────────────────────────────────────────────────
// Plano de Tratamento — orquestrador slim do wizard de 3 etapas.
//
// Fluxo:
//   1. ITENS    — define o "o quê" (procedimentos, sessões/sem, valores)
//   2. ACEITE   — assinatura formal + agenda do paciente liberada após aceite
//   3. COBRANÇA — modo de cobrança + "Iniciar plano" + parcelas geradas
//
// Decisões de design (versus a versão anterior em 4 abas):
//   • Stepper visual no topo, com gates: Aceite trava sem itens, Cobrança trava
//     sem aceite. Status ("done", "active", "available", "locked") deixa claro
//     onde o usuário está.
//   • Removidos do form (eram duplicados): `frequency` (derivado de itens),
//     `estimatedSessions` (derivado de itens). Backend continua aceitando, mas
//     o UI não os expõe — agora aparecem como métricas readonly no header.
//   • A aba "Sessões" virou métrica no header (sem aba dedicada).
//   • Profissional Responsável e Status do plano vão para "Detalhes clínicos"
//     colapsável dentro da Etapa 1, para não competir com os campos comerciais.
//   • Iniciar Agenda e Duração da Agenda usam exclusivamente os valores do plano
//     (Etapa 1) — sem inputs duplicados na Etapa 3.
// ───────────────────────────────────────────────────────────────────────────

export function TreatmentPlanTab({ patientId, patient }: { patientId: number; patient?: PatientBasic }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: clinic } = useQuery<ClinicInfo | null>({
    queryKey: ["clinic-current"],
    queryFn: fetchClinicForPrint,
    staleTime: 60000,
  });

  // ─── Lista de planos do paciente ───────────────────────────────────────
  const plansKey = [`/api/patients/${patientId}/treatment-plans`];
  const { data: allPlans = [], isLoading: plansLoading } = useQuery<any[]>({
    queryKey: plansKey,
    queryFn: () => apiFetchJson<any[]>(`/api/patients/${patientId}/treatment-plans`),
    enabled: !!patientId,
  });

  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [activeStep, setActiveStep] = useState<PlanStepKey>("itens");
  const [creatingNew, setCreatingNew] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [clinicalOpen, setClinicalOpen] = useState(false);

  useEffect(() => {
    if (allPlans.length > 0 && selectedPlanId === null) {
      const active = allPlans.find(p => p.status === "ativo") ?? allPlans[0];
      setSelectedPlanId(active.id);
    }
  }, [allPlans, selectedPlanId]);

  const selectedPlan = allPlans.find(p => p.id === selectedPlanId) ?? null;

  // ─── Itens do plano selecionado ────────────────────────────────────────
  const planItemsKey = selectedPlanId
    ? [`/api/treatment-plans/${selectedPlanId}/procedures`]
    : null;
  const { data: planItems = [] } = useQuery<PlanProcedureItem[]>({
    queryKey: planItemsKey ?? ["plan-items-disabled"],
    queryFn: () =>
      apiFetchJson<PlanProcedureItem[]>(`/api/treatment-plans/${selectedPlanId}/procedures`),
    enabled: !!selectedPlanId,
  });

  const { data: appointments = [] } = useQuery<any[]>({
    queryKey: [`/api/patients/${patientId}/appointments`],
    queryFn: () => apiFetchJson<any[]>(`/api/patients/${patientId}/appointments`),
    enabled: !!patientId,
  });

  const completedSessions = appointments.filter(
    (a: any) => a.status === "concluido" || a.status === "presenca",
  ).length;

  const { data: professionals = [] } = useQuery<{ id: number; name: string; roles: string[] }[]>({
    queryKey: ["/api/users/professionals"],
    queryFn: () =>
      apiFetchJson<{ id: number; name: string; roles: string[] }[]>("/api/users/professionals"),
  });

  // ─── Form state (mantém compatibilidade com backend) ───────────────────
  const emptyForm = {
    objectives: "",
    techniques: "",
    frequency: "",                    // derivado de itens — não exposto no UI
    estimatedSessions: "" as string | number, // derivado — não exposto no UI
    startDate: "",
    responsibleProfessional: "",
    status: "ativo" as "ativo" | "concluido" | "suspenso",
    durationMonths: 12 as number,
    paymentMode: "" as "" | "prepago" | "postpago",
    monthlyCreditValidityDays: "" as string | number,
    replacementCreditValidityDays: "" as string | number,
    avulsoBillingMode: "porSessao" as "porSessao" | "mensalConsolidado",
    avulsoBillingDay: "" as string | number,
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

  // Auto-sync de frequency/estimatedSessions a partir dos itens. Mantemos o
  // cálculo interno (backend pode usar), mas o UI não mostra mais esses campos.
  useEffect(() => {
    if (!planItemsInitRef.current) { planItemsInitRef.current = true; return; }
    if (planItems.length === 0) return;
    const totalSess = planItems.reduce(
      (s, i) => i.packageType === "mensal" ? s : s + (i.totalSessions ?? 0),
      0,
    );
    const spwValues = planItems.map(i => i.sessionsPerWeek ?? 0).filter(v => v > 0);
    const maxSpw = spwValues.length > 0 ? Math.max(...spwValues) : 0;
    const freqStr = maxSpw > 0 ? `${maxSpw}x/semana` : "";
    setForm(f => ({
      ...f,
      ...(totalSess > 0 ? { estimatedSessions: totalSess } : {}),
      ...(freqStr ? { frequency: freqStr } : {}),
    }));
  }, [planItems]);

  // ─── Métricas derivadas para o header (substituem a aba "Sessões") ──────
  const headerMetrics = useMemo(() => {
    const totalEstSess = Number(form.estimatedSessions || 0);
    const monthlyItems = planItems.filter(i => i.packageType === "mensal");
    const recurringSlots = monthlyItems.reduce((s, i) => s + (i.sessionsPerWeek ?? 0), 0);
    const months = selectedPlan?.durationMonths ?? form.durationMonths ?? 12;
    const totalRecurring = recurringSlots * 4 * months;
    const totalAll = totalEstSess + totalRecurring;
    return {
      completed: completedSessions,
      totalAll,
      hasGoal: totalAll > 0,
      progress: totalAll > 0 ? Math.min(100, (completedSessions / totalAll) * 100) : 0,
      months,
    };
  }, [form.estimatedSessions, form.durationMonths, planItems, selectedPlan, completedSessions]);

  // ─── Mutations ─────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!selectedPlanId) return;
    setSaving(true);
    try {
      await apiSendJson(`/api/patients/${patientId}/treatment-plans/${selectedPlanId}`, "PUT", {
        ...form,
        estimatedSessions: form.estimatedSessions ? Number(form.estimatedSessions) : null,
        durationMonths: form.durationMonths ? Number(form.durationMonths) : null,
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
      toast({ title: "Plano salvo!" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleCreatePlan = async () => {
    setCreatingNew(true);
    try {
      const newPlan = await apiSendJson<any>(
        `/api/patients/${patientId}/treatment-plans`,
        "POST",
        { startDate: todayBRTString(), status: "ativo" },
      );
      queryClient.invalidateQueries({ queryKey: plansKey });
      setSelectedPlanId(newPlan.id);
      setActiveStep("itens");
      toast({ title: "Novo plano de tratamento iniciado!" });
    } catch (err: any) {
      toast({ title: "Erro ao criar plano", description: err.message, variant: "destructive" });
    } finally {
      setCreatingNew(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiSendJson(`/api/patients/${patientId}/treatment-plans/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: plansKey });
      setSelectedPlanId(null);
      toast({ title: "Plano excluído com sucesso." });
    },
    onError: (err: Error) =>
      toast({ title: "Erro", description: err.message, variant: "destructive" }),
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

  // ─── Cálculos para o stepper ──────────────────────────────────────────
  const hasItems = planItems.length > 0;
  const isAccepted = !!selectedPlan?.acceptedAt;
  const isStarted = !!selectedPlan?.materializedAt;

  // Contagem de itens com agenda completa (agenda + dia(s) + horário)
  // e contagem de itens MENSAIS pendentes (bloqueiam a materialização do plano).
  const { aceiteStats, monthlyMissingCount } = useMemo(() => {
    if (planItems.length === 0) {
      return { aceiteStats: { configured: 0, total: 0 }, monthlyMissingCount: 0 };
    }
    let configured = 0;
    let monthlyMissing = 0;
    for (const item of planItems as Array<PlanProcedureItem & {
      weekDays?: string | string[] | null;
      defaultStartTime?: string | null;
      scheduleId?: number | null;
    }>) {
      let weekDaysCount = 0;
      const wdRaw = item.weekDays;
      if (Array.isArray(wdRaw)) {
        weekDaysCount = wdRaw.length;
      } else if (typeof wdRaw === "string" && wdRaw.trim().length > 0) {
        try {
          const parsed = JSON.parse(wdRaw);
          weekDaysCount = Array.isArray(parsed) ? parsed.length : 0;
        } catch {
          weekDaysCount = wdRaw.split(",").filter(Boolean).length;
        }
      }
      const isComplete = !!item.scheduleId && weekDaysCount > 0 && !!item.defaultStartTime;
      if (isComplete) configured++;
      if (item.packageType === "mensal" && (weekDaysCount === 0 || !item.defaultStartTime)) {
        monthlyMissing++;
      }
    }
    return {
      aceiteStats: { configured, total: planItems.length },
      monthlyMissingCount: monthlyMissing,
    };
  }, [planItems]);

  // Auto-avança visualmente se etapa atual ficou inválida
  useEffect(() => {
    if (activeStep === "aceite" && !hasItems) setActiveStep("itens");
    if (activeStep === "cobranca" && !isAccepted) setActiveStep("aceite");
  }, [activeStep, hasItems, isAccepted]);

  if (plansLoading) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary opacity-20" />
      </div>
    );
  }

  // ─── Estado vazio ─────────────────────────────────────────────────────
  if (!selectedPlanId) {
    return (
      <div className="space-y-6">
        <PlanSelectorBar
          allPlans={allPlans}
          selectedPlanId={selectedPlanId}
          setSelectedPlanId={setSelectedPlanId}
          openHistory={() => setHistoryOpen(true)}
          handleCreatePlan={handleCreatePlan}
          creatingNew={creatingNew}
        />
        <Card className="border-none shadow-sm">
          <CardContent className="p-12 text-center space-y-4">
            <div className="mx-auto h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-base font-semibold text-slate-700">Nenhum plano ainda</p>
              <p className="text-sm text-slate-500 mt-1">
                Crie o primeiro plano para começar a definir procedimentos, agenda e cobrança.
              </p>
            </div>
            <Button
              size="sm"
              className="gap-1.5 rounded-xl shadow-md shadow-primary/20"
              onClick={handleCreatePlan}
              disabled={creatingNew}
            >
              {creatingNew ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Criar primeiro plano
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PlanSelectorBar
        allPlans={allPlans}
        selectedPlanId={selectedPlanId}
        setSelectedPlanId={setSelectedPlanId}
        openHistory={() => setHistoryOpen(true)}
        handleCreatePlan={handleCreatePlan}
        creatingNew={creatingNew}
      />

      <PlanHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        plans={allPlans}
        selectedPlanId={selectedPlanId}
        onSelect={(id) => {
          setSelectedPlanId(id);
          setHistoryOpen(false);
          setActiveStep("itens");
        }}
      />

      {/* Header do plano: status, métricas, ações de impressão/exclusão */}
      <PlanHeader
        selectedPlan={selectedPlan}
        planItemsCount={planItems.length}
        headerMetrics={headerMetrics}
        isAccepted={isAccepted}
        isStarted={isStarted}
        handlePrintPlan={handlePrintPlan}
        handlePrintContract={handlePrintContract}
        deleteMutation={deleteMutation}
        selectedPlanId={selectedPlanId}
      />

      {/* Stepper das 3 etapas */}
      <PlanStepper
        current={activeStep}
        hasItems={hasItems}
        isAccepted={isAccepted}
        isStarted={isStarted}
        aceiteStats={aceiteStats}
        monthlyMissingCount={monthlyMissingCount}
        onSelect={setActiveStep}
      />

      {/* Conteúdo da etapa ativa */}
      <Card className="border-none shadow-sm bg-white overflow-hidden">
        <CardContent className="p-5 sm:p-6 space-y-6">
          {activeStep === "itens" && (
            <StepItens
              patientId={patientId}
              selectedPlanId={selectedPlanId}
              planItems={planItems}
              planItemsKey={planItemsKey}
              form={form}
              setForm={setForm}
              professionals={professionals}
              clinicalOpen={clinicalOpen}
              setClinicalOpen={setClinicalOpen}
              saving={saving}
              handleSave={handleSave}
              hasItems={hasItems}
              onAdvance={() => setActiveStep("aceite")}
            />
          )}

          {activeStep === "aceite" && (
            <StepAceite
              patientId={patientId}
              selectedPlanId={selectedPlanId}
              selectedPlan={selectedPlan}
              planItems={planItems}
              planItemsKey={planItemsKey}
              patient={patient}
              clinic={clinic}
              form={form}
              isAccepted={isAccepted}
              isStarted={isStarted}
              onChanged={() => {
                queryClient.invalidateQueries({ queryKey: plansKey });
                queryClient.invalidateQueries({
                  queryKey: [`/api/patients/${patientId}/financial-records`],
                });
                queryClient.invalidateQueries({
                  queryKey: [`/api/patients/${patientId}/credits`],
                });
              }}
              onAdvance={() => setActiveStep("cobranca")}
            />
          )}

          {activeStep === "cobranca" && (
            <StepCobranca
              patientId={patientId}
              selectedPlanId={selectedPlanId}
              selectedPlan={selectedPlan}
              planItems={planItems}
              planItemsKey={planItemsKey}
              form={form}
              setForm={setForm}
              isAccepted={isAccepted}
              isStarted={isStarted}
              saving={saving}
              handleSave={handleSave}
              onChanged={() => {
                queryClient.invalidateQueries({ queryKey: plansKey });
                queryClient.invalidateQueries({ queryKey: planItemsKey ?? [] });
                queryClient.invalidateQueries({
                  queryKey: [`/api/patients/${patientId}/appointments`],
                });
                queryClient.invalidateQueries({
                  queryKey: [`/api/treatment-plans/${selectedPlanId}/installments`],
                });
                queryClient.invalidateQueries({
                  queryKey: [`/api/patients/${patientId}/financial-records`],
                });
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Selector header ───────────────────────────────────────────────────────
function PlanSelectorBar({
  allPlans, selectedPlanId, setSelectedPlanId, openHistory, handleCreatePlan, creatingNew,
}: {
  allPlans: any[];
  selectedPlanId: number | null;
  setSelectedPlanId: (id: number) => void;
  openHistory: () => void;
  handleCreatePlan: () => void;
  creatingNew: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-2.5 bg-gradient-to-br from-primary/15 to-primary/5 rounded-xl shrink-0">
          <ClipboardList className="w-5 h-5 text-primary" />
        </div>
        <div className="min-w-0">
          <h3 className="font-bold text-slate-800 truncate">Planos de Tratamento</h3>
          <p className="text-xs text-slate-400 truncate">
            Itens · Aceite & Agenda · Cobrança
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {allPlans.length > 0 && (
          <Select
            value={String(selectedPlanId ?? "")}
            onValueChange={(v) => setSelectedPlanId(Number(v))}
          >
            <SelectTrigger className="w-full sm:w-[260px] h-10 bg-slate-50 border-slate-200 rounded-xl">
              <SelectValue placeholder="Selecione um plano..." />
            </SelectTrigger>
            <SelectContent>
              {allPlans.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.status === "ativo" ? "🟢" : p.status === "concluido" ? "🔵" : "⚪"}{" "}
                  Plano {formatDate(p.startDate)}{" "}
                  {p.status === "ativo" ? "(Atual)" : ""}
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
            onClick={openHistory}
          >
            <History className="w-4 h-4 shrink-0" />
            Histórico
            <span className="ml-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
              {allPlans.length}
            </span>
          </Button>
        )}

        <Button
          size="sm"
          variant="outline"
          className="w-full sm:w-auto h-10 gap-1.5 rounded-xl border-primary/30 text-primary hover:bg-primary/5"
          onClick={handleCreatePlan}
          disabled={creatingNew}
        >
          {creatingNew ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Novo plano
        </Button>
      </div>
    </div>
  );
}

// ─── Header do plano selecionado ───────────────────────────────────────────
function PlanHeader({
  selectedPlan, planItemsCount, headerMetrics, isAccepted, isStarted,
  handlePrintPlan, handlePrintContract, deleteMutation, selectedPlanId,
}: {
  selectedPlan: any;
  planItemsCount: number;
  headerMetrics: { completed: number; totalAll: number; hasGoal: boolean; progress: number; months: number };
  isAccepted: boolean;
  isStarted: boolean;
  handlePrintPlan: () => void;
  handlePrintContract: () => void;
  deleteMutation: any;
  selectedPlanId: number;
}) {
  const statusBadge = isStarted
    ? { label: "Em andamento", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" }
    : isAccepted
    ? { label: "Aceito · aguardando início", cls: "bg-blue-100 text-blue-700 border-blue-200" }
    : { label: "Rascunho", cls: "bg-amber-100 text-amber-700 border-amber-200" };

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 sm:p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-base sm:text-lg font-bold text-slate-800">
              Plano {formatDate(selectedPlan?.startDate) || "—"}
            </h4>
            <Badge className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusBadge.cls}`}>
              {statusBadge.label}
            </Badge>
            {isAccepted && (
              <Badge className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                <BadgeCheck className="w-3 h-3" /> Assinado
              </Badge>
            )}
          </div>

          {/* Métricas (substituem a antiga aba "Sessões") */}
          <div className="grid grid-cols-3 gap-3 max-w-md">
            <Metric
              icon={ClipboardList}
              label="Itens"
              value={String(planItemsCount)}
              tone="primary"
            />
            <Metric
              icon={CalendarRange}
              label="Duração"
              value={`${headerMetrics.months} ${headerMetrics.months === 1 ? "mês" : "meses"}`}
              tone="slate"
            />
            <Metric
              icon={Activity}
              label="Sessões"
              value={
                headerMetrics.hasGoal
                  ? `${headerMetrics.completed}/${headerMetrics.totalAll}`
                  : String(headerMetrics.completed)
              }
              tone={
                headerMetrics.hasGoal && headerMetrics.completed >= headerMetrics.totalAll
                  ? "emerald"
                  : "primary"
              }
            />
          </div>

          {headerMetrics.hasGoal && (
            <div className="max-w-md pt-1">
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-1.5 rounded-full transition-all duration-500 ${
                    headerMetrics.completed >= headerMetrics.totalAll
                      ? "bg-emerald-500"
                      : "bg-primary"
                  }`}
                  style={{ width: `${headerMetrics.progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-1 text-xs rounded-xl"
            onClick={handlePrintPlan}
          >
            <Printer className="w-3.5 h-3.5 shrink-0" /> Plano
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-1 text-xs rounded-xl"
            onClick={handlePrintContract}
          >
            <ScrollText className="w-3.5 h-3.5 shrink-0" /> Contrato
          </Button>

          <AlertDialog>
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="h-9 w-9 p-0 text-slate-400 hover:text-rose-500 hover:bg-rose-50 shrink-0"
            >
              <div className="cursor-pointer">
                <Trash2 className="w-4 h-4" />
              </div>
            </Button>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir plano de tratamento?</AlertDialogTitle>
                <AlertDialogDescription>
                  Isso remove os objetivos, condutas e os vínculos de procedimentos
                  deste plano. A ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-rose-600 hover:bg-rose-700"
                  onClick={() => deleteMutation.mutate(selectedPlanId)}
                >
                  Sim, excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}

function Metric({
  icon: Icon, label, value, tone,
}: {
  icon: typeof ClipboardList;
  label: string;
  value: string;
  tone: "primary" | "slate" | "emerald";
}) {
  const toneCls = {
    primary: "text-primary",
    slate: "text-slate-600",
    emerald: "text-emerald-600",
  }[tone];
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Icon className={`w-3.5 h-3.5 shrink-0 ${toneCls}`} />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold leading-none">
          {label}
        </p>
        <p className={`text-sm font-bold leading-tight truncate ${toneCls}`}>{value}</p>
      </div>
    </div>
  );
}

// ─── Etapa 1 — Itens ───────────────────────────────────────────────────────
function StepItens({
  patientId, selectedPlanId, planItems, planItemsKey, form, setForm, professionals,
  clinicalOpen, setClinicalOpen, saving, handleSave, hasItems, onAdvance,
}: {
  patientId: number;
  selectedPlanId: number;
  planItems: PlanProcedureItem[];
  planItemsKey: any;
  form: any;
  setForm: (fn: any) => void;
  professionals: { id: number; name: string }[];
  clinicalOpen: boolean;
  setClinicalOpen: (v: boolean) => void;
  saving: boolean;
  handleSave: () => void;
  hasItems: boolean;
  onAdvance: () => void;
}) {
  const updateForm = (patch: any) =>
    setForm((p: any) => ({ ...p, ...patch }));

  return (
    <div className="space-y-6">
      {/* Bloco 1: dados comerciais essenciais (data + duração) */}
      <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-slate-50/60 to-transparent p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <ClipboardList className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-800">Período do plano</h4>
            <p className="text-[11px] text-slate-500">
              Quando começa e por quanto tempo a agenda e a cobrança valem
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Data de início</Label>
            <DatePickerPTBR
              className="bg-white border-slate-200 h-10"
              value={form.startDate}
              onChange={(v) => updateForm({ startDate: v })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Vigência</Label>
            <Select
              value={String(form.durationMonths ?? 12)}
              onValueChange={(v) => updateForm({ durationMonths: Number(v) })}
            >
              <SelectTrigger className="bg-white border-slate-200 h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 6, 12, 24, 36].map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {m} {m === 1 ? "mês" : "meses"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-slate-400">
              Define até quando consultas e parcelas mensais serão geradas.
            </p>
          </div>
        </div>
      </div>

      {/* Bloco 2: itens (procedimentos / pacotes) */}
      <TreatmentPlanItemsSection
        planId={selectedPlanId}
        planItems={planItems}
        planItemsKey={planItemsKey}
      />

      {/* Bloco 3: detalhes clínicos (collapsible) */}
      <div className="rounded-2xl border border-slate-100 bg-white">
        <button
          type="button"
          onClick={() => setClinicalOpen(!clinicalOpen)}
          className="w-full flex items-center justify-between p-4 text-left"
        >
          <span className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Stethoscope className="w-4 h-4 text-primary" />
            Detalhes clínicos
            <span className="text-[10px] text-slate-400 font-normal">
              objetivos, condutas, profissional, observações
            </span>
          </span>
          {clinicalOpen ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {clinicalOpen && (
          <div className="border-t border-slate-100 p-5 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <ObjectivesField
                patientId={patientId}
                value={form.objectives}
                onChange={(v) => updateForm({ objectives: v })}
              />
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-primary" /> Condutas e técnicas
                </Label>
                <Textarea
                  className="min-h-[140px] bg-slate-50 border-slate-200 focus:bg-white transition-colors"
                  placeholder="Quais técnicas serão aplicadas? (ex: liberação miofascial, exercícios cinesioterapêuticos…)"
                  value={form.techniques}
                  onChange={(e) => updateForm({ techniques: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-primary" /> Profissional responsável
                  <span className="text-[10px] text-slate-400 font-normal">(geral do plano)</span>
                </Label>
                <Select
                  value={form.responsibleProfessional || "_none"}
                  onValueChange={(v) =>
                    updateForm({ responsibleProfessional: v === "_none" ? "" : v })
                  }
                >
                  <SelectTrigger className="bg-slate-50 border-slate-200">
                    <SelectValue placeholder="Selecionar profissional…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Não definido —</SelectItem>
                    {professionals.map((p) => (
                      <SelectItem key={p.id} value={p.name}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-slate-400">
                  Cada item pode ter seu profissional próprio na etapa de Aceite.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700">
                  Status do plano
                </Label>
                <Select
                  value={form.status}
                  onValueChange={(v: "ativo" | "concluido" | "suspenso") =>
                    updateForm({ status: v })
                  }
                >
                  <SelectTrigger className="bg-slate-50 border-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="concluido">Concluído</SelectItem>
                    <SelectItem value="suspenso">Suspenso</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-slate-400">
                  Use "concluído" ao dar alta ou "suspenso" para pausar.
                </p>
              </div>
            </div>

            {/* Observações internas */}
            <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-semibold text-amber-900 flex items-center gap-2">
                  <Lock className="w-4 h-4" /> Observações internas
                </Label>
                <span className="text-[10px] text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-medium">
                  Não impresso no contrato
                </span>
              </div>
              <Textarea
                className="min-h-[80px] bg-white border-amber-200 focus:border-amber-400 text-sm"
                placeholder="Combinados com a recepção, particularidades de convênio, lembretes do profissional…"
                value={form.internalNotes}
                onChange={(e) => updateForm({ internalNotes: e.target.value })}
                maxLength={5000}
              />
              <p className="text-[11px] text-amber-700/80">
                Visível apenas dentro do sistema. Não aparece em contrato, link público
                ou mensagens ao paciente.
                {form.internalNotes.length > 0 && (
                  <span className="text-amber-600 ml-1">
                    ({form.internalNotes.length}/5000)
                  </span>
                )}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Ações finais */}
      <div className="flex flex-col sm:flex-row gap-2 sm:justify-end pt-2">
        <Button
          variant="outline"
          onClick={handleSave}
          className="h-11 px-6 rounded-xl gap-1.5 order-2 sm:order-1"
          disabled={saving}
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Salvar rascunho
        </Button>
        <Button
          onClick={async () => { await handleSave(); onAdvance(); }}
          className="h-11 px-6 rounded-xl shadow-md shadow-primary/20 gap-1.5 order-1 sm:order-2"
          disabled={saving || !hasItems}
          title={!hasItems ? "Adicione ao menos 1 item para avançar" : undefined}
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Avançar para Aceite <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Etapa 2 — Aceite & Agenda ─────────────────────────────────────────────
function StepAceite({
  patientId, selectedPlanId, selectedPlan, planItems, planItemsKey,
  patient, clinic, form, isAccepted, isStarted, onChanged, onAdvance,
}: {
  patientId: number;
  selectedPlanId: number;
  selectedPlan: any;
  planItems: PlanProcedureItem[];
  planItemsKey: any;
  patient: PatientBasic | undefined;
  clinic: ClinicInfo | null | undefined;
  form: any;
  isAccepted: boolean;
  isStarted: boolean;
  onChanged: () => void;
  onAdvance: () => void;
}) {
  return (
    <div className="space-y-5">
      <AcceptanceBlock
        patientId={patientId}
        planId={selectedPlanId}
        plan={selectedPlan}
        patientName={patient?.name ?? ""}
        patientPhone={patient?.phone ?? null}
        patientEmail={(patient as any)?.email ?? null}
        clinicName={clinic?.name ?? null}
        onChanged={onChanged}
      />

      {isAccepted ? (
        <>
          <div className="rounded-2xl border border-slate-100 bg-white p-5 space-y-4 shadow-sm">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl bg-blue-100 flex items-center justify-center">
                <CalendarRange className="w-4 h-4 text-blue-700" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-800">Agenda do paciente</h4>
                <p className="text-[11px] text-slate-500">
                  Escolha a agenda, depois os dias — sugerimos só horários realmente livres
                </p>
              </div>
            </div>

            <AcceptanceScheduleEditor
              planId={selectedPlanId}
              planItems={planItems as any}
              planItemsKey={planItemsKey}
              isMaterialized={isStarted}
              isAccepted={isAccepted}
            />
          </div>

          {!isStarted && (
            <div className="flex justify-end pt-2">
              <Button
                onClick={onAdvance}
                className="h-11 px-6 rounded-xl shadow-md shadow-primary/20 gap-1.5"
              >
                Avançar para Cobrança <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 p-8 text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center">
            <Lock className="w-5 h-5 text-slate-400" />
          </div>
          <p className="text-sm font-semibold text-slate-600">Agenda travada</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Após o aceite formal acima, esta seção libera a escolha de
            <strong> dias e horários </strong>na agenda do paciente, com pré-visualização semanal.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Etapa 3 — Cobrança ────────────────────────────────────────────────────
function StepCobranca({
  patientId, selectedPlanId, selectedPlan, planItems, planItemsKey, form, setForm,
  isAccepted, isStarted, saving, handleSave, onChanged,
}: {
  patientId: number;
  selectedPlanId: number;
  selectedPlan: any;
  planItems: PlanProcedureItem[];
  planItemsKey: any;
  form: any;
  setForm: (fn: any) => void;
  isAccepted: boolean;
  isStarted: boolean;
  saving: boolean;
  handleSave: () => void;
  onChanged: () => void;
}) {
  if (!isAccepted) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 p-8 text-center space-y-3">
        <div className="mx-auto h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center">
          <Lock className="w-5 h-5 text-slate-400" />
        </div>
        <p className="text-sm font-semibold text-slate-600">Cobrança travada</p>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          A cobrança e o "Iniciar plano" só ficam disponíveis após o aceite formal
          do paciente na etapa anterior.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <BillingSettingsBlock form={form} setForm={setForm} isAccepted={isAccepted} />

      {/* Botão para salvar mudanças nas configurações de cobrança antes de iniciar */}
      {!isStarted && (
        <div className="flex justify-end -mt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSave}
            className="h-9 gap-1.5 rounded-xl"
            disabled={saving}
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Salvar configurações
          </Button>
        </div>
      )}

      {/* Iniciar plano */}
      {!isStarted && (
        <MaterializeBlock
          planId={selectedPlanId}
          patientId={patientId}
          materializedAt={null}
          planStartDate={selectedPlan?.startDate ?? form.startDate ?? null}
          planDurationMonths={selectedPlan?.durationMonths ?? form.durationMonths ?? 12}
          planItems={planItems}
          onChanged={onChanged}
        />
      )}

      {/* Após iniciado: parcelas, estimativa e reverter */}
      {isStarted && (
        <>
          <PlanInstallmentsPanel
            patientId={patientId}
            planId={selectedPlanId}
            isAccepted={isAccepted}
            isMaterialized={isStarted}
          />

          <AvulsoMonthlyEstimate
            planItems={planItems as any}
            durationMonths={selectedPlan?.durationMonths ?? form.durationMonths ?? 12}
          />

          <MaterializeBlock
            planId={selectedPlanId}
            patientId={patientId}
            materializedAt={selectedPlan?.materializedAt ?? null}
            planStartDate={selectedPlan?.startDate ?? form.startDate ?? null}
            planDurationMonths={selectedPlan?.durationMonths ?? form.durationMonths ?? 12}
            planItems={planItems}
            onChanged={onChanged}
          />
        </>
      )}

      {/* Fechamento mensal — só quando faz sentido */}
      {isAccepted && form.avulsoBillingMode === "mensalConsolidado" && (
        <CloseMonthBlock
          patientId={patientId}
          planId={selectedPlanId}
          onClosed={onChanged}
        />
      )}

      <CreditsStatementBlock patientId={patientId} />
    </div>
  );
}
