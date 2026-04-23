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
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

// ─── Print stack & shared formatters extraídos para patient-detail/ ──────────
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
  const emptyForm = { objectives: "", techniques: "", frequency: "", estimatedSessions: "" as string | number, startDate: "", responsibleProfessional: "", status: "ativo" as "ativo" | "concluido" | "suspenso" };
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
      await apiSendJson(`/api/treatment-plans/${selectedPlanId}`, "PUT", {
        ...form,
        estimatedSessions: form.estimatedSessions ? Number(form.estimatedSessions) : null,
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
        startDate: todayBRTDate(),
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
    mutationFn: (id: number) => apiSendJson(`/api/treatment-plans/${id}`, "DELETE"),
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 rounded-xl">
            <ClipboardList className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">Planos de Tratamento</h3>
            <p className="text-xs text-slate-400">Gerencie os objetivos e condutas do paciente</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {allPlans.length > 0 && (
            <Select value={String(selectedPlanId ?? "")} onValueChange={v => setSelectedPlanId(Number(v))}>
              <SelectTrigger className="w-[240px] bg-slate-50 border-slate-200">
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

          <Button size="sm" variant="outline" className="gap-1.5 rounded-xl border-primary/30 text-primary hover:bg-primary/5"
            onClick={handleCreatePlan} disabled={creatingNew}>
            {creatingNew ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Novo Plano
          </Button>
        </div>
      </div>

      {selectedPlanId ? (
        <Card className="border-none shadow-sm overflow-hidden bg-white">
          <CardHeader className="border-b border-slate-50 bg-slate-50/30 pb-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    Detalhes do Tratamento
                    <Badge variant={selectedPlan?.status === "ativo" ? "default" : "secondary"} className="capitalize h-5 text-[10px]">
                      {selectedPlan?.status || "Ativo"}
                    </Badge>
                  </CardTitle>
                </div>
                <CardDescription className="text-xs">
                  Iniciado em {formatDate(selectedPlan?.startDate)} • {planItems.length} item(s) vinculados
                </CardDescription>
              </div>

              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={handlePrintPlan}>
                  <Printer className="w-3.5 h-3.5" /> Plano
                </Button>
                <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={handlePrintContract}>
                  <ScrollText className="w-3.5 h-3.5" /> Contrato
                </Button>

                <AlertDialog>
                  <Button asChild size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-red-500 hover:bg-red-50">
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

            {/* Status */}
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
            <div className="pt-3 flex justify-end">
              <Button onClick={handleSave} className="h-11 px-8 rounded-xl shadow-md shadow-primary/20" disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
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
