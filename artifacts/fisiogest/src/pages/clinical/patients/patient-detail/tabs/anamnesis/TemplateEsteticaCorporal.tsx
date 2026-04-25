import React from "react";
import { ClipboardList, HeartPulse, Scale, Target, Sparkles } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { VoiceTextarea as Textarea } from "@/components/ui/voice-textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AnamSection } from "./AnamSection";
import { CheckTag } from "./CheckTag";
import { AnamnesisForm } from "./types";
import { hasInList, toggleInList } from "./utils";

interface TemplateEsteticaCorporalProps {
  form: AnamnesisForm;
  setForm: React.Dispatch<React.SetStateAction<AnamnesisForm>>;
  f: (field: keyof AnamnesisForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  sv: (field: keyof AnamnesisForm) => (val: string) => void;
  sections: Record<string, boolean>;
  toggle: (k: string) => void;
  readOnly?: boolean;
}

export function TemplateEsteticaCorporal({ form, setForm, f, sv, sections, toggle, readOnly = false }: TemplateEsteticaCorporalProps) {
  return (
    <fieldset disabled={readOnly} className="contents">
      <AnamSection title="Queixa e Histórico" subtitle="Motivo da consulta e ocupação" icon={<ClipboardList className="w-4 h-4" />} colorClass="violet" open={sections.s1} onToggle={() => toggle("s1")}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Profissão / Ocupação</Label>
            <Input className="bg-slate-50 border-slate-200 focus:bg-white" value={form.occupation} onChange={f("occupation")} placeholder="Ex: Escritório, Professora, Vendas..." />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">CID-10 (se aplicável)</Label>
            <Input className="bg-slate-50 border-slate-200 focus:bg-white" value={form.cid10} onChange={f("cid10")} placeholder="Ex: E66 – Obesidade, L90 – Atrofia cutânea..." />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Queixa Principal Corporal <span className="text-red-400">*</span></Label>
          <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.mainBodyConcern} onChange={f("mainBodyConcern")} placeholder="Gordura localizada, celulite, flacidez, estrias, edema (inchaço)..." />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Regiões de Interesse</Label>
          <Textarea className="min-h-[60px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.bodyConcernRegions} onChange={f("bodyConcernRegions")} placeholder="Ex: Abdômen, flancos, culote, glúteos, coxas, braços..." />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Histórico do Problema</Label>
          <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.diseaseHistory} onChange={f("diseaseHistory")} placeholder="Quando começou? Mudanças recentes de peso? Piora em algum período?" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Tratamentos Corporais Anteriores</Label>
          <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.previousBodyTreatments} onChange={f("previousBodyTreatments")} placeholder="Drenagem linfática, criolipólise, radiofrequência, ultrassom, lipoaspiração..." />
        </div>
      </AnamSection>

      <AnamSection title="Saúde e Estilo de Vida" subtitle="Hábitos, alimentação e histórico médico" icon={<HeartPulse className="w-4 h-4" />} colorClass="emerald" open={sections.s2} onToggle={() => toggle("s2")}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Alimentação</Label>
            <Select value={form.dietHabits} onValueChange={sv("dietHabits")}>
              <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="equilibrada">Equilibrada</SelectItem>
                <SelectItem value="rica-carboidratos">Rica em Carboidratos/Doces</SelectItem>
                <SelectItem value="rica-gorduras">Rica em Gorduras/Frituras</SelectItem>
                <SelectItem value="irregular">Irregular/Fast Food</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Ingestão de Água (dia)</Label>
            <Select value={form.waterIntake} onValueChange={sv("waterIntake")}>
              <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="menos-1l">Menos de 1 litro</SelectItem>
                <SelectItem value="1-2l">1 a 2 litros</SelectItem>
                <SelectItem value="mais-2l">Mais de 2 litros</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Atividade Física</Label>
            <Select value={form.physicalActivityLevel} onValueChange={sv("physicalActivityLevel")}>
              <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sedentario">Sedentário</SelectItem>
                <SelectItem value="leve">1-2 vezes por semana</SelectItem>
                <SelectItem value="moderado">3-5 vezes por semana</SelectItem>
                <SelectItem value="intenso">Diário / Intenso</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Modalidade de Atividade Física</Label>
          <Input className="bg-slate-50 border-slate-200 focus:bg-white" value={form.physicalActivityType} onChange={f("physicalActivityType")} placeholder="Ex: Musculação, corrida, yoga, pilates, dança..." />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-slate-700">Histórico de Saúde Corporal (marque se aplicar)</Label>
          <div className="flex flex-wrap gap-2">
            {["Diabetes", "Hipertensão", "Varizes", "Trombose", "Problemas renais", "Hipotireoidismo", "Prótese metálica", "Marcapasso", "Cirurgia bariátrica", "Lipoaspiração anterior", "Gestação atual", "Amamentação", "Alergia a cosméticos", "Dermatites"].map(h => (
              <CheckTag key={h} label={h} active={hasInList(form.bodyMedicalConditions, h)} onClick={() => setForm(p => ({ ...p, bodyMedicalConditions: toggleInList(p.bodyMedicalConditions, h) }))} />
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Contraindicações Conhecidas</Label>
          <Textarea className="min-h-[60px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.bodyContraindications} onChange={f("bodyContraindications")} placeholder="Ex: Não pode passar corrente elétrica, alergia a princípios ativos..." />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Medicamentos em Uso</Label>
          <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.medications} onChange={f("medications")} placeholder="Diuréticos, hormônios, corticoides, suplementos..." />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Hábitos (tabagismo, etilismo, sono)</Label>
          <Textarea className="min-h-[60px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.tobaccoAlcohol} onChange={f("tobaccoAlcohol")} placeholder="Fuma? Bebe? Qualidade do sono..." />
        </div>
      </AnamSection>

      <AnamSection title="Avaliação Antropométrica" subtitle="Peso, altura e medidas" icon={<Scale className="w-4 h-4" />} colorClass="blue" open={sections.s3} onToggle={() => toggle("s3")}>
        <div className="flex items-start gap-2.5 rounded-xl bg-blue-50 border border-blue-200 px-3.5 py-2.5">
          <Scale className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-700 leading-relaxed">
            <span className="font-semibold">Acompanhamento evolutivo:</span> as medidas detalhadas (perimetria, % de gordura, etc) e a evolução temporal são registradas em <span className="font-semibold">Avaliações &gt; Medidas Corporais</span>.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Peso Atual (kg)</Label>
            <Input className="bg-slate-50 border-slate-200 focus:bg-white" value={form.bodyWeight} onChange={f("bodyWeight")} placeholder="Ex: 70.5" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Altura (m)</Label>
            <Input className="bg-slate-50 border-slate-200 focus:bg-white" value={form.bodyHeight} onChange={f("bodyHeight")} placeholder="Ex: 1.65" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Grau de Celulite</Label>
            <Select value={form.celluliteGrade} onValueChange={sv("celluliteGrade")}>
              <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ausente">Ausente</SelectItem>
                <SelectItem value="I">Grau I – discreto</SelectItem>
                <SelectItem value="II">Grau II – moderado</SelectItem>
                <SelectItem value="III">Grau III – acentuado</SelectItem>
                <SelectItem value="IV">Grau IV – severo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Medidas Iniciais (anotações livres)</Label>
          <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.bodyMeasurements} onChange={f("bodyMeasurements")} placeholder="Ex: cintura 78cm, abdômen 92cm, quadril 102cm, coxa D 58cm, coxa E 57cm..." />
        </div>
      </AnamSection>

      <AnamSection title="Objetivos Corporais" subtitle="O que espera alcançar com o tratamento corporal" icon={<Target className="w-4 h-4" />} colorClass="orange" open={sections.s4} onToggle={() => toggle("s4")}>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Expectativas do Paciente</Label>
          <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.patientGoals} onChange={f("patientGoals")} placeholder="Redução de medidas, melhora do contorno corporal, redução de celulite, firmeza da pele..." />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Detalhes Adicionais do Objetivo</Label>
          <Textarea className="min-h-[60px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.aestheticGoalDetails} onChange={f("aestheticGoalDetails")} placeholder="Prazo desejado, evento específico (casamento, viagem), prioridade entre regiões..." />
          <p className="text-[11px] text-slate-400 inline-flex items-center gap-1"><Sparkles className="w-3 h-3" /> Útil para alinhar expectativas e planejar o protocolo.</p>
        </div>
      </AnamSection>
    </fieldset>
  );
}
