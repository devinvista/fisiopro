import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetchJson } from "@/lib/api";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { VoiceTextarea as Textarea } from "@/components/ui/voice-textarea";
import { Target, Sparkles, Plus, ChevronDown, ChevronUp, Wand2 } from "lucide-react";
import { useToast } from "@/lib/toast";
import {
  OBJECTIVE_PRESETS,
  categoryFromTemplate,
  categoryLabel,
  type ObjectiveCategory,
} from "./objectivesPresets";

type AnamnesisRow = {
  id: number;
  templateType?: string | null;
  patientGoals?: string | null;
  aestheticGoalDetails?: string | null;
  pilatesGoals?: string | null;
  mainComplaint?: string | null;
  functionalImpact?: string | null;
  updatedAt?: string;
};

interface Props {
  patientId: number;
  value: string;
  onChange: (next: string) => void;
}

export function ObjectivesField({ patientId, value, onChange }: Props) {
  const { toast } = useToast();
  const [chipsOpen, setChipsOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<ObjectiveCategory | null>(null);

  const { data: anamneses = [] } = useQuery<AnamnesisRow[]>({
    queryKey: [`/api/patients/${patientId}/anamnesis?all=true`],
    queryFn: () => apiFetchJson<AnamnesisRow[]>(`/api/patients/${patientId}/anamnesis?all=true`),
    enabled: !!patientId,
  });

  const latestAnamnesis = useMemo<AnamnesisRow | null>(() => {
    if (!Array.isArray(anamneses) || anamneses.length === 0) return null;
    const sorted = [...anamneses].sort((a, b) => {
      const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return tb - ta;
    });
    return sorted[0] ?? null;
  }, [anamneses]);

  const inferredCategory: ObjectiveCategory = useMemo(
    () => categoryFromTemplate(latestAnamnesis?.templateType ?? undefined),
    [latestAnamnesis],
  );

  const effectiveCategory = activeCategory ?? inferredCategory;
  const presets = OBJECTIVE_PRESETS[effectiveCategory];

  function buildSuggestionFromAnamnesis(a: AnamnesisRow): string {
    const parts: string[] = [];

    const goalText = [a.patientGoals, a.aestheticGoalDetails, a.pilatesGoals]
      .filter((s) => s && s.trim().length > 0)
      .map((s) => s!.trim());

    if (goalText.length > 0) {
      parts.push(`Objetivos relatados pelo paciente: ${goalText.join(" / ")}.`);
    }
    if (a.mainComplaint && a.mainComplaint.trim().length > 0) {
      parts.push(`Tratar: ${a.mainComplaint.trim()}.`);
    }
    if (a.functionalImpact && a.functionalImpact.trim().length > 0) {
      parts.push(`Impacto funcional a melhorar: ${a.functionalImpact.trim()}.`);
    }

    return parts.join("\n");
  }

  function handleSuggest() {
    if (!latestAnamnesis) {
      toast({
        title: "Sem anamnese cadastrada",
        description:
          "Preencha a aba Anamnese antes de gerar sugestões automáticas para o plano.",
        variant: "destructive",
      });
      return;
    }
    const suggestion = buildSuggestionFromAnamnesis(latestAnamnesis);
    if (!suggestion) {
      toast({
        title: "Anamnese sem objetivos",
        description:
          "A anamnese existente não tem campos de objetivo/queixa preenchidos. Atualize-a primeiro.",
        variant: "destructive",
      });
      return;
    }
    const merged = value && value.trim().length > 0
      ? `${value.trim()}\n\n${suggestion}`
      : suggestion;
    onChange(merged);
    toast({
      title: "Objetivos sugeridos!",
      description: "Texto preenchido a partir da anamnese mais recente.",
    });
  }

  function appendChip(text: string) {
    const exists = value.toLowerCase().includes(text.toLowerCase());
    if (exists) return;
    const sep = value && !value.endsWith("\n") ? "\n• " : "• ";
    const next = value ? `${value}${sep}${text}` : `• ${text}`;
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" /> Objetivos do Tratamento
        </Label>
        <div className="flex items-center gap-1.5">
          <Button
            type="button" size="sm" variant="outline"
            className="h-8 gap-1.5 rounded-lg border-primary/30 text-primary hover:bg-primary/5 text-xs"
            onClick={handleSuggest}
            disabled={!latestAnamnesis}
            title={
              latestAnamnesis
                ? "Preencher a partir da anamnese mais recente"
                : "Cadastre a anamnese primeiro"
            }
          >
            <Wand2 className="w-3.5 h-3.5" /> Sugerir da Anamnese
          </Button>
          <Button
            type="button" size="sm" variant="outline"
            className="h-8 gap-1.5 rounded-lg text-xs"
            onClick={() => setChipsOpen((v) => !v)}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Modelos
            {chipsOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </Button>
        </div>
      </div>

      {chipsOpen && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-500 mr-1">Categoria:</span>
            {(["reabilitacao", "esteticaFacial", "esteticaCorporal", "pilates", "geral"] as ObjectiveCategory[]).map(
              (c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setActiveCategory(c)}
                  className={`text-[11px] px-2 py-0.5 rounded-full border transition ${
                    effectiveCategory === c
                      ? "bg-primary/10 border-primary/40 text-primary font-semibold"
                      : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {categoryLabel(c)}
                </button>
              ),
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((preset) => {
              const used = value.toLowerCase().includes(preset.toLowerCase());
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => appendChip(preset)}
                  disabled={used}
                  className={`text-xs px-2.5 py-1 rounded-full border transition flex items-center gap-1 ${
                    used
                      ? "bg-emerald-50 border-emerald-200 text-emerald-700 cursor-default"
                      : "bg-white border-slate-200 text-slate-700 hover:border-primary/40 hover:bg-primary/5"
                  }`}
                >
                  {!used && <Plus className="w-3 h-3" />}
                  {preset}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-400">
            Clique nos modelos para adicionar como itens. Eles aparecerão no campo abaixo.
          </p>
        </div>
      )}

      <Textarea
        className="min-h-[140px] bg-slate-50 border-slate-200 focus:bg-white transition-colors"
        placeholder="Quais os principais objetivos desta etapa? (ex: redução de dor, ganho de amplitude...)"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />

      {latestAnamnesis && !value && (
        <p className="text-[11px] text-slate-500 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-primary" />
          Há anamnese cadastrada para este paciente. Use{" "}
          <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
            Sugerir da Anamnese
          </Badge>{" "}
          para preencher automaticamente.
        </p>
      )}
    </div>
  );
}
