import React from "react";
import { ClipboardList, Activity, FileText, UserCheck, Target, Stethoscope } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { VoiceTextarea as Textarea } from "@/components/ui/voice-textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AnamSection } from "./AnamSection";
import { AnamnesisForm } from "./types";

interface TemplateReabilitacaoProps {
  form: AnamnesisForm;
  f: (field: keyof AnamnesisForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  sv: (field: keyof AnamnesisForm) => (val: string) => void;
  sections: Record<string, boolean>;
  toggle: (k: string) => void;
}

export function TemplateReabilitacao({ form, f, sv, sections, toggle }: TemplateReabilitacaoProps) {
  return (
    <>
      <AnamSection title="Queixa Principal e História" subtitle="QP, HDA, ocupação e lateralidade" icon={<ClipboardList className="w-4 h-4" />} colorClass="blue" open={sections.s1} onToggle={() => toggle("s1")}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Profissão / Ocupação</Label>
            <Input className="bg-slate-50 border-slate-200 focus:bg-white" value={form.occupation} onChange={f("occupation")} placeholder="Ex: Professor, Atleta, Operário..." />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Lateralidade</Label>
            <Select value={form.laterality} onValueChange={sv("laterality")}>
              <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="destro">Destro (direita)</SelectItem>
                <SelectItem value="canhoto">Canhoto (esquerda)</SelectItem>
                <SelectItem value="ambidestro">Ambidestro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Queixa Principal (QP) <span className="text-red-400">*</span></Label>
          <Textarea className="min-h-[90px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.mainComplaint} onChange={f("mainComplaint")} placeholder="Relato do paciente sobre o motivo da consulta, em suas próprias palavras..." />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">História da Doença Atual (HDA)</Label>
          <Textarea className="min-h-[90px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.diseaseHistory} onChange={f("diseaseHistory")} placeholder="Evolução dos sintomas, quando iniciou, como iniciou, o que fez até agora..." />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">CID-10 (Diagnóstico Médico)</Label>
          <Input className="bg-slate-50 border-slate-200 focus:bg-white" value={form.cid10} onChange={f("cid10")} placeholder="Ex: M54.5 – Lombalgia, M75.1 – Síndrome do Manguito Rotador..." />
        </div>
      </AnamSection>

      <AnamSection title="Dor e Sintomas" subtitle="Localização, fatores agravantes, aliviantes e impacto funcional" icon={<Activity className="w-4 h-4" />} colorClass="red" open={sections.s2} onToggle={() => toggle("s2")}>
        <div className="flex items-start gap-2.5 rounded-xl bg-blue-50 border border-blue-200 px-3.5 py-2.5">
          <Activity className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-700 leading-relaxed">
            <span className="font-semibold">Escala EVA (dor):</span> o registro da Escala Visual Analógica é feito na aba <span className="font-semibold">Avaliações</span> — tanto na avaliação inicial quanto ao longo do tratamento — para garantir o acompanhamento evolutivo sem duplicidade.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Localização e Irradiação da Dor</Label>
          <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.painLocation} onChange={f("painLocation")} placeholder="Ex: Dor lombar com irradiação para MID, formigamento em L5-S1..." />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Fatores que Agravam</Label>
            <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.painAggravatingFactors} onChange={f("painAggravatingFactors")} placeholder="Ex: Ficar sentado por muito tempo, caminhar, subir escadas..." />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Fatores que Aliviam</Label>
            <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.painRelievingFactors} onChange={f("painRelievingFactors")} placeholder="Ex: Repouso, compressa quente, analgésico, deitar..." />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Impacto Funcional (AVDs afetadas)</Label>
          <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.functionalImpact} onChange={f("functionalImpact")} placeholder="Ex: Dificuldade para se vestir, limitação para dirigir, não consegue trabalhar..." />
        </div>
      </AnamSection>

      <AnamSection title="Histórico Médico" subtitle="HMP, medicamentos, alergias, tratamentos anteriores" icon={<FileText className="w-4 h-4" />} colorClass="emerald" open={sections.s3} onToggle={() => toggle("s3")}>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Histórico Médico (HMP)</Label>
          <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.medicalHistory} onChange={f("medicalHistory")} placeholder="Cirurgias, internações, doenças crônicas, comorbidades..." />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Tratamentos Anteriores</Label>
          <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.previousTreatments} onChange={f("previousTreatments")} placeholder="Ex: Fisioterapia anterior, cirurgias, uso de órteses, infiltrações..." />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Medicamentos em Uso</Label>
            <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.medications} onChange={f("medications")} placeholder="Nome comercial, dosagem e frequência..." />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Alergias</Label>
            <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.allergies} onChange={f("allergies")} placeholder="Alergias a medicamentos, látex, materiais..." />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Histórico Familiar</Label>
            <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.familyHistory} onChange={f("familyHistory")} placeholder="Doenças hereditárias relevantes na família..." />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Tabagismo / Etilismo / Outros</Label>
            <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.tobaccoAlcohol} onChange={f("tobaccoAlcohol")} placeholder="Fuma? Bebe? Usa outras substâncias? Frequência..." />
          </div>
        </div>
      </AnamSection>

      <AnamSection title="Hábitos e Estilo de Vida" subtitle="Atividade física, sono, alimentação, rotina" icon={<UserCheck className="w-4 h-4" />} colorClass="violet" open={sections.s4} onToggle={() => toggle("s4")}>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Estilo de Vida</Label>
          <Textarea className="min-h-[90px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.lifestyle} onChange={f("lifestyle")} placeholder="Atividade física (tipo e frequência), qualidade do sono, alimentação, postura no trabalho, nível de estresse..." />
        </div>
      </AnamSection>

      <AnamSection title="Objetivos e Expectativas" subtitle="O que o paciente espera do tratamento" icon={<Target className="w-4 h-4" />} colorClass="amber" open={sections.s5} onToggle={() => toggle("s5")}>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Objetivos e Expectativas do Paciente</Label>
          <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.patientGoals} onChange={f("patientGoals")} placeholder="O que o paciente espera alcançar com o tratamento? Metas de curto e longo prazo..." />
        </div>
      </AnamSection>
    </>
  );
}
