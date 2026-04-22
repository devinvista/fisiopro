import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { VoiceTextarea as Textarea } from "@/components/ui/voice-textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Target, CheckCircle } from "lucide-react";
import { EvoTemplate, EvoFormState } from "./types";
import { EVOLUTION_TEMPLATES } from "./constants";
import { formatDate } from "../../utils/format";
import { Badge } from "@/components/ui/badge";

interface FormProgressProps {
  form: EvoFormState;
}

function FormProgress({ form }: FormProgressProps) {
  const fields = [
    form.description,
    form.patientResponse,
    form.clinicalNotes,
    form.techniquesUsed,
  ];
  const filled = fields.filter(f => f && f.trim().length > 0).length;
  const pct = Math.round((filled / fields.length) * 100);

  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-bold text-slate-400">{pct}%</span>
    </div>
  );
}

interface TemplateSelectorProps {
  selected: EvoTemplate | null;
  onSelect: (t: EvoTemplate) => void;
  onClear: () => void;
}

function TemplateSelector({ selected, onSelect, onClear }: TemplateSelectorProps) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold text-slate-700">Modelos Rápidos</Label>
      <div className="flex flex-wrap gap-2">
        {EVOLUTION_TEMPLATES.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => selected?.id === t.id ? onClear() : onSelect(t)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 text-xs font-medium transition-all ${
              selected?.id === t.id
                ? t.color
                : "bg-white border-slate-100 text-slate-500 hover:border-slate-200"
            }`}
          >
            <span>{t.icon}</span>
            <span>{t.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

interface QuickChipProps {
  label: string;
  onAdd: () => void;
}

function QuickChip({ label, onAdd }: QuickChipProps) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="text-[10px] bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full hover:bg-slate-50 hover:border-slate-300 transition-colors"
    >
      + {label}
    </button>
  );
}

interface EvoFormProps {
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  title: string;
  form: EvoFormState;
  setForm: React.Dispatch<React.SetStateAction<EvoFormState>>;
  appointments: any[];
}

export function EvoForm({ onSave, onCancel, saving, title, form, setForm, appointments }: EvoFormProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<EvoTemplate | null>(null);

  const applyTemplate = (t: EvoTemplate) => {
    setSelectedTemplate(t);
    setForm(prev => ({
      ...prev,
      description: t.description,
      patientResponse: t.patientResponse,
      clinicalNotes: t.clinicalNotes,
      complications: t.complications,
    }));
  };

  const clearTemplate = () => {
    setSelectedTemplate(null);
    setForm(prev => ({ ...prev, description: "", patientResponse: "", clinicalNotes: "", complications: "" }));
  };

  const appendChip = (field: keyof EvoFormState, chip: string) => {
    setForm(prev => {
      const current = (prev[field] as string) || "";
      const sep = current && !current.endsWith(" ") && !current.endsWith("\n") ? ". " : "";
      return { ...prev, [field]: current + sep + chip };
    });
  };

  const chips = selectedTemplate?.chips;

  return (
    <Card className="border-2 border-indigo-100 shadow-md">
      <CardHeader className="pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <FormProgress form={form} />
        </div>
      </CardHeader>
      <CardContent className="p-5 space-y-4">

        {/* Template Selector */}
        <TemplateSelector selected={selectedTemplate} onSelect={applyTemplate} onClear={clearTemplate} />

        {/* Consulta + Duração */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Consulta Vinculada <span className="text-slate-400 font-normal">(opcional)</span></Label>
            <Select
              value={String(form.appointmentId || "")}
              onValueChange={v => setForm({ ...form, appointmentId: v === "none" ? "" : v })}
            >
              <SelectTrigger className="bg-slate-50 border-slate-200">
                <SelectValue placeholder="Selecionar consulta..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma consulta vinculada</SelectItem>
                {appointments.map((appt: any) => (
                  <SelectItem key={appt.id} value={String(appt.id)}>
                    {formatDate(appt.date)} — {appt.startTime} — {appt.procedure?.name || "Consulta"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Duração <span className="text-slate-400 font-normal">(min)</span></Label>
            <Input
              type="number" min="1" max="480"
              className="bg-slate-50 border-slate-200"
              value={form.sessionDuration === "" ? "" : String(form.sessionDuration)}
              onChange={e => setForm({ ...form, sessionDuration: e.target.value === "" ? "" : Number(e.target.value) })}
              placeholder="Ex: 60" />
          </div>
        </div>

        {/* Description */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold text-slate-700">Descrição da Sessão</Label>
            {form.description.length > 0 && (
              <span className="text-[10px] text-slate-400">{form.description.length} caracteres</span>
            )}
          </div>
          <Textarea className="min-h-[90px] bg-slate-50 border-slate-200 resize-none text-sm"
            value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
            placeholder="O que foi realizado na sessão de hoje..." />
          {chips && chips.description.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {chips.description.map(c => (
                <QuickChip key={c} label={c} onAdd={() => appendChip("description", c)} />
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Patient Response */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700">Resposta do Paciente</Label>
            <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 resize-none text-sm"
              value={form.patientResponse} onChange={e => setForm({ ...form, patientResponse: e.target.value })}
              placeholder="Como o paciente respondeu ao tratamento..." />
            {chips && chips.patientResponse.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {chips.patientResponse.map(c => (
                  <QuickChip key={c} label={c} onAdd={() => appendChip("patientResponse", c)} />
                ))}
              </div>
            )}
          </div>

          {/* Clinical Notes */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700">Notas Clínicas</Label>
            <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 resize-none text-sm"
              value={form.clinicalNotes} onChange={e => setForm({ ...form, clinicalNotes: e.target.value })}
              placeholder="Observações clínicas relevantes..." />
            {chips && chips.clinicalNotes.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {chips.clinicalNotes.map(c => (
                  <QuickChip key={c} label={c} onAdd={() => appendChip("clinicalNotes", c)} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Techniques Used */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-slate-700">Técnicas e Recursos Utilizados</Label>
          <Textarea className="min-h-[65px] bg-slate-50 border-slate-200 resize-none text-sm"
            value={form.techniquesUsed} onChange={e => setForm({ ...form, techniquesUsed: e.target.value })}
            placeholder="Ex: TENS (80Hz, 10min), Ultrassom terapêutico (1MHz, modo pulsado), Cinesioterapia ativa..." />
          {chips && chips.description.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {chips.description.map(c => (
                <QuickChip key={c} label={c} onAdd={() => appendChip("techniquesUsed", c)} />
              ))}
            </div>
          )}
        </div>

        {/* Complications */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-slate-700">Intercorrências</Label>
          <Textarea className="min-h-[60px] bg-slate-50 border-slate-200 resize-none text-sm"
            value={form.complications} onChange={e => setForm({ ...form, complications: e.target.value })}
            placeholder="Alguma intercorrência ou evento adverso... (deixe em branco se não houve)" />
          {chips && chips.complications.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {chips.complications.map(c => (
                <QuickChip key={c} label={c} onAdd={() => appendChip("complications", c)} />
              ))}
            </div>
          )}
        </div>

        {/* Home exercises + Next session goals */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />Exercícios Domiciliares Prescritos
            </Label>
            <Textarea className="min-h-[75px] bg-slate-50 border-slate-200 resize-none text-sm"
              value={form.homeExercises} onChange={e => setForm({ ...form, homeExercises: e.target.value })}
              placeholder="Exercícios para o paciente realizar em casa, frequência e repetições..." />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-indigo-500" />Objetivos Próxima Sessão
            </Label>
            <Textarea className="min-h-[75px] bg-slate-50 border-slate-200 resize-none text-sm"
              value={form.nextSessionGoals} onChange={e => setForm({ ...form, nextSessionGoals: e.target.value })}
              placeholder="O que será trabalhado na próxima sessão? Progressões planejadas..." />
          </div>
        </div>

        {/* EVA Pain Scale */}
        <div className="space-y-3 bg-slate-50 rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-semibold text-slate-700">Escala de Dor (EVA)</Label>
              <p className="text-xs text-slate-400 mt-0.5">Escala Visual Analógica — 0 (sem dor) a 10 (dor máxima)</p>
            </div>
            {form.painScale !== null ? (
              <div className={`flex items-center justify-center w-12 h-12 rounded-full font-bold text-xl text-white shadow-md ${
                form.painScale >= 7 ? "bg-red-500" : form.painScale >= 4 ? "bg-orange-400" : "bg-green-500"
              }`}>
                {form.painScale}
              </div>
            ) : (
              <span className="text-xs text-slate-400 italic">não avaliada</span>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            {[null, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => (
              <button
                key={v === null ? "none" : v}
                type="button"
                onClick={() => setForm({ ...form, painScale: v })}
                className={`w-9 h-9 rounded-lg text-sm font-semibold border-2 transition-all ${
                  form.painScale === v
                    ? v === null
                      ? "bg-slate-200 border-slate-400 text-slate-700"
                      : v >= 7
                        ? "bg-red-500 border-red-600 text-white"
                        : v >= 4
                          ? "bg-orange-400 border-orange-500 text-white"
                          : "bg-green-500 border-green-600 text-white"
                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"
                }`}
              >
                {v === null ? "—" : v}
              </button>
            ))}
          </div>

          {form.painScale !== null && (
            <p className="text-xs font-medium mt-1 flex items-center gap-1.5">
              <span className={`inline-block w-2 h-2 rounded-full ${
                form.painScale >= 7 ? "bg-red-500" : form.painScale >= 4 ? "bg-orange-400" : "bg-green-500"
              }`} />
              <span className={form.painScale >= 7 ? "text-red-600" : form.painScale >= 4 ? "text-orange-600" : "text-green-600"}>
                {form.painScale === 0 ? "Sem dor"
                  : form.painScale <= 3 ? "Dor leve"
                  : form.painScale <= 6 ? "Dor moderada"
                  : form.painScale <= 9 ? "Dor intensa"
                  : "Dor insuportável"}
              </span>
            </p>
          )}
        </div>

        <div className="flex gap-3 justify-end pt-2 border-t border-slate-100">
          <Button variant="outline" onClick={onCancel} className="rounded-xl">Cancelar</Button>
          <Button onClick={onSave} className="rounded-xl gap-2" disabled={saving || !form.description.trim()}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Salvar Evolução
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
