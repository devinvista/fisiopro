import { apiFetchJson, apiSendJson } from "@/lib/api";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Loader2, ClipboardList, History, Plus, Trash2, ScrollText, Printer,
  BadgeCheck, Lock, ArrowRight, ChevronDown, ChevronUp, Stethoscope, UserCheck,
  Activity, Sparkles, CalendarRange, AlertTriangle, Clock, RefreshCw,
  CheckCircle, LayoutDashboard, Wallet, FileText, RotateCcw, CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VoiceTextarea as Textarea } from "@/components/ui/voice-textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MAX_PLAN_DURATION_MONTHS } from "@workspace/shared-constants";
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
import { PlanScheduleEditor } from "./treatment-plan/PlanScheduleEditor";
import type { PlanItemForHold } from "./treatment-plan/usePlanSlotHolds";
import { AvulsoMonthlyEstimate } from "./treatment-plan/AvulsoMonthlyEstimate";
import { ContractAcceptanceBlock } from "./treatment-plan/ContractAcceptanceBlock";
import { MaterializeBlock } from "./treatment-plan/MaterializeBlock";
import { BillingSettingsBlock } from "./treatment-plan/BillingSettingsBlock";
import { CloseMonthBlock } from "./treatment-plan/CloseMonthBlock";
import { CreditsStatementBlock } from "./treatment-plan/CreditsStatementBlock";
import { PlanHistoryDialog } from "./treatment-plan/PlanHistoryDialog";
import { PlanStepper, type PlanStepKey } from "./treatment-plan/PlanStepper";
import { ContractPreviewDialog } from "./treatment-plan/ContractPreviewDialog";

const HOLD_TTL_OPTIONS = [
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "1 hora" },
  { value: 90, label: "1h 30min" },
  { value: 120, label: "2 horas" },
];

function fmtBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = iso.slice(0, 10);
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

function formatCountdown(secs: number): string {
  if (secs <= 0) return "Expirada";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}min ${String(s).padStart(2, "0")}s`;
}

// ─── Main orchestrator ─────────────────────────────────────────────────────
export function TreatmentPlanTab({ patientId, patient }: { patientId: number; patient?: PatientBasic }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: clinic } = useQuery<ClinicInfo | null>({
    queryKey: ["clinic-current"],
    queryFn: fetchClinicForPrint,
    staleTime: 60000,
  });

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
  const [contractPreviewOpen, setContractPreviewOpen] = useState(false);
  const [contractPreviewHtml, setContractPreviewHtml] = useState("");
  const [billingConfigured, setBillingConfigured] = useState(false);
  const [holdTtlMinutes, setHoldTtlMinutes] = useState(30);
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);

  useEffect(() => {
    if (allPlans.length > 0 && selectedPlanId === null) {
      const active = allPlans.find(p => p.status === "ativo") ?? allPlans[0];
      setSelectedPlanId(active.id);
    }
  }, [allPlans, selectedPlanId]);

  const selectedPlan = allPlans.find(p => p.id === selectedPlanId) ?? null;

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

  const emptyForm = {
    objectives: "",
    techniques: "",
    frequency: "",
    estimatedSessions: "" as string | number,
    startDate: "",
    responsibleProfessional: "",
    status: "ativo" as "ativo" | "concluido" | "suspenso",
    durationMonths: 12 as number,
    paymentMode: "" as "" | "prepago" | "postpago",
    monthlyCreditValidityDays: "" as string | number,
    replacementCreditValidityDays: "" as string | number,
    avulsoBillingMode: "porSessao" as "porSessao" | "mensalConsolidado",
    avulsoBillingDay: "" as string | number,
    monthlyDueDay: "" as string | number,
    internalNotes: "",
  };
  const [form, setForm] = useState(emptyForm);
  const planItemsInitRef = useRef(false);

  useEffect(() => {
    planItemsInitRef.current = false;
    setHoldExpiresAt(null);
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
        monthlyDueDay: (selectedPlan as any).monthlyDueDay ?? "",
        internalNotes: selectedPlan.internalNotes || "",
      });
    } else {
      setForm(emptyForm);
    }
  }, [selectedPlanId, allPlans]);

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
        monthlyDueDay:
          form.monthlyDueDay === "" ? null : Number(form.monthlyDueDay),
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
    // Only pass appointments that are linked to this specific plan's items.
    // Without this filter, a draft plan (0 items) would fall back to showing
    // all patient appointments, including those from other (active) plans.
    const planItemIds = new Set(planItems.map((i) => i.id));
    const planAppointments =
      planItems.length > 0
        ? appointments.filter(
            (a) => a.treatmentPlanProcedureId != null && planItemIds.has(a.treatmentPlanProcedureId),
          )
        : [];
    const html = generatePlanHTML(patient, form, planAppointments, planItems, clinic);
    printDocument(html, `Plano de Tratamento — ${patient.name}`);
  };

  const { data: contractClauses = [] } = useQuery<{ title: string; body: string }[]>({
    queryKey: ["/api/clinics/current/contract-clauses"],
    queryFn: () =>
      apiFetchJson<{ title: string; body: string }[]>("/api/clinics/current/contract-clauses"),
    staleTime: 60000,
  });

  const buildContractHtml = () => {
    if (!selectedPlan || !patient) return "";
    const acceptance = selectedPlan?.acceptedAt
      ? {
          acceptedAt: selectedPlan.acceptedAt,
          acceptedBySignature: selectedPlan.acceptedBySignature ?? null,
          acceptedIp: selectedPlan.acceptedIp ?? null,
          acceptedDevice: selectedPlan.acceptedDevice ?? null,
          acceptedVia: selectedPlan.acceptedVia ?? "presencial",
        }
      : null;
    return generateContractHTML(patient, form, planItems, clinic, acceptance, contractClauses);
  };

  const handleOpenContractPreview = () => {
    const html = buildContractHtml();
    if (!html) return;
    setContractPreviewHtml(html);
    setContractPreviewOpen(true);
  };

  const handlePrintContract = () => {
    const html = buildContractHtml();
    if (!html || !patient) return;
    printDocument(html, `Contrato — ${patient.name}`);
  };

  const handleChanged = () => {
    queryClient.invalidateQueries({ queryKey: plansKey });
    queryClient.invalidateQueries({ queryKey: planItemsKey ?? [] });
    queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/appointments`] });
    queryClient.invalidateQueries({
      queryKey: [`/api/treatment-plans/${selectedPlanId}/installments`],
    });
    queryClient.invalidateQueries({
      queryKey: [`/api/patients/${patientId}/financial-records`],
    });
    queryClient.invalidateQueries({
      queryKey: [`/api/patients/${patientId}/credits`],
    });
  };

  const hasItems = planItems.length > 0;
  const isAccepted = !!selectedPlan?.acceptedAt;
  const isStarted = !!selectedPlan?.materializedAt;

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

  useEffect(() => {
    if ((activeStep === "cobranca" || activeStep === "agenda" || activeStep === "contrato") && !hasItems) {
      setActiveStep("itens");
    }
  }, [activeStep, hasItems]);

  useEffect(() => {
    if (isStarted) setBillingConfigured(true);
  }, [isStarted]);

  if (plansLoading) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary opacity-20" />
      </div>
    );
  }

  // ─── Empty state ───────────────────────────────────────────────────────
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
        <PlanHistoryDialog
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          plans={allPlans}
          selectedPlanId={selectedPlanId}
          onSelect={(id) => { setSelectedPlanId(id); setHistoryOpen(false); setActiveStep("itens"); }}
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

  const sharedDialogs = (
    <>
      <PlanHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        plans={allPlans}
        selectedPlanId={selectedPlanId}
        onSelect={(id) => { setSelectedPlanId(id); setHistoryOpen(false); setActiveStep("itens"); }}
      />
      <ContractPreviewDialog
        open={contractPreviewOpen}
        onOpenChange={setContractPreviewOpen}
        html={contractPreviewHtml}
        patientName={patient?.name ?? "Paciente"}
        isAccepted={isAccepted}
        isStarted={isStarted}
      />
    </>
  );

  // ─── POST-ACCEPTANCE: management dashboard ─────────────────────────────
  if (isStarted) {
    return (
      <div className="space-y-4">
        <PlanSelectorBar
          allPlans={allPlans}
          selectedPlanId={selectedPlanId}
          setSelectedPlanId={setSelectedPlanId}
          openHistory={() => setHistoryOpen(true)}
          handleCreatePlan={handleCreatePlan}
          creatingNew={creatingNew}
        />
        {sharedDialogs}
        <PlanManagementDashboard
          patientId={patientId}
          selectedPlanId={selectedPlanId}
          selectedPlan={selectedPlan}
          planItems={planItems}
          planItemsKey={planItemsKey}
          patient={patient}
          clinic={clinic}
          form={form}
          setForm={setForm}
          professionals={professionals}
          headerMetrics={headerMetrics}
          isAccepted={isAccepted}
          saving={saving}
          handleSave={handleSave}
          handlePrintPlan={handlePrintPlan}
          handlePrintContract={handlePrintContract}
          onOpenContractPreview={handleOpenContractPreview}
          deleteMutation={deleteMutation}
          onChanged={handleChanged}
        />
      </div>
    );
  }

  // ─── PRE-ACCEPTANCE: setup wizard ─────────────────────────────────────
  return (
    <div className="space-y-4">
      <PlanSelectorBar
        allPlans={allPlans}
        selectedPlanId={selectedPlanId}
        setSelectedPlanId={setSelectedPlanId}
        openHistory={() => setHistoryOpen(true)}
        handleCreatePlan={handleCreatePlan}
        creatingNew={creatingNew}
      />
      {sharedDialogs}

      {/* Wizard status bar */}
      <WizardStatusBar
        selectedPlan={selectedPlan}
        planItemsCount={planItems.length}
        isAccepted={isAccepted}
        handlePrintPlan={handlePrintPlan}
        onOpenContractPreview={handleOpenContractPreview}
        deleteMutation={deleteMutation}
        selectedPlanId={selectedPlanId}
      />

      <PlanStepper
        current={activeStep}
        hasItems={hasItems}
        isAccepted={isAccepted}
        isStarted={isStarted}
        aceiteStats={aceiteStats}
        monthlyMissingCount={monthlyMissingCount}
        billingConfigured={billingConfigured}
        onSelect={setActiveStep}
      />

      <Card className="border-none shadow-sm bg-white overflow-hidden">
        <CardContent className="p-5 sm:p-6">
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
              isAccepted={isAccepted}
              advanceLabel="Avançar para Cobrança"
              onAdvance={() => setActiveStep("cobranca")}
            />
          )}

          {activeStep === "cobranca" && (
            <StepCobranca
              form={form}
              setForm={setForm}
              isAccepted={isAccepted}
              isStarted={isStarted}
              saving={saving}
              handleSave={async () => { await handleSave(); setBillingConfigured(true); }}
              onAdvance={() => setActiveStep("agenda")}
            />
          )}

          {activeStep === "agenda" && (
            <StepAgenda
              patientId={patientId}
              selectedPlanId={selectedPlanId}
              planItems={planItems}
              planItemsKey={planItemsKey}
              isStarted={isStarted}
              monthlyMissingCount={monthlyMissingCount}
              holdTtlMinutes={holdTtlMinutes}
              onHoldTtlChange={setHoldTtlMinutes}
              onHoldCreated={setHoldExpiresAt}
              onAdvance={() => setActiveStep("contrato")}
            />
          )}

          {activeStep === "contrato" && (
            <StepContrato
              patientId={patientId}
              selectedPlanId={selectedPlanId}
              selectedPlan={selectedPlan}
              planItems={planItems}
              patient={patient}
              clinic={clinic}
              form={form}
              monthlyMissingCount={monthlyMissingCount}
              holdExpiresAt={holdExpiresAt}
              holdTtlMinutes={holdTtlMinutes}
              onHoldRenewed={setHoldExpiresAt}
              onChanged={handleChanged}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Plan Management Dashboard (post-acceptance view) ─────────────────────
type DashTab = "resumo" | "financeiro" | "contrato";

function PlanManagementDashboard({
  patientId, selectedPlanId, selectedPlan, planItems, planItemsKey,
  patient, clinic, form, setForm, professionals, headerMetrics,
  isAccepted, saving, handleSave, handlePrintPlan, handlePrintContract,
  onOpenContractPreview, deleteMutation, onChanged,
}: {
  patientId: number;
  selectedPlanId: number;
  selectedPlan: any;
  planItems: PlanProcedureItem[];
  planItemsKey: any;
  patient?: PatientBasic;
  clinic?: ClinicInfo | null;
  form: any;
  setForm: (fn: any) => void;
  professionals: { id: number; name: string }[];
  headerMetrics: { completed: number; totalAll: number; hasGoal: boolean; progress: number; months: number };
  isAccepted: boolean;
  saving: boolean;
  handleSave: () => Promise<void>;
  handlePrintPlan: () => void;
  handlePrintContract: () => void;
  onOpenContractPreview: () => void;
  deleteMutation: any;
  onChanged: () => void;
}) {
  const [activeTab, setActiveTab] = useState<DashTab>("resumo");
  const [clinicalOpen, setClinicalOpen] = useState(false);

  const statusConfig = form.status === "ativo"
    ? {
        gradient: "from-emerald-600 to-teal-700",
        badge: "bg-white/20 text-white border-white/30",
        label: "Em andamento",
        icon: CheckCircle,
      }
    : form.status === "concluido"
    ? {
        gradient: "from-blue-600 to-indigo-700",
        badge: "bg-white/20 text-white border-white/30",
        label: "Concluído",
        icon: BadgeCheck,
      }
    : {
        gradient: "from-slate-500 to-slate-700",
        badge: "bg-white/20 text-white border-white/30",
        label: "Suspenso",
        icon: Clock,
      };

  const StatusIcon = statusConfig.icon;

  const tabs: { key: DashTab; label: string; icon: typeof LayoutDashboard }[] = [
    { key: "resumo", label: "Resumo", icon: LayoutDashboard },
    { key: "financeiro", label: "Financeiro", icon: Wallet },
    { key: "contrato", label: "Contrato", icon: FileText },
  ];

  return (
    <div className="space-y-4">
      {/* ── Hero status card ── */}
      <div className={`rounded-2xl bg-gradient-to-br ${statusConfig.gradient} p-5 sm:p-6 text-white shadow-lg`}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-2">
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${statusConfig.badge}`}>
              <StatusIcon className="w-3.5 h-3.5" />
              {statusConfig.label}
            </span>
            <h3 className="text-xl font-bold">
              Plano {formatDate(selectedPlan?.startDate)}
            </h3>
            <p className="text-white/70 text-sm">
              Iniciado em {fmtBR(selectedPlan?.materializedAt)} · {headerMetrics.months} {headerMetrics.months === 1 ? "mês" : "meses"} de duração
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              onClick={handlePrintPlan}
              className="h-8 gap-1.5 text-xs bg-white/15 hover:bg-white/25 text-white border-white/30 border"
            >
              <Printer className="w-3.5 h-3.5" /> Plano
            </Button>
            {planItems.length > 0 && (
              <Button
                size="sm"
                onClick={onOpenContractPreview}
                className="h-8 gap-1.5 text-xs bg-white/15 hover:bg-white/25 text-white border-white/30 border"
              >
                <ScrollText className="w-3.5 h-3.5" /> Contrato
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  className="h-8 w-8 p-0 bg-transparent hover:bg-white/20 text-white/70 hover:text-white border-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </AlertDialogTrigger>
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

        {/* Progress bar */}
        {headerMetrics.hasGoal && (
          <div className="mt-5 space-y-1.5">
            <div className="flex justify-between text-xs text-white/80">
              <span>Progresso das sessões</span>
              <span className="font-semibold">
                {headerMetrics.completed}/{headerMetrics.totalAll} concluídas
              </span>
            </div>
            <div className="h-2 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-2 bg-white rounded-full transition-all duration-700"
                style={{ width: `${headerMetrics.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Key metrics */}
        <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-white/20">
          <div className="text-center">
            <p className="text-white/60 text-[10px] uppercase tracking-wider font-semibold">Início</p>
            <p className="text-white font-bold text-sm mt-0.5">{formatDate(selectedPlan?.startDate) || "—"}</p>
          </div>
          <div className="text-center">
            <p className="text-white/60 text-[10px] uppercase tracking-wider font-semibold">Vigência</p>
            <p className="text-white font-bold text-sm mt-0.5">
              {headerMetrics.months} {headerMetrics.months === 1 ? "mês" : "meses"}
            </p>
          </div>
          <div className="text-center">
            <p className="text-white/60 text-[10px] uppercase tracking-wider font-semibold">Itens</p>
            <p className="text-white font-bold text-sm mt-0.5">{planItems.length}</p>
          </div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex gap-1 bg-slate-100/80 p-1 rounded-xl">
        {tabs.map((tab) => {
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={[
                "flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-all",
                activeTab === tab.key
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              ].join(" ")}
            >
              <TabIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden text-xs">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Tab content ── */}
      {activeTab === "resumo" && (
        <DashResumoTab
          selectedPlan={selectedPlan}
          planItems={planItems}
          form={form}
          setForm={setForm}
          professionals={professionals}
          clinicalOpen={clinicalOpen}
          setClinicalOpen={setClinicalOpen}
          saving={saving}
          handleSave={handleSave}
        />
      )}

      {activeTab === "financeiro" && (
        <DashFinanceiroTab
          patientId={patientId}
          selectedPlanId={selectedPlanId}
          selectedPlan={selectedPlan}
          planItems={planItems}
          form={form}
          onChanged={onChanged}
        />
      )}

      {activeTab === "contrato" && (
        <DashContratoTab
          patientId={patientId}
          selectedPlanId={selectedPlanId}
          selectedPlan={selectedPlan}
          planItems={planItems}
          patient={patient}
          clinic={clinic}
          form={form}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}

// ─── Dashboard: Resumo tab ─────────────────────────────────────────────────
function DashResumoTab({
  selectedPlan, planItems, form, setForm, professionals,
  clinicalOpen, setClinicalOpen, saving, handleSave,
}: {
  selectedPlan: any;
  planItems: PlanProcedureItem[];
  form: any;
  setForm: (fn: any) => void;
  professionals: { id: number; name: string }[];
  clinicalOpen: boolean;
  setClinicalOpen: (v: boolean) => void;
  saving: boolean;
  handleSave: () => Promise<void>;
}) {
  const updateForm = (patch: any) => setForm((p: any) => ({ ...p, ...patch }));

  const endDate = (() => {
    if (!selectedPlan?.startDate || !selectedPlan?.durationMonths) return null;
    const d = new Date(selectedPlan.startDate + "T00:00:00");
    d.setMonth(d.getMonth() + selectedPlan.durationMonths);
    return d.toISOString().slice(0, 10);
  })();

  const monthlyItems = planItems.filter(i => i.packageType === "mensal");
  const avulsoItems = planItems.filter(i => i.packageType !== "mensal");

  return (
    <div className="space-y-4">
      {/* Plan period */}
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <CalendarRange className="w-4 h-4 text-primary" />
          </div>
          <h4 className="text-sm font-bold text-slate-800">Período do plano</h4>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCell label="Início" value={fmtBR(selectedPlan?.startDate)} />
          <StatCell label="Término previsto" value={fmtBR(endDate)} />
          <StatCell label="Duração" value={`${selectedPlan?.durationMonths ?? "—"} meses`} />
          <StatCell label="Profissional" value={form.responsibleProfessional || "—"} />
        </div>
      </div>

      {/* Items summary */}
      {planItems.length > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-8 w-8 rounded-xl bg-violet-100 flex items-center justify-center">
              <ClipboardList className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-800">Itens do plano</h4>
              <p className="text-[11px] text-slate-400">{planItems.length} item{planItems.length !== 1 ? "s" : ""} contratados</p>
            </div>
          </div>

          <div className="space-y-2">
            {monthlyItems.length > 0 && (
              <>
                <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-1">
                  Recorrentes mensais
                </p>
                {monthlyItems.map((item: any) => (
                  <PlanItemRow key={item.id} item={item} />
                ))}
              </>
            )}
            {avulsoItems.length > 0 && (
              <>
                <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-1 mt-3">
                  Avulsos / pacotes
                </p>
                {avulsoItems.map((item: any) => (
                  <PlanItemRow key={item.id} item={item} />
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* Clinical details — collapsible edit section */}
      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setClinicalOpen(!clinicalOpen)}
          className="w-full flex items-center justify-between p-4 sm:p-5 text-left hover:bg-slate-50/60 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Stethoscope className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-slate-700">Detalhes clínicos</span>
            <span className="text-[11px] text-slate-400 font-normal hidden sm:inline">
              objetivos, condutas, profissional, status
            </span>
          </span>
          {clinicalOpen
            ? <ChevronUp className="w-4 h-4 text-slate-400" />
            : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {clinicalOpen && (
          <div className="border-t border-slate-100 p-5 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-600 font-semibold flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-primary" /> Objetivos terapêuticos
                </Label>
                <Textarea
                  className="min-h-[120px] bg-slate-50 border-slate-200 focus:bg-white text-sm"
                  placeholder="Quais são os objetivos do tratamento?"
                  value={form.objectives}
                  onChange={(e) => updateForm({ objectives: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-600 font-semibold flex items-center gap-2">
                  <Stethoscope className="w-3.5 h-3.5 text-primary" /> Condutas e técnicas
                </Label>
                <Textarea
                  className="min-h-[120px] bg-slate-50 border-slate-200 focus:bg-white text-sm"
                  placeholder="Quais técnicas serão aplicadas?"
                  value={form.techniques}
                  onChange={(e) => updateForm({ techniques: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-600 font-semibold flex items-center gap-2">
                  <UserCheck className="w-3.5 h-3.5 text-primary" /> Profissional responsável
                </Label>
                <Select
                  value={form.responsibleProfessional || "_none"}
                  onValueChange={(v) => updateForm({ responsibleProfessional: v === "_none" ? "" : v })}
                >
                  <SelectTrigger className="bg-slate-50 border-slate-200 h-10">
                    <SelectValue placeholder="Selecionar profissional…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Não definido —</SelectItem>
                    {professionals.map((p) => (
                      <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-slate-600 font-semibold">Status do plano</Label>
                <Select
                  value={form.status}
                  onValueChange={(v: "ativo" | "concluido" | "suspenso") => updateForm({ status: v })}
                >
                  <SelectTrigger className="bg-slate-50 border-slate-200 h-10">
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

            {/* Internal notes */}
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
                placeholder="Combinados com a recepção, particularidades…"
                value={form.internalNotes}
                onChange={(e) => updateForm({ internalNotes: e.target.value })}
                maxLength={5000}
              />
            </div>

            <div className="flex justify-end">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="h-10 px-6 rounded-xl gap-1.5 shadow-md shadow-primary/20"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Salvar alterações
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-700">{value}</p>
    </div>
  );
}

function PlanItemRow({ item }: { item: any }) {
  const isMonthly = item.packageType === "mensal";
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-700 truncate">
          {item.procedureName || item.packageName || "—"}
        </p>
        {isMonthly && item.sessionsPerWeek && (
          <p className="text-[11px] text-slate-400">{item.sessionsPerWeek}x/semana</p>
        )}
        {!isMonthly && item.totalSessions && (
          <p className="text-[11px] text-slate-400">{item.totalSessions} sessões</p>
        )}
      </div>
      <span className={[
        "text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0",
        isMonthly
          ? "bg-blue-50 text-blue-700 border-blue-200"
          : "bg-violet-50 text-violet-700 border-violet-200",
      ].join(" ")}>
        {isMonthly ? "Mensal" : "Avulso"}
      </span>
    </div>
  );
}

// ─── Dashboard: Financeiro tab ─────────────────────────────────────────────
function DashFinanceiroTab({
  patientId, selectedPlanId, selectedPlan, planItems, form, onChanged,
}: {
  patientId: number;
  selectedPlanId: number;
  selectedPlan: any;
  planItems: PlanProcedureItem[];
  form: any;
  onChanged: () => void;
}) {
  return (
    <div className="space-y-4">
      <PlanInstallmentsPanel
        patientId={patientId}
        planId={selectedPlanId}
        isAccepted={true}
        isMaterialized={true}
      />

      {form.avulsoBillingMode !== "mensalConsolidado" && (
        <AvulsoMonthlyEstimate
          planItems={planItems as any}
          durationMonths={selectedPlan?.durationMonths ?? form.durationMonths ?? 12}
          planStartDate={selectedPlan?.startDate ?? form.startDate ?? null}
        />
      )}

      {form.avulsoBillingMode === "mensalConsolidado" && (
        <CloseMonthBlock
          patientId={patientId}
          planId={selectedPlanId}
          startDate={selectedPlan?.startDate ?? form.startDate ?? null}
          durationMonths={selectedPlan?.durationMonths ?? form.durationMonths ?? null}
          onClosed={onChanged}
        />
      )}

      <CreditsStatementBlock patientId={patientId} />
    </div>
  );
}

// ─── Dashboard: Contrato tab ───────────────────────────────────────────────
function DashContratoTab({
  patientId, selectedPlanId, selectedPlan, planItems, patient, clinic, form, onChanged,
}: {
  patientId: number;
  selectedPlanId: number;
  selectedPlan: any;
  planItems: PlanProcedureItem[];
  patient?: PatientBasic;
  clinic?: ClinicInfo | null;
  form: any;
  onChanged: () => void;
}) {
  return (
    <div className="space-y-4">
      <ContractAcceptanceBlock
        patientId={patientId}
        planId={selectedPlanId}
        plan={selectedPlan}
        patientName={patient?.name ?? ""}
        patientPhone={patient?.phone ?? null}
        patientEmail={(patient as any)?.email ?? null}
        clinicName={clinic?.name ?? null}
        onChanged={onChanged}
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
    </div>
  );
}

// ─── Wizard status bar (pre-acceptance) ───────────────────────────────────
function WizardStatusBar({
  selectedPlan, planItemsCount, isAccepted,
  handlePrintPlan, onOpenContractPreview, deleteMutation, selectedPlanId,
}: {
  selectedPlan: any;
  planItemsCount: number;
  isAccepted: boolean;
  handlePrintPlan: () => void;
  onOpenContractPreview: () => void;
  deleteMutation: any;
  selectedPlanId: number;
}) {
  const isAcceptedStatus = isAccepted;

  return (
    <div className={[
      "rounded-2xl border px-4 py-3 shadow-sm",
      isAcceptedStatus
        ? "bg-blue-50/60 border-blue-100"
        : "bg-amber-50/50 border-amber-100",
    ].join(" ")}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Left: identity + status */}
        <div className="flex items-start gap-3 min-w-0">
          <div className={[
            "mt-0.5 h-8 w-8 rounded-xl flex items-center justify-center shrink-0",
            isAcceptedStatus ? "bg-blue-100" : "bg-amber-100",
          ].join(" ")}>
            <ClipboardList className={[
              "w-4 h-4",
              isAcceptedStatus ? "text-blue-600" : "text-amber-600",
            ].join(" ")} />
          </div>

          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-slate-800">
                Plano {formatDate(selectedPlan?.startDate) || "—"}
              </span>
              {isAcceptedStatus ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                  <BadgeCheck className="w-3 h-3" /> Aceito · aguardando início
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                  <Clock className="w-3 h-3" /> Rascunho
                </span>
              )}
            </div>
            <p className={[
              "text-[11px] leading-none",
              planItemsCount === 0 ? "text-rose-400 font-medium" : "text-slate-500",
            ].join(" ")}>
              {planItemsCount === 0
                ? "Nenhum item adicionado ainda"
                : `${planItemsCount} ${planItemsCount === 1 ? "item" : "itens"} · configure e colete a assinatura para iniciar`}
            </p>
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1.5 shrink-0 pl-11 sm:pl-0">
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs rounded-xl bg-white border-slate-200 hover:bg-slate-50 shadow-sm"
            onClick={handlePrintPlan}
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-slate-700">Plano</span>
          </Button>
          {planItemsCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs rounded-xl bg-white border-slate-200 hover:bg-slate-50 shadow-sm"
              onClick={onOpenContractPreview}
            >
              <ScrollText className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-slate-700">Contrato</span>
            </Button>
          )}

          <div className="w-px h-5 bg-slate-200 mx-0.5" />

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </AlertDialogTrigger>
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

// ─── Plan Selector Bar ─────────────────────────────────────────────────────
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
  const selectedPlan = allPlans.find(p => p.id === selectedPlanId);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <ClipboardList className="w-3.5 h-3.5 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-sm leading-tight">Planos de Tratamento</h3>
            <p className="text-[11px] text-slate-400 leading-tight mt-0.5">
              {allPlans.length === 0
                ? "Nenhum plano criado"
                : `${allPlans.length} plano${allPlans.length !== 1 ? "s" : ""} · selecione ou crie novo`}
            </p>
          </div>
        </div>

        {/* New plan button — always visible */}
        <Button
          size="sm"
          className="h-8 gap-1.5 rounded-xl text-xs shadow-sm shadow-primary/20"
          onClick={handleCreatePlan}
          disabled={creatingNew}
        >
          {creatingNew
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Plus className="w-3.5 h-3.5" />}
          Novo plano
        </Button>
      </div>

      {/* Controls row — only when plans exist */}
      {allPlans.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-2.5 bg-slate-50/60">
          {/* Plan selector */}
          <Select
            value={String(selectedPlanId ?? "")}
            onValueChange={(v) => setSelectedPlanId(Number(v))}
          >
            <SelectTrigger className="flex-1 sm:max-w-[280px] h-8 bg-white border-slate-200 rounded-xl text-sm shadow-sm">
              <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                {selectedPlan && (
                  <span className={[
                    "h-2 w-2 rounded-full shrink-0",
                    selectedPlan.status === "ativo"
                      ? "bg-emerald-500"
                      : selectedPlan.status === "concluido"
                        ? "bg-blue-400"
                        : "bg-slate-300",
                  ].join(" ")} />
                )}
                <SelectValue placeholder="Selecione um plano..." />
              </div>
            </SelectTrigger>
            <SelectContent>
              {allPlans.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  <div className="flex items-center gap-2">
                    <span className={[
                      "h-2 w-2 rounded-full shrink-0",
                      p.status === "ativo"
                        ? "bg-emerald-500"
                        : p.status === "concluido"
                          ? "bg-blue-400"
                          : "bg-slate-300",
                    ].join(" ")} />
                    <span>
                      Plano {formatDate(p.startDate)}
                      {p.status === "ativo" ? " (Atual)" : ""}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* History button */}
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 rounded-xl text-xs bg-white border-slate-200 hover:bg-slate-50 shadow-sm shrink-0"
            onClick={openHistory}
          >
            <History className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="text-slate-700">Histórico</span>
            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold flex items-center justify-center">
              {allPlans.length}
            </span>
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Step 1 — Itens ────────────────────────────────────────────────────────
function StepItens({
  patientId, selectedPlanId, planItems, planItemsKey, form, setForm, professionals,
  clinicalOpen, setClinicalOpen, saving, handleSave, hasItems, isAccepted,
  advanceLabel = "Avançar", onAdvance,
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
  isAccepted: boolean;
  advanceLabel?: string;
  onAdvance: () => void;
}) {
  const updateForm = (patch: any) => setForm((p: any) => ({ ...p, ...patch }));

  return (
    <div className="space-y-6">
      {/* Period */}
      <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-slate-50/60 to-transparent p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
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
            <Label className="text-xs text-slate-600">Vigência (meses)</Label>
            <div className="relative">
              <Input
                type="number"
                min={1}
                max={MAX_PLAN_DURATION_MONTHS}
                className="bg-white border-slate-200 h-10 pr-16"
                value={form.durationMonths ?? 12}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  const clamped = Math.min(Math.max(1, raw), MAX_PLAN_DURATION_MONTHS);
                  updateForm({ durationMonths: clamped });
                }}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                {(form.durationMonths ?? 12) === 1 ? "mês" : "meses"}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              De 1 a {MAX_PLAN_DURATION_MONTHS} meses.
            </p>
          </div>
        </div>
      </div>

      {/* Items */}
      <TreatmentPlanItemsSection
        planId={selectedPlanId}
        planItems={planItems}
        planItemsKey={planItemsKey}
        planDurationMonths={form.durationMonths ?? 12}
        planStartDate={form.startDate ?? null}
        isAccepted={isAccepted}
      />

      {/* Clinical details (collapsible) */}
      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setClinicalOpen(!clinicalOpen)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50/60 transition-colors"
        >
          <span className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Stethoscope className="w-4 h-4 text-primary" />
            Detalhes clínicos
            <span className="text-[10px] text-slate-400 font-normal">
              objetivos, condutas, profissional, observações
            </span>
          </span>
          {clinicalOpen
            ? <ChevronUp className="w-4 h-4 text-slate-400" />
            : <ChevronDown className="w-4 h-4 text-slate-400" />}
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
                  className="min-h-[140px] bg-slate-50 border-slate-200 focus:bg-white"
                  placeholder="Quais técnicas serão aplicadas?"
                  value={form.techniques}
                  onChange={(e) => updateForm({ techniques: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-primary" /> Profissional responsável
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
                      <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700">Status do plano</Label>
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
              </div>
            </div>

            {/* Internal notes */}
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
                placeholder="Combinados com a recepção, particularidades de convênio…"
                value={form.internalNotes}
                onChange={(e) => updateForm({ internalNotes: e.target.value })}
                maxLength={5000}
              />
              <p className="text-[11px] text-amber-700/80">
                Visível apenas dentro do sistema.
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

      <div className="flex flex-col sm:flex-row gap-2 sm:justify-end pt-1">
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
          {advanceLabel} <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Step 2 — Cobrança ─────────────────────────────────────────────────────
function StepCobranca({
  form, setForm, isAccepted, isStarted, saving, handleSave, onAdvance,
}: {
  form: any;
  setForm: (fn: any) => void;
  isAccepted: boolean;
  isStarted: boolean;
  saving: boolean;
  handleSave: () => void | Promise<void>;
  onAdvance: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 text-xs text-blue-900 leading-relaxed">
        <strong>Antes da assinatura:</strong> definir como o paciente vai pagar
        permite que o contrato gerado já inclua valores, vencimentos e validade
        dos créditos — sem revisões depois.
      </div>

      <BillingSettingsBlock form={form} setForm={setForm} isAccepted={isAccepted} />

      {isStarted && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-800 flex items-center gap-2">
          <BadgeCheck className="w-4 h-4" />
          Plano já iniciado — alterações de cobrança só por renegociação.
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2 sm:justify-end pt-1">
        <Button
          variant="outline"
          onClick={handleSave}
          className="h-11 px-6 rounded-xl gap-1.5 order-2 sm:order-1"
          disabled={saving || isStarted}
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Salvar configurações
        </Button>
        <Button
          onClick={async () => { if (!isStarted) await handleSave(); onAdvance(); }}
          className="h-11 px-6 rounded-xl shadow-md shadow-primary/20 gap-1.5 order-1 sm:order-2"
          disabled={saving}
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Avançar para Agenda <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Step 3 — Agenda ───────────────────────────────────────────────────────
function StepAgenda({
  patientId, selectedPlanId, planItems, planItemsKey, isStarted,
  monthlyMissingCount, holdTtlMinutes, onHoldTtlChange, onHoldCreated, onAdvance,
}: {
  patientId: number;
  selectedPlanId: number;
  planItems: PlanProcedureItem[];
  planItemsKey: any;
  isStarted: boolean;
  monthlyMissingCount: number;
  holdTtlMinutes: number;
  onHoldTtlChange: (v: number) => void;
  onHoldCreated: (expiresAt: string) => void;
  onAdvance: () => void;
}) {
  const allMonthlyConfigured = monthlyMissingCount === 0;
  const { toast } = useToast();
  const [reserving, setReserving] = useState(false);

  async function handleAdvance() {
    if (isStarted) { onAdvance(); return; }
    setReserving(true);
    try {
      const { reservePlanSlots } = await import("./treatment-plan/usePlanSlotHolds");
      const result = await reservePlanSlots(
        patientId, selectedPlanId, planItems as PlanItemForHold[], holdTtlMinutes,
      );
      if (!result.ok) {
        const conflicts = result.conflicts ?? [];
        const previewMsg = conflicts.slice(0, 3).map((c) => `• ${c.message}`).join("\n");
        const more = conflicts.length > 3 ? `\n…e mais ${conflicts.length - 3}` : "";
        toast({
          title: "Horários indisponíveis",
          description:
            (previewMsg || "Alguns horários foram reservados por outro paciente.") +
            more + "\nVolte para Agenda e escolha outros horários.",
          variant: "destructive",
        });
        return;
      }
      if (result.expiresAt) onHoldCreated(result.expiresAt);
      onAdvance();
    } catch (err) {
      toast({
        title: "Erro ao reservar horários",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setReserving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 text-xs text-blue-900 leading-relaxed">
        Defina <strong>agora</strong> a agenda, os dias da semana e os horários de
        cada item. Nada é gravado na agenda do paciente até a etapa Contrato —
        aqui é só o desenho.
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-5 space-y-4 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-blue-100 flex items-center justify-center">
            <CalendarRange className="w-4 h-4 text-blue-700" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-800">Agenda do paciente</h4>
            <p className="text-[11px] text-slate-500">
              Escolha a agenda, os dias e os horários — sugerimos só slots realmente livres
            </p>
          </div>
        </div>

        <PlanScheduleEditor
          planId={selectedPlanId}
          planItems={planItems as any}
          planItemsKey={planItemsKey}
          isMaterialized={isStarted}
        />
      </div>

      {!allMonthlyConfigured && !isStarted && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            {monthlyMissingCount === 1
              ? "1 item recorrente ainda está sem dia ou horário."
              : `${monthlyMissingCount} itens recorrentes ainda estão sem dia ou horário.`}{" "}
            Defina antes de avançar.
          </span>
        </div>
      )}

      {!isStarted && (
        <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 flex flex-col sm:flex-row sm:items-end gap-4 shadow-sm">
          <div className="flex-1 space-y-1">
            <Label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              Validade da proposta
            </Label>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Tempo em que os horários ficarão reservados enquanto o paciente lê e assina o contrato.
            </p>
            <Select
              value={String(holdTtlMinutes)}
              onValueChange={(v) => onHoldTtlChange(Number(v))}
            >
              <SelectTrigger className="h-9 w-full sm:w-44 bg-white border-slate-200 rounded-xl text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOLD_TTL_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleAdvance}
            disabled={(!allMonthlyConfigured && !isStarted) || reserving}
            className="h-11 px-6 rounded-xl shadow-md shadow-primary/20 gap-1.5 shrink-0"
          >
            {reserving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Reservando…</>
              : <>Avançar para Contrato <ArrowRight className="w-4 h-4" /></>}
          </Button>
        </div>
      )}

      {isStarted && (
        <div className="flex justify-end pt-2">
          <Button
            onClick={handleAdvance}
            className="h-11 px-6 rounded-xl shadow-md shadow-primary/20 gap-1.5"
          >
            Ver Contrato <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Step 4 — Contrato (pre-acceptance only) ───────────────────────────────
function StepContrato({
  patientId, selectedPlanId, selectedPlan, planItems,
  patient, clinic, form, monthlyMissingCount,
  holdExpiresAt, holdTtlMinutes, onHoldRenewed, onChanged,
}: {
  patientId: number;
  selectedPlanId: number;
  selectedPlan: any;
  planItems: PlanProcedureItem[];
  patient: PatientBasic | undefined;
  clinic: ClinicInfo | null | undefined;
  form: any;
  monthlyMissingCount: number;
  holdExpiresAt: string | null;
  holdTtlMinutes: number;
  onHoldRenewed: (expiresAt: string) => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [remaining, setRemaining] = useState<number | null>(null);
  const [renewing, setRenewing] = useState(false);

  useEffect(() => {
    if (!holdExpiresAt) { setRemaining(null); return; }
    function calcRemaining() {
      return Math.max(0, Math.floor((new Date(holdExpiresAt!).getTime() - Date.now()) / 1000));
    }
    setRemaining(calcRemaining());
    const interval = setInterval(() => setRemaining(calcRemaining()), 1000);
    return () => clearInterval(interval);
  }, [holdExpiresAt]);

  async function handleRenew() {
    setRenewing(true);
    try {
      const { reservePlanSlots } = await import("./treatment-plan/usePlanSlotHolds");
      const result = await reservePlanSlots(
        patientId, selectedPlanId, planItems as PlanItemForHold[], holdTtlMinutes,
      );
      if (result.ok && result.expiresAt) {
        onHoldRenewed(result.expiresAt);
        toast({
          title: "Reserva renovada",
          description: `Horários reservados por mais ${holdTtlMinutes} minutos.`,
        });
      } else if (!result.ok) {
        const conflicts = result.conflicts ?? [];
        const preview = conflicts.slice(0, 2).map((c) => `• ${c.message}`).join("\n");
        toast({
          title: "Conflito ao renovar",
          description:
            (preview || "Alguns horários já foram ocupados.") +
            "\nVolte para Agenda e escolha outros horários.",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({ title: "Erro ao renovar reserva", description: (err as Error).message, variant: "destructive" });
    } finally {
      setRenewing(false);
    }
  }

  const isUrgent = remaining !== null && remaining <= 180 && remaining > 0;
  const isExpired = remaining !== null && remaining === 0;

  return (
    <div className="space-y-5">
      {/* Hold countdown */}
      {holdExpiresAt && remaining !== null && (
        <div className={`rounded-xl border p-3.5 flex items-center gap-3 ${
          isExpired
            ? "border-red-200 bg-red-50"
            : isUrgent
            ? "border-amber-200 bg-amber-50"
            : "border-green-200 bg-green-50"
        }`}>
          <div className={`p-2 rounded-lg shrink-0 ${
            isExpired ? "bg-red-100" : isUrgent ? "bg-amber-100" : "bg-green-100"
          }`}>
            <Clock className={`w-4 h-4 ${
              isExpired ? "text-red-600" : isUrgent ? "text-amber-600" : "text-green-600"
            }`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-xs font-semibold ${
              isExpired ? "text-red-800" : isUrgent ? "text-amber-800" : "text-green-800"
            }`}>
              {isExpired
                ? "Reserva expirada — os horários podem ter sido liberados"
                : isUrgent
                ? `Reserva expirando em ${formatCountdown(remaining)}`
                : `Horários reservados · ${formatCountdown(remaining)} restantes`}
            </p>
            <p className={`text-[11px] mt-0.5 ${
              isExpired ? "text-red-600" : isUrgent ? "text-amber-600" : "text-green-600"
            }`}>
              {isExpired
                ? "Renove para garantir a agenda antes de coletar a assinatura."
                : isUrgent
                ? "Renove a reserva se precisar de mais tempo."
                : "Os slots ficarão reservados até expirar ou o plano ser assinado."}
            </p>
          </div>
          <Button
            size="sm"
            variant={isExpired || isUrgent ? "default" : "outline"}
            onClick={handleRenew}
            disabled={renewing}
            className={`shrink-0 h-8 px-3 gap-1.5 rounded-lg text-xs ${
              isExpired || isUrgent
                ? "bg-primary text-white shadow-md shadow-primary/20"
                : "border-green-300 text-green-700 hover:bg-green-50"
            }`}
          >
            {renewing
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Renovando…</>
              : <><RefreshCw className="w-3.5 h-3.5" /> Renovar</>}
          </Button>
        </div>
      )}

      {monthlyMissingCount > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Existem itens recorrentes sem agenda definida. Volte para a etapa
            Agenda antes de coletar a assinatura.
          </span>
        </div>
      )}

      <ContractAcceptanceBlock
        patientId={patientId}
        planId={selectedPlanId}
        plan={selectedPlan}
        patientName={patient?.name ?? ""}
        patientPhone={patient?.phone ?? null}
        patientEmail={(patient as any)?.email ?? null}
        clinicName={clinic?.name ?? null}
        onChanged={onChanged}
      />
    </div>
  );
}
