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
import { IndicatorsPanel } from "./AnamnesisTab";

// ─── Extracted from patients/[id].tsx ──────────────────────────────────────

interface EvalFormProps {
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  title: string;
  form: EvalFormState;
  setForm: React.Dispatch<React.SetStateAction<EvalFormState>>;
}

type EvalFormState = typeof emptyEvalForm;

const emptyEvalForm = {
  inspection: "", posture: "", rangeOfMotion: "", muscleStrength: "",
  orthopedicTests: "", functionalDiagnosis: "",
  painScale: null as number | null, palpation: "", gait: "", functionalTests: "",
};

function EvalForm({ onSave, onCancel, saving, title, form, setForm }: EvalFormProps) {
  return (
    <Card className="border-2 border-primary/20 shadow-md">
      <CardHeader className="pb-3 border-b border-slate-100">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-5 space-y-5">

        {/* EVA na Avaliação */}
        <div className="space-y-3 bg-slate-50 rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-semibold text-slate-700">Escala de Dor (EVA) na Avaliação</Label>
              <p className="text-xs text-slate-400 mt-0.5">0 (sem dor) a 10 (dor máxima)</p>
            </div>
            {form.painScale !== null ? (
              <div className={`flex items-center justify-center w-12 h-12 rounded-full font-bold text-xl text-white shadow-md ${
                form.painScale >= 7 ? "bg-red-500" : form.painScale >= 4 ? "bg-orange-400" : "bg-green-500"
              }`}>{form.painScale}</div>
            ) : (
              <span className="text-xs text-slate-400 italic">não avaliada</span>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {[null, 0,1,2,3,4,5,6,7,8,9,10].map(v => (
              <button key={v === null ? "none" : v} type="button"
                onClick={() => setForm({ ...form, painScale: v })}
                className={`w-9 h-9 rounded-lg text-sm font-semibold border-2 transition-all ${
                  form.painScale === v
                    ? v === null ? "bg-slate-200 border-slate-400 text-slate-700"
                      : v >= 7 ? "bg-red-500 border-red-600 text-white"
                      : v >= 4 ? "bg-orange-400 border-orange-500 text-white"
                      : "bg-green-500 border-green-600 text-white"
                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"
                }`}>
                {v === null ? "—" : v}
              </button>
            ))}
          </div>
        </div>

        {/* Inspeção e Postura */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { key: "inspection", label: "Inspeção", placeholder: "Postura geral, assimetrias, cicatrizes, edemas observados..." },
            { key: "posture", label: "Postura", placeholder: "Análise anterior, posterior e lateral, plomada, desvios..." },
            { key: "rangeOfMotion", label: "Amplitude de Movimento (ADM)", placeholder: "Graus de movimento em cada plano, comparação bilateral..." },
            { key: "muscleStrength", label: "Força Muscular", placeholder: "Graus de força (0-5) por grupo muscular, simetria..." },
          ].map(f => (
            <div key={f.key} className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700">{f.label}</Label>
              <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 resize-none text-sm"
                value={(form as any)[f.key]}
                onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                placeholder={f.placeholder} />
            </div>
          ))}
        </div>

        {/* Palpação e Marcha */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Palpação</Label>
            <Textarea className="min-h-[75px] bg-slate-50 border-slate-200 resize-none text-sm"
              value={form.palpation} onChange={e => setForm({ ...form, palpation: e.target.value })}
              placeholder="Pontos dolorosos, tensão muscular, espasmos, temperatura, edema à palpação..." />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Marcha e Equilíbrio</Label>
            <Textarea className="min-h-[75px] bg-slate-50 border-slate-200 resize-none text-sm"
              value={form.gait} onChange={e => setForm({ ...form, gait: e.target.value })}
              placeholder="Padrão de marcha, cadência, equilíbrio estático/dinâmico, uso de dispositivos..." />
          </div>
        </div>

        {/* Testes Ortopédicos */}
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Testes Ortopédicos / Especiais</Label>
          <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 resize-none text-sm"
            value={form.orthopedicTests} onChange={e => setForm({ ...form, orthopedicTests: e.target.value })}
            placeholder="Ex: Lasègue (+), Phalen (+), Neer (-), Thomas... — informe o teste e resultado..." />
        </div>

        {/* Testes Funcionais e Escalas */}
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Testes Funcionais e Escalas Validadas</Label>
          <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 resize-none text-sm"
            value={form.functionalTests} onChange={e => setForm({ ...form, functionalTests: e.target.value })}
            placeholder="Ex: DASH: 42/100 | Berg: 48/56 | Barthel: 85/100 | SF-36 | WOMAC | NDI..." />
        </div>

        {/* Diagnóstico Funcional */}
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Target className="w-3.5 h-3.5 text-primary" />Diagnóstico Funcional</Label>
          <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 resize-none text-sm"
            value={form.functionalDiagnosis} onChange={e => setForm({ ...form, functionalDiagnosis: e.target.value })}
            placeholder="Conclusão da avaliação: diagnóstico fisioterapêutico, prognóstico e objetivos do tratamento..." />
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <Button variant="outline" onClick={onCancel} className="rounded-xl">Cancelar</Button>
          <Button onClick={onSave} className="rounded-xl" disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Salvar Avaliação
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function EvaluationsTab({ patientId }: { patientId: number }) {
  const { data: evaluations = [], isLoading } = useListEvaluations(patientId);
  const createMutation = useCreateEvaluation();
  const updateMutation = useUpdateEvaluation();
  const deleteMutation = useDeleteEvaluation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyEvalForm);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/evaluations`] });

  const handleCreate = () => {
    createMutation.mutate({ patientId, data: form }, {
      onSuccess: () => {
        toast({ title: "Avaliação criada", description: "Nova avaliação registrada com sucesso." });
        invalidate();
        queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/journey`] });
        setForm(emptyEvalForm);
        setShowForm(false);
      },
      onError: () => toast({ title: "Erro", description: "Não foi possível salvar.", variant: "destructive" }),
    });
  };

  const handleUpdate = (id: number) => {
    updateMutation.mutate({ patientId, evaluationId: id, data: form }, {
      onSuccess: () => {
        toast({ title: "Avaliação atualizada", description: "Alterações salvas com sucesso." });
        invalidate();
        setEditingId(null);
        setForm(emptyEvalForm);
      },
      onError: () => toast({ title: "Erro", description: "Não foi possível atualizar.", variant: "destructive" }),
    });
  };

  const handleDelete = (id: number) => {
    if (!window.confirm("Excluir esta avaliação permanentemente?")) return;
    deleteMutation.mutate({ patientId, evaluationId: id }, {
      onSuccess: () => {
        toast({ title: "Avaliação excluída" });
        invalidate();
        if (expandedId === id) setExpandedId(null);
      },
      onError: () => toast({ title: "Erro ao excluir", variant: "destructive" }),
    });
  };

  const startEdit = (ev: any) => {
    setEditingId(ev.id);
    setExpandedId(null);
    setShowForm(false);
    setForm({
      inspection: ev.inspection || "",
      posture: ev.posture || "",
      rangeOfMotion: ev.rangeOfMotion || "",
      muscleStrength: ev.muscleStrength || "",
      orthopedicTests: ev.orthopedicTests || "",
      functionalDiagnosis: ev.functionalDiagnosis || "",
      painScale: ev.painScale ?? null,
      palpation: ev.palpation || "",
      gait: ev.gait || "",
      functionalTests: ev.functionalTests || "",
    });
  };

  if (isLoading) return <div className="p-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>;

  return (
    <div className="space-y-4">

      {/* ── Indicadores de Resultado ── */}
      <IndicatorsPanel patientId={patientId} />

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Avaliações Físicas</h3>
          <p className="text-sm text-slate-500">{evaluations.length} avaliação(ões) registrada(s)</p>
        </div>
        <Button onClick={() => { setShowForm(!showForm); setEditingId(null); setForm(emptyEvalForm); }} className="h-10 px-5 rounded-xl">
          <Plus className="w-4 h-4 mr-2" /> Nova Avaliação
        </Button>
      </div>

      {showForm && !editingId && (
        <EvalForm
          title="Nova Avaliação Fisioterapêutica"
          onSave={handleCreate}
          onCancel={() => { setShowForm(false); setForm(emptyEvalForm); }}
          saving={createMutation.isPending}
          form={form}
          setForm={setForm}
        />
      )}

      {evaluations.length === 0 && !showForm ? (
        <Card className="border-dashed border-2 border-slate-200">
          <CardContent className="p-12 text-center text-slate-400">
            <Activity className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Nenhuma avaliação registrada</p>
            <p className="text-sm mt-1">Clique em "Nova Avaliação" para adicionar.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {evaluations.map((ev, idx) => (
            <div key={ev.id}>
              {editingId === ev.id ? (
                <EvalForm
                  title={`Editar Avaliação #${evaluations.length - idx}`}
                  onSave={() => handleUpdate(ev.id)}
                  onCancel={() => { setEditingId(null); setForm(emptyEvalForm); }}
                  saving={updateMutation.isPending}
                  form={form}
                  setForm={setForm}
                />
              ) : (
                <Card className="border border-slate-200 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between p-4">
                    <button
                      className="flex items-center gap-3 flex-1 text-left"
                      onClick={() => setExpandedId(expandedId === ev.id ? null : ev.id)}
                    >
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold shrink-0">
                        {evaluations.length - idx}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800 text-sm">Avaliação #{evaluations.length - idx}</p>
                        <p className="text-xs text-slate-500">{formatDateTime(ev.createdAt)}</p>
                      </div>
                      {ev.painScale !== null && ev.painScale !== undefined && (
                        <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold text-white shrink-0 ${
                          Number(ev.painScale) >= 7 ? "bg-red-500" : Number(ev.painScale) >= 4 ? "bg-orange-400" : "bg-green-500"
                        }`}>
                          EVA {ev.painScale}
                        </div>
                      )}
                    </button>
                    <div className="flex items-center gap-1 ml-2">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-primary"
                        onClick={() => startEdit(ev)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-red-500"
                        onClick={() => handleDelete(ev.id)} disabled={deleteMutation.isPending}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                      {expandedId === ev.id ? <ChevronUp className="w-4 h-4 text-slate-400 ml-1" /> : <ChevronDown className="w-4 h-4 text-slate-400 ml-1" />}
                    </div>
                  </div>
                  {expandedId === ev.id && (
                    <div className="px-4 pb-4 border-t border-slate-100 pt-4 space-y-4">
                      {/* EVA badge if present */}
                      {ev.painScale !== null && ev.painScale !== undefined && (
                        <div className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg text-white shrink-0 ${
                            Number(ev.painScale) >= 7 ? "bg-red-500" : Number(ev.painScale) >= 4 ? "bg-orange-400" : "bg-green-500"
                          }`}>{ev.painScale}</div>
                          <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Escala de Dor (EVA)</p>
                            <p className={`text-sm font-medium ${Number(ev.painScale) >= 7 ? "text-red-600" : Number(ev.painScale) >= 4 ? "text-orange-600" : "text-green-600"}`}>
                              {Number(ev.painScale) === 0 ? "Sem dor" : Number(ev.painScale) <= 3 ? "Dor leve" : Number(ev.painScale) <= 6 ? "Dor moderada" : Number(ev.painScale) <= 9 ? "Dor intensa" : "Dor insuportável"}
                            </p>
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {ev.inspection && <InfoBlock label="Inspeção" value={ev.inspection} />}
                        {ev.posture && <InfoBlock label="Postura" value={ev.posture} />}
                        {ev.rangeOfMotion && <InfoBlock label="Amplitude de Movimento" value={ev.rangeOfMotion} />}
                        {ev.muscleStrength && <InfoBlock label="Força Muscular" value={ev.muscleStrength} />}
                        {ev.palpation && <InfoBlock label="Palpação" value={ev.palpation} />}
                        {ev.gait && <InfoBlock label="Marcha e Equilíbrio" value={ev.gait} />}
                        {ev.orthopedicTests && <InfoBlock label="Testes Ortopédicos" value={ev.orthopedicTests} className="md:col-span-2" />}
                        {ev.functionalTests && <InfoBlock label="Testes Funcionais e Escalas" value={ev.functionalTests} className="md:col-span-2" />}
                        {ev.functionalDiagnosis && <InfoBlock label="Diagnóstico Funcional" value={ev.functionalDiagnosis} className="md:col-span-2" />}
                      </div>
                    </div>
                  )}
                </Card>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Treatment Plan Items Section ────────────────────────────────────────────────


