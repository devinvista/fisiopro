import React from "react";
import { ClipboardList, Activity, HeartPulse, Target, Dumbbell } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { VoiceTextarea as Textarea } from "@/components/ui/voice-textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AnamSection } from "./AnamSection";
import { AnamnesisForm } from "./types";

interface TemplatePilatesProps {
  form: AnamnesisForm;
  f: (field: keyof AnamnesisForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  sv: (field: keyof AnamnesisForm) => (val: string) => void;
  sections: Record<string, boolean>;
  toggle: (k: string) => void;
  readOnly?: boolean;
}

export function TemplatePilates({ form, f, sv, sections, toggle, readOnly = false }: TemplatePilatesProps) {
  return (
    <fieldset disabled={readOnly} className="contents min-w-0">
      <AnamSection title="Perfil e Experiência" subtitle="Ocupação, prática anterior e gestação" icon={<ClipboardList className="w-4 h-4" />} colorClass="teal" open={sections.s1} onToggle={() => toggle("s1")}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Profissão / Ocupação</Label>
            <Input className="bg-slate-50 border-slate-200 focus:bg-white" value={form.occupation} onChange={f("occupation")} placeholder="Ex: Escritório, Professor, Atleta..." />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Experiência Prévia com Pilates</Label>
            <Select value={form.pilatesExperience} onValueChange={sv("pilatesExperience")}>
              <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="iniciante">Iniciante (nunca praticou)</SelectItem>
                <SelectItem value="ate-6m">Até 6 meses</SelectItem>
                <SelectItem value="6m-2a">6 meses a 2 anos</SelectItem>
                <SelectItem value="mais-2a">Mais de 2 anos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Gestação / Pós-Parto</Label>
            <Select value={form.pregnancyStatus} onValueChange={sv("pregnancyStatus")}>
              <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nao-aplica">Não se aplica</SelectItem>
                <SelectItem value="gestante-1tri">Gestante – 1º trimestre</SelectItem>
                <SelectItem value="gestante-2tri">Gestante – 2º trimestre</SelectItem>
                <SelectItem value="gestante-3tri">Gestante – 3º trimestre</SelectItem>
                <SelectItem value="pos-parto">Pós-parto recente (≤ 6 meses)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Lateralidade Dominante</Label>
            <Select value={form.laterality} onValueChange={sv("laterality")}>
              <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="destro">Destro</SelectItem>
                <SelectItem value="canhoto">Canhoto</SelectItem>
                <SelectItem value="ambidestro">Ambidestro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Queixa Principal <span className="text-red-400">*</span></Label>
          <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.mainComplaint} onChange={f("mainComplaint")} placeholder="O que motivou procurar o pilates? Ex: dor lombar, postura, condicionamento, reabilitação..." />
        </div>
      </AnamSection>

      <AnamSection title="Avaliação Postural e Mobilidade" subtitle="Alterações posturais, restrições de movimento e lesões" icon={<Activity className="w-4 h-4" />} colorClass="indigo" open={sections.s2} onToggle={() => toggle("s2")}>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Alterações Posturais Observadas</Label>
          <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.posturalAlterations} onChange={f("posturalAlterations")} placeholder="Ex: hipercifose torácica, hiperlordose lombar, escoliose, anteversão pélvica, ombros protraídos, joelho valgo..." />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Restrições de Mobilidade</Label>
          <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.mobilityRestrictions} onChange={f("mobilityRestrictions")} placeholder="Ex: limitação para flexão de quadril, restrição em ombro D, dificuldade em rotação de tronco..." />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Lesões Anteriores e Cirurgias</Label>
          <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.previousInjuries} onChange={f("previousInjuries")} placeholder="Hérnia de disco, lesões de joelho, ombro congelado, cirurgia de coluna, prótese de quadril..." />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Localização da Dor (se houver)</Label>
          <Textarea className="min-h-[60px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.painLocation} onChange={f("painLocation")} placeholder="Ex: Lombar baixa, cervical, ombro direito..." />
        </div>
      </AnamSection>

      <AnamSection title="Saúde e Condicionamento" subtitle="Condições respiratórias, histórico médico e medicamentos" icon={<HeartPulse className="w-4 h-4" />} colorClass="emerald" open={sections.s3} onToggle={() => toggle("s3")}>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Condições Respiratórias / Cardiovasculares</Label>
          <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.respiratoryConditions} onChange={f("respiratoryConditions")} placeholder="Asma, rinite, bronquite, hipertensão, arritmia, marcapasso..." />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Histórico Médico Geral</Label>
          <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.medicalHistory} onChange={f("medicalHistory")} placeholder="Doenças crônicas, osteoporose, diabetes, problemas reumatológicos..." />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Medicamentos em Uso</Label>
            <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.medications} onChange={f("medications")} placeholder="Anti-inflamatórios, relaxantes musculares, anti-hipertensivos..." />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Alergias</Label>
            <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.allergies} onChange={f("allergies")} placeholder="Medicamentos, látex, fitas adesivas..." />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Hábitos de Vida</Label>
          <Textarea className="min-h-[60px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.lifestyle} onChange={f("lifestyle")} placeholder="Sono, alimentação, nível de estresse, outras atividades físicas..." />
        </div>
      </AnamSection>

      <AnamSection title="Objetivos no Pilates" subtitle="Metas pessoais com a prática" icon={<Target className="w-4 h-4" />} colorClass="amber" open={sections.s4} onToggle={() => toggle("s4")}>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Objetivos com a Prática <span className="text-red-400">*</span></Label>
          <Textarea className="min-h-[90px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.pilatesGoals} onChange={f("pilatesGoals")} placeholder="Ex: Melhorar postura, fortalecer core, aliviar dor lombar crônica, ganhar flexibilidade, reabilitação pós-cirúrgica, condicionamento geral..." />
          <p className="text-[11px] text-slate-400 inline-flex items-center gap-1"><Dumbbell className="w-3 h-3" /> Use estes objetivos para definir o plano de aulas.</p>
        </div>
      </AnamSection>
    </fieldset>
  );
}
