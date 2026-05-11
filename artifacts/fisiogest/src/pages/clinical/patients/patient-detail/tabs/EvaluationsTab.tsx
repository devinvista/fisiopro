import { apiFetch } from "@/lib/api";
import {
  useListEvaluations,
  useCreateEvaluation,
  useUpdateEvaluation,
  useDeleteEvaluation,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { confirm as confirmDialog } from "@/lib/confirm";
import {
  Loader2, Activity, Plus, ChevronDown, ChevronUp,
  Pencil, Trash2, Target, ClipboardCheck, CheckCircle,
  Stethoscope, Move, Dumbbell, HandMetal, Footprints,
  FlaskConical, Brain, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrimaryActionButton } from "@/components/ui/primary-action-button";
import { VoiceTextarea as Textarea } from "@/components/ui/voice-textarea";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useToast } from "@/lib/toast";
import { formatDateTime } from "../utils/format";
import { IndicatorsPanel } from "./anamnesis/IndicatorsPanel";

// ─── Types ───────────────────────────────────────────────────────────────────

type EvalFormState = typeof emptyEvalForm;

const emptyEvalForm = {
  inspection: "", posture: "", rangeOfMotion: "", muscleStrength: "",
  orthopedicTests: "", functionalDiagnosis: "",
  painScale: null as number | null, palpation: "", gait: "", functionalTests: "",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pluralAval(n: number) {
  return n === 1 ? "1 avaliação registrada" : `${n} avaliações registradas`;
}

function painLabel(v: number) {
  if (v === 0) return "Sem dor";
  if (v <= 3) return "Leve";
  if (v <= 6) return "Moderada";
  if (v <= 9) return "Intensa";
  return "Insuportável";
}

function painScheme(v: number) {
  if (v >= 7) return { bar: "bg-red-500", text: "text-red-600", badge: "bg-red-50 border-red-100 text-red-700", dot: "bg-red-500", pill: "bg-red-500" };
  if (v >= 4) return { bar: "bg-orange-400", text: "text-orange-600", badge: "bg-orange-50 border-orange-100 text-orange-700", dot: "bg-orange-400", pill: "bg-orange-400" };
  return { bar: "bg-emerald-500", text: "text-emerald-600", badge: "bg-emerald-50 border-emerald-100 text-emerald-700", dot: "bg-emerald-500", pill: "bg-emerald-500" };
}

function SectionLabel({ icon: Icon, label, className = "" }: { icon: any; label: string; className?: string }) {
  return (
    <div className={`flex items-center gap-1.5 mb-1.5 ${className}`}>
      <Icon className="w-3.5 h-3.5 opacity-50 shrink-0" />
      <span className="text-[11px] font-semibold uppercase tracking-widest opacity-60">{label}</span>
    </div>
  );
}

// ─── Progress bar for EvalForm ────────────────────────────────────────────────

function FormProgress({ form }: { form: EvalFormState }) {
  const fields = [form.inspection, form.posture, form.rangeOfMotion, form.muscleStrength, form.palpation, form.functionalDiagnosis];
  const filled = fields.filter(f => f && f.trim().length > 0).length;
  const pct = Math.round((filled / fields.length) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-bold text-slate-400">{pct}%</span>
    </div>
  );
}

// ─── EvalForm ─────────────────────────────────────────────────────────────────

interface EvalFormProps {
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  title: string;
  form: EvalFormState;
  setForm: React.Dispatch<React.SetStateAction<EvalFormState>>;
}

function EvalForm({ onSave, onCancel, saving, title, form, setForm }: EvalFormProps) {
  return (
    <Card className="border-2 border-primary/20 shadow-md">
      <CardHeader className="pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <FormProgress form={form} />
        </div>
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
            {[null, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => (
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
          {form.painScale !== null && (
            <p className="text-xs font-medium flex items-center gap-1.5">
              <span className={`inline-block w-2 h-2 rounded-full ${form.painScale >= 7 ? "bg-red-500" : form.painScale >= 4 ? "bg-orange-400" : "bg-green-500"}`} />
              <span className={form.painScale >= 7 ? "text-red-600" : form.painScale >= 4 ? "text-orange-600" : "text-green-600"}>
                {form.painScale === 0 ? "Sem dor" : form.painScale <= 3 ? "Dor leve" : form.painScale <= 6 ? "Dor moderada" : form.painScale <= 9 ? "Dor intensa" : "Dor insuportável"}
              </span>
            </p>
          )}
        </div>

        {/* Inspeção e Postura */}
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5" /> Inspeção Visual e Postura
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700">Inspeção</Label>
              <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 resize-none text-sm"
                value={form.inspection} onChange={e => setForm({ ...form, inspection: e.target.value })}
                placeholder="Postura geral, assimetrias, cicatrizes, edemas observados..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700">Postura</Label>
              <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 resize-none text-sm"
                value={form.posture} onChange={e => setForm({ ...form, posture: e.target.value })}
                placeholder="Análise anterior, posterior e lateral, plomada, desvios..." />
            </div>
          </div>
        </div>

        {/* ADM e Força */}
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Move className="w-3.5 h-3.5" /> Amplitude de Movimento e Força
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700">Amplitude de Movimento (ADM)</Label>
              <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 resize-none text-sm"
                value={form.rangeOfMotion} onChange={e => setForm({ ...form, rangeOfMotion: e.target.value })}
                placeholder="Graus de movimento em cada plano, comparação bilateral..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700">Força Muscular</Label>
              <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 resize-none text-sm"
                value={form.muscleStrength} onChange={e => setForm({ ...form, muscleStrength: e.target.value })}
                placeholder="Graus de força (0-5) por grupo muscular, simetria..." />
            </div>
          </div>
        </div>

        {/* Palpação e Marcha */}
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <HandMetal className="w-3.5 h-3.5" /> Palpação e Marcha
          </p>
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
        </div>

        {/* Testes */}
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <FlaskConical className="w-3.5 h-3.5" /> Testes e Escalas
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700">Testes Ortopédicos / Especiais</Label>
              <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 resize-none text-sm"
                value={form.orthopedicTests} onChange={e => setForm({ ...form, orthopedicTests: e.target.value })}
                placeholder="Ex: Lasègue (+), Phalen (+), Neer (−), Thomas... — informe o teste e resultado..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700">Testes Funcionais e Escalas Validadas</Label>
              <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 resize-none text-sm"
                value={form.functionalTests} onChange={e => setForm({ ...form, functionalTests: e.target.value })}
                placeholder="Ex: DASH: 42/100 | Berg: 48/56 | Barthel: 85/100 | SF-36 | WOMAC | NDI..." />
            </div>
          </div>
        </div>

        {/* Diagnóstico Funcional */}
        <div className="bg-primary/5 rounded-xl border border-primary/15 p-4 space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-primary" />Diagnóstico Funcional
          </Label>
          <Textarea className="min-h-[80px] bg-white border-slate-200 resize-none text-sm"
            value={form.functionalDiagnosis} onChange={e => setForm({ ...form, functionalDiagnosis: e.target.value })}
            placeholder="Conclusão da avaliação: diagnóstico fisioterapêutico, prognóstico e objetivos do tratamento..." />
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-3 sm:justify-end pt-2 border-t border-slate-100">
          <Button variant="outline" onClick={onCancel} className="w-full sm:w-auto h-10 rounded-xl">Cancelar</Button>
          <PrimaryActionButton
            label="Salvar Avaliação"
            icon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            onClick={onSave}
            disabled={saving}
            className="w-full sm:w-auto justify-center"
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── EvalCard (display) ───────────────────────────────────────────────────────

interface EvalCardProps {
  ev: any;
  num: number;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}

function EvalCard({ ev, num, expanded, onToggle, onEdit, onDelete, isDeleting }: EvalCardProps) {
  const hasPain = ev.painScale !== null && ev.painScale !== undefined;
  const scheme = hasPain ? painScheme(Number(ev.painScale)) : null;

  const sections = [
    { icon: Eye, label: "Inspeção", value: ev.inspection },
    { icon: Stethoscope, label: "Postura", value: ev.posture },
    { icon: Move, label: "Amplitude de Movimento", value: ev.rangeOfMotion },
    { icon: Dumbbell, label: "Força Muscular", value: ev.muscleStrength },
    { icon: HandMetal, label: "Palpação", value: ev.palpation },
    { icon: Footprints, label: "Marcha e Equilíbrio", value: ev.gait },
  ].filter(s => s.value);

  const fullWidthSections = [
    { icon: FlaskConical, label: "Testes Ortopédicos / Especiais", value: ev.orthopedicTests },
    { icon: Brain, label: "Testes Funcionais e Escalas", value: ev.functionalTests },
  ].filter(s => s.value);

  return (
    <Card className="border border-slate-200 shadow-sm overflow-hidden">
      {/* Accent stripe */}
      <div className={`h-0.5 w-full ${hasPain ? (Number(ev.painScale) >= 7 ? "bg-red-400" : Number(ev.painScale) >= 4 ? "bg-orange-400" : "bg-emerald-400") : "bg-primary/40"}`} />

      {/* Header row */}
      <div className="flex items-center justify-between gap-2 p-3 sm:p-4">
        <button
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
          onClick={onToggle}
        >
          <div className="w-9 h-9 rounded-full bg-primary/10 ring-4 ring-primary/5 flex items-center justify-center text-primary text-sm font-bold shrink-0">
            {num}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-800 text-sm">Avaliação #{num}</p>
            <p className="text-xs text-slate-400">{formatDateTime(ev.createdAt)}</p>
          </div>
          {hasPain && scheme && (
            <div className={`hidden sm:flex items-center gap-2 rounded-xl px-3 py-1.5 border ${scheme.badge}`}>
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">EVA</span>
              <span className="text-sm font-bold tabular-nums">{ev.painScale}/10</span>
              <span className="text-[10px] font-semibold opacity-80">{painLabel(Number(ev.painScale))}</span>
            </div>
          )}
        </button>

        <div className="flex items-center gap-0.5 shrink-0">
          {hasPain && scheme && (
            <div className={`sm:hidden flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold text-white shrink-0 ${scheme.pill}`}>
              {ev.painScale}
            </div>
          )}
          <button
            onClick={onEdit}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-primary hover:bg-primary/8 transition-all"
            title="Editar"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            disabled={isDeleting}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-40"
            title="Excluir"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onToggle} className="h-8 w-8 flex items-center justify-center text-slate-400">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-4 space-y-4">

          {/* EVA bar */}
          {hasPain && scheme && (
            <div className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${scheme.badge}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg text-white shrink-0 ${scheme.bar}`}>
                {ev.painScale}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[11px] font-semibold uppercase tracking-widest opacity-60">Escala de Dor (EVA)</p>
                  <p className={`text-xs font-bold ${scheme.text}`}>{painLabel(Number(ev.painScale))}</p>
                </div>
                <div className="h-1.5 rounded-full bg-black/10 overflow-hidden">
                  <div className={`h-full rounded-full ${scheme.bar}`} style={{ width: `${(Number(ev.painScale) / 10) * 100}%` }} />
                </div>
              </div>
            </div>
          )}

          {/* Grid sections */}
          {sections.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
              {sections.map(s => (
                <div key={s.label}>
                  <SectionLabel icon={s.icon} label={s.label} className="text-slate-400" />
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{s.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Full-width sections */}
          {fullWidthSections.map(s => (
            <div key={s.label}>
              <SectionLabel icon={s.icon} label={s.label} className="text-slate-400" />
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{s.value}</p>
            </div>
          ))}

          {/* Diagnóstico funcional destaque */}
          {ev.functionalDiagnosis && (
            <div className="bg-primary/5 border border-primary/15 rounded-xl p-3">
              <SectionLabel icon={Target} label="Diagnóstico Funcional" className="text-primary/70" />
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap font-medium">{ev.functionalDiagnosis}</p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── EvaluationsTab ───────────────────────────────────────────────────────────

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

  const handleDelete = async (id: number) => {
    const ok = await confirmDialog({
      title: "Excluir esta avaliação?",
      description: "Esta ação é permanente e não pode ser desfeita.",
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
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

  if (isLoading) return (
    <div className="p-10 text-center">
      <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
    </div>
  );

  return (
    <div className="space-y-4">

      {/* Indicadores de Resultado */}
      <IndicatorsPanel patientId={patientId} />

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-base sm:text-lg font-semibold text-slate-800">Avaliações Físicas</h3>
          <p className="text-xs sm:text-sm text-slate-500">{pluralAval(evaluations.length)}</p>
        </div>
        <PrimaryActionButton
          label="Nova Avaliação"
          mobileLabel="Nova"
          onClick={() => { setShowForm(!showForm); setEditingId(null); setForm(emptyEvalForm); }}
          className="w-full sm:w-auto justify-center"
        />
      </div>

      {/* New evaluation form */}
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

      {/* Empty state */}
      {evaluations.length === 0 && !showForm ? (
        <Card className="border-dashed border-2 border-slate-200">
          <CardContent className="py-14 flex flex-col items-center text-center text-slate-400 gap-3">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
              <ClipboardCheck className="w-7 h-7 opacity-40" />
            </div>
            <div>
              <p className="font-semibold text-slate-500">Nenhuma avaliação registrada</p>
              <p className="text-sm mt-0.5">Registre a avaliação inicial para documentar o estado físico do paciente.</p>
            </div>
            <Button
              size="sm"
              className="mt-1 rounded-xl gap-1.5"
              onClick={() => setShowForm(true)}
            >
              <Plus className="w-3.5 h-3.5" />
              Registrar primeira avaliação
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {evaluations.map((ev, idx) => {
            const num = evaluations.length - idx;
            return (
              <div key={ev.id}>
                {editingId === ev.id ? (
                  <EvalForm
                    title={`Editar Avaliação #${num}`}
                    onSave={() => handleUpdate(ev.id)}
                    onCancel={() => { setEditingId(null); setForm(emptyEvalForm); }}
                    saving={updateMutation.isPending}
                    form={form}
                    setForm={setForm}
                  />
                ) : (
                  <EvalCard
                    ev={ev}
                    num={num}
                    expanded={expandedId === ev.id}
                    onToggle={() => setExpandedId(expandedId === ev.id ? null : ev.id)}
                    onEdit={() => startEdit(ev)}
                    onDelete={() => handleDelete(ev.id)}
                    isDeleting={deleteMutation.isPending}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
