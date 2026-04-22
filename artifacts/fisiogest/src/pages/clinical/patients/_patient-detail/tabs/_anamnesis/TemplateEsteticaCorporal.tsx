import React from "react";
import { ClipboardList, HeartPulse, Scale, Target } from "lucide-react";
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
}

export function TemplateEsteticaCorporal({ form, setForm, f, sv, sections, toggle }: TemplateEsteticaCorporalProps) {
  return (
    <>
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
          <Label className="text-sm font-semibold text-slate-700">Queixa Principal <span className="text-red-400">*</span></Label>
          <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.mainComplaint} onChange={f("mainComplaint")} placeholder="Gordura localizada, celulite, flacidez, estrias, edema (inchaço)..." />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Histórico do Problema</Label>
          <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.diseaseHistory} onChange={f("diseaseHistory")} placeholder="Quando começou? Mudanças recentes de peso? Piora em algum período? Tratamentos já feitos..." />
        </div>
      </AnamSection>

      <AnamSection title="Saúde e Estilo de Vida" subtitle="Hábitos, alimentação e histórico médico" icon={<HeartPulse className="w-4 h-4" />} colorClass="emerald" open={sections.s2} onToggle={() => toggle("s2")}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Qualidade do Sono</Label>
            <Select value={form.sleepQuality} onValueChange={sv("sleepQuality")}>
              <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bom">Bom</SelectItem>
                <SelectItem value="regular">Regular</SelectItem>
                <SelectItem value="ruim">Ruim / Insônia</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Alimentação</Label>
            <Select value={form.dietQuality} onValueChange={sv("dietQuality")}>
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
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Atividade Física</Label>
            <Select value={form.physicalActivity} onValueChange={sv("physicalActivity")}>
              <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sedentario">Sedentário</SelectItem>
                <SelectItem value="1-2-vezes">1-2 vezes por semana</SelectItem>
                <SelectItem value="3-5-vezes">3-5 vezes por semana</SelectItem>
                <SelectItem value="atleta">Diário / Intenso</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Funcionamento Intestinal</Label>
            <Select value={form.bowelFunction} onValueChange={sv("bowelFunction")}>
              <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="regular">Regular (diário)</SelectItem>
                <SelectItem value="obstipado">Obstipado (preso)</SelectItem>
                <SelectItem value="irregular">Irregular</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Uso de Anticoncepcional</Label>
            <Select value={form.contraceptiveUse} onValueChange={sv("contraceptiveUse")}>
              <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nao-usa">Não utiliza</SelectItem>
                <SelectItem value="oral">Oral</SelectItem>
                <SelectItem value="injetavel">Injetável / Implante</SelectItem>
                <SelectItem value="diu">DIU (Mirena/Cobre)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-slate-700">Histórico de Saúde Corporativa (marque se aplicar)</Label>
          <div className="flex flex-wrap gap-2">
            {["Diabetes", "Hipertensão", "Varizes", "Trombose", "Problemas renais", "Hipotireoidismo", "Prótese metálica", "Marcapasso", "Cirurgia bariátrica", "Lipoaspiração anterior", "Gestação atual", "Amamentação", "Alergia a cosméticos", "Dermatites"].map(h => (
              <CheckTag key={h} label={h} active={hasInList(form.medicalHistory, h)} onClick={() => setForm(p => ({ ...p, medicalHistory: toggleInList(p.medicalHistory, h) }))} />
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Medicamentos em Uso</Label>
          <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.medications} onChange={f("medications")} placeholder="Diuréticos, hormônios, corticoides, suplementos..." />
        </div>
      </AnamSection>

      <AnamSection title="Avaliação Antropométrica" subtitle="Peso, altura e medidas" icon={<Scale className="w-4 h-4" />} colorClass="blue" open={sections.s3} onToggle={() => toggle("s3")}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Peso Atual (kg)</Label>
            <Input className="bg-slate-50 border-slate-200 focus:bg-white" value={form.currentWeight} onChange={f("currentWeight")} placeholder="Ex: 70.5" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Altura (m)</Label>
            <Input className="bg-slate-50 border-slate-200 focus:bg-white" value={form.height} onChange={f("height")} placeholder="Ex: 1.65" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Peso Desejado (kg)</Label>
            <Input className="bg-slate-50 border-slate-200 focus:bg-white" value={form.targetWeight} onChange={f("targetWeight")} placeholder="Ex: 65.0" />
          </div>
        </div>
      </AnamSection>

      <AnamSection title="Objetivos Corporais" subtitle="O que espera alcançar com o tratamento corporal" icon={<Target className="w-4 h-4" />} colorClass="orange" open={sections.s4} onToggle={() => toggle("s4")}>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Expectativas do Paciente</Label>
          <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.patientGoals} onChange={f("patientGoals")} placeholder="Redução de medidas, melhora do contorno corporal, redução de celulite, firmeza da pele, redução de gordura localizada no abdômen..." />
        </div>
      </AnamSection>
    </>
  );
}
