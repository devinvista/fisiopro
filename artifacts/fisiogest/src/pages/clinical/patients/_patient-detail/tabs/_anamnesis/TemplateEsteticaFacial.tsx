import React from "react";
import { ClipboardList, Sun, FlaskConical, HeartPulse, Target } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { VoiceTextarea as Textarea } from "@/components/ui/voice-textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AnamSection } from "./AnamSection";
import { CheckTag } from "./CheckTag";
import { AnamnesisForm } from "./types";
import { hasInList, toggleInList } from "./utils";

interface TemplateEsteticaFacialProps {
  form: AnamnesisForm;
  setForm: React.Dispatch<React.SetStateAction<AnamnesisForm>>;
  f: (field: keyof AnamnesisForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  sv: (field: keyof AnamnesisForm) => (val: string) => void;
  sections: Record<string, boolean>;
  toggle: (k: string) => void;
}

export function TemplateEsteticaFacial({ form, setForm, f, sv, sections, toggle }: TemplateEsteticaFacialProps) {
  return (
    <>
      <AnamSection title="Queixa Principal e Histórico" subtitle="Motivo da consulta e histórico do problem" icon={<ClipboardList className="w-4 h-4" />} colorClass="rose" open={sections.s1} onToggle={() => toggle("s1")}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Profissão / Ocupação</Label>
            <Input className="bg-slate-50 border-slate-200 focus:bg-white" value={form.occupation} onChange={f("occupation")} placeholder="Ex: Professora, Executiva, Esteticista..." />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">CID-10 (se aplicável)</Label>
            <Input className="bg-slate-50 border-slate-200 focus:bg-white" value={form.cid10} onChange={f("cid10")} placeholder="Ex: L70 – Acne, L81 – Hiperpigmentação..." />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Queixa Principal <span className="text-red-400">*</span></Label>
          <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.mainComplaint} onChange={f("mainComplaint")} placeholder="O que mais incomoda na face? Acne, manchas, rugas, flacidez, poros dilatados..." />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Histórico do Problema</Label>
          <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.diseaseHistory} onChange={f("diseaseHistory")} placeholder="Quando começou? Houve piora recente? Fatores que desencadearam (estresse, mudança hormonal, sol)..." />
        </div>
      </AnamSection>

      <AnamSection title="Análise de Pele" subtitle="Tipo de pele, fototipo (Fitzpatrick), condições e exposição solar" icon={<Sun className="w-4 h-4" />} colorClass="amber" open={sections.s2} onToggle={() => toggle("s2")}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Tipo de Pele</Label>
            <Select value={form.skinType} onValueChange={sv("skinType")}>
              <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="seca">Seca</SelectItem>
                <SelectItem value="oleosa">Oleosa</SelectItem>
                <SelectItem value="mista">Mista</SelectItem>
                <SelectItem value="sensivel">Sensível</SelectItem>
                <SelectItem value="acneica">Acneica</SelectItem>
                <SelectItem value="desidratada">Desidratada</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Fototipo (Fitzpatrick)</Label>
            <Select value={form.phototype} onValueChange={sv("phototype")}>
              <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="I">I – Sempre queima, nunca bronzeia (pele muito clara)</SelectItem>
                <SelectItem value="II">II – Sempre queima, bronzeia minimamente</SelectItem>
                <SelectItem value="III">III – Queima moderado, bronzeia gradualmente</SelectItem>
                <SelectItem value="IV">IV – Queima minimamente, bronzeia com facilidade</SelectItem>
                <SelectItem value="V">V – Raramente queima, bronzeia muito (pele morena)</SelectItem>
                <SelectItem value="VI">VI – Nunca queima, pele muito escura</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-slate-700">Condições de Pele (marque todas que se aplicam)</Label>
          <div className="flex flex-wrap gap-2">
            {["Acne", "Rosácea", "Melasma", "Manchas solares", "Envelhecimento precoce", "Flacidez", "Rugas finas", "Rugas profundas", "Poros dilatados", "Oleosidade excessiva", "Ressecamento", "Sensibilidade", "Telangectasias", "Cicatrizes", "Olheiras", "Estrias faciais", "Xantomas", "Ceratose pilar"].map(cond => (
              <CheckTag key={cond} label={cond} active={hasInList(form.skinConditions, cond)} onClick={() => setForm(p => ({ ...p, skinConditions: toggleInList(p.skinConditions, cond) }))} />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Exposição Solar</Label>
            <Select value={form.sunExposure} onValueChange={sv("sunExposure")}>
              <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="alta">Alta (trabalha ao ar livre, praia frequente)</SelectItem>
                <SelectItem value="moderada">Moderada (exposição ocasional)</SelectItem>
                <SelectItem value="baixa">Baixa (trabalha em ambiente fechado)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Uso de Protetor Solar</Label>
            <Select value={form.sunProtector} onValueChange={sv("sunProtector")}>
              <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="diario">Diário (FPS 30+)</SelectItem>
                <SelectItem value="as-vezes">Às vezes</SelectItem>
                <SelectItem value="nao-usa">Não usa</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Rotina de Skincare Atual</Label>
          <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.currentSkincareRoutine} onChange={f("currentSkincareRoutine")} placeholder="Produtos usados: limpeza, hidratante, sérum, vitamina C, retinol, ácidos, etc..." />
        </div>
      </AnamSection>

      <AnamSection title="Histórico de Tratamentos Estéticos" subtitle="Procedimentos anteriores, reações e cirurgias" icon={<FlaskConical className="w-4 h-4" />} colorClass="pink" open={sections.s3} onToggle={() => toggle("s3")}>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Tratamentos Estéticos Anteriores</Label>
          <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.previousAestheticTreatments} onChange={f("previousAestheticTreatments")} placeholder="Ex: Peeling químico, laser CO₂, luz intensa pulsada (IPL), microagulhamento, toxina botulínica, preenchimento com ácido hialurônico, HIFU..." />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Reações ou Complicações Anteriores</Label>
            <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.aestheticReactions} onChange={f("aestheticReactions")} placeholder="Queimaduras, hiperpigmentação pós-inflamatória, alergias a cosméticos, infecções..." />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Cirurgias Faciais</Label>
            <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.facialSurgeries} onChange={f("facialSurgeries")} placeholder="Ritidoplastia (lifting), blefaroplastia, rinoplastia, otoplastia, lipoaspiração facial..." />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Medicamentos Fotossensibilizantes ou Interfirentes</Label>
            <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.sensitizingMedications} onChange={f("sensitizingMedications")} placeholder="Isotretinoína, retinoides tópicos, anticoagulantes, corticoides, anticonvulsivantes, metformina, antibióticos..." />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Alergias</Label>
            <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.allergies} onChange={f("allergies")} placeholder="Cosméticos, anestésicos tópicos (lidocaína), metais (níquel), fragrâncias, látex..." />
          </div>
        </div>
      </AnamSection>

      <AnamSection title="Saúde e Hábitos" subtitle="Histórico médico relevante e estilo de vida" icon={<HeartPulse className="w-4 h-4" />} colorClass="emerald" open={sections.s4} onToggle={() => toggle("s4")}>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">Histórico Médico Relevante</Label>
          <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.medicalHistory} onChange={f("medicalHistory")} placeholder="Diabetes, hipertensão, problemas de tireoide, gravidez/amamentação, lúpus, vitiligo, herpes recidivante..." />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700">Hábitos (marque se aplicar)</Label>
            <div className="flex flex-wrap gap-2">
              {["Fumante", "Consumo de álcool", "Uso de anticoncepcional", "Sono irregular", "Exposição excessiva a telas", "Baixa ingestão de água", "Dieta rica em açúcar"].map(h => (
                <CheckTag key={h} label={h} active={hasInList(form.aestheticHabits, h)} onClick={() => setForm(p => ({ ...p, aestheticHabits: toggleInList(p.aestheticHabits, h) }))} />
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Nível de Estresse</Label>
            <Select value={form.lifestyle} onValueChange={sv("lifestyle")}>
              <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="baixo">Baixo</SelectItem>
                <SelectItem value="moderado">Moderado</SelectItem>
                <SelectItem value="alto">Alto</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </AnamSection>

      <AnamSection title="Objetivos" subtitle="Expectativas com o tratamento facial" icon={<Target className="w-4 h-4" />} colorClass="blue" open={sections.s5} onToggle={() => toggle("s5")}>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-slate-700">O que espera alcançar?</Label>
          <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.patientGoals} onChange={f("patientGoals")} placeholder="Melhorar manchas, reduzir rugas, harmonização facial, rejuvenescimento, controle de acne..." />
        </div>
      </AnamSection>
    </>
  );
}
