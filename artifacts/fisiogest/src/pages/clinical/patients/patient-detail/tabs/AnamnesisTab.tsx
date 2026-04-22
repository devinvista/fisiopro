import {
  useGetPatient,
  useCreateAnamnesis,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Loader2, Clock, CheckCircle, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime } from "../utils/format";

import { AnamnesisForm, AnamTemplate } from "./anamnesis/types";
import { TEMPLATE_OPTIONS, emptyForm } from "./anamnesis/constants";
import { ExamAttachmentsSection } from "./anamnesis/ExamAttachmentsSection";
import { TemplateReabilitacao } from "./anamnesis/TemplateReabilitacao";
import { TemplateEsteticaFacial } from "./anamnesis/TemplateEsteticaFacial";
import { TemplateEsteticaCorporal } from "./anamnesis/TemplateEsteticaCorporal";

export function AnamnesisTab({ patientId }: { patientId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: patient } = useGetPatient(patientId);
  const { data: allAnamnesis = [], isLoading, refetch: refetchAll } = useQuery<any[]>({
    queryKey: [`/api/patients/${patientId}/anamnesis`],
  });

  const mutation = useMutation({
    mutationFn: (data: { patientId: number; data: any }) => useCreateAnamnesis().mutateAsync(data),
  });

  const [template, setTemplate] = useState<AnamTemplate>("reabilitacao");
  const [form, setForm] = useState<AnamnesisForm>(emptyForm);

  const filledTypes = new Set(allAnamnesis.map((a: any) => a.templateType));

  const f = (field: keyof AnamnesisForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(p => ({ ...p, [field]: e.target.value }));
  };
  const sv = (field: keyof AnamnesisForm) => (val: string) => {
    setForm(p => ({ ...p, [field]: val }));
  };

  const populateFormFromRecord = (record: any) => {
    const newForm = { ...emptyForm };
    Object.keys(emptyForm).forEach(key => {
      if (record[key] !== undefined && record[key] !== null) {
        (newForm as any)[key] = String(record[key]);
      }
    });
    setForm(newForm);
  };

  useEffect(() => {
    const match = allAnamnesis.find((a: any) => a.templateType === template);
    if (match) {
      populateFormFromRecord(match);
    } else {
      setForm(emptyForm);
    }
  }, [template, allAnamnesis]);

  const currentAnamnesis = allAnamnesis.find((a: any) => a.templateType === template);

  const [sections, setSections] = useState<Record<string, boolean>>({
    s1: true, s2: true, s3: true, s4: true, s5: true,
  });
  const toggle = (k: string) => setSections(p => ({ ...p, [k]: !p[k] }));

  const handleSave = () => {
    mutation.mutate({ patientId, data: { ...form, templateType: template } as any }, {
      onSuccess: () => {
        toast({ title: "Salvo com sucesso", description: "Anamnese atualizada." });
        refetchAll();
        queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/anamnesis`] });
        queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/indicators`] });
        queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/journey`] });
      },
      onError: () => toast({ title: "Erro", description: "Não foi possível salvar.", variant: "destructive" }),
    });
  };

  if (isLoading) return <div className="p-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>;

  return (
    <Card className="border-none shadow-md">
      <CardHeader className="border-b border-slate-100 pb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-xl">Ficha de Anamnese</CardTitle>
            <CardDescription>
              Uma ficha independente por tipo de atendimento
              {filledTypes.size > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                  <CheckCircle className="w-3 h-3" />
                  {filledTypes.size} tipo(s) preenchido(s)
                </span>
              )}
            </CardDescription>
          </div>
          {currentAnamnesis?.updatedAt && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 shrink-0">
              <Clock className="w-3 h-3" />
              Atualizado em {formatDateTime(currentAnamnesis.updatedAt)}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-6 space-y-5">

        {/* ── Template Selector ── */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Tipo de Atendimento</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {TEMPLATE_OPTIONS.map(opt => {
              const isActive = template === opt.value;
              const isFilled = filledTypes.has(opt.value);
              const activeStyles: Record<AnamTemplate, string> = {
                reabilitacao: "border-blue-500 bg-blue-50 text-blue-800 shadow-sm",
                esteticaFacial: "border-rose-500 bg-rose-50 text-rose-800 shadow-sm",
                esteticaCorporal: "border-violet-500 bg-violet-50 text-violet-800 shadow-sm",
              };
              const iconStyles: Record<AnamTemplate, string> = {
                reabilitacao: "bg-blue-100 text-blue-600",
                esteticaFacial: "bg-rose-100 text-rose-600",
                esteticaCorporal: "bg-violet-100 text-violet-600",
              };
              return (
                <button key={opt.value} type="button" onClick={() => setTemplate(opt.value)}
                  className={`relative flex items-start gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                    isActive ? activeStyles[opt.value] : "border-slate-200 bg-white hover:border-slate-300 text-slate-700"
                  }`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    isActive ? iconStyles[opt.value] : "bg-slate-100 text-slate-500"
                  }`}>{opt.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold leading-tight">{opt.label}</p>
                      {isFilled && !isActive && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-700">
                          <Check className="w-2.5 h-2.5" />preenchida
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] mt-0.5 opacity-70">{opt.desc}</p>
                  </div>
                  {isActive && <CheckCircle className="absolute top-2 right-2 w-4 h-4 text-current opacity-60" />}
                </button>
              );
            })}
          </div>
        </div>

        {template === "reabilitacao" && (
          <TemplateReabilitacao form={form} f={f} sv={sv} sections={sections} toggle={toggle} />
        )}

        {template === "esteticaFacial" && (
          <TemplateEsteticaFacial form={form} setForm={setForm} f={f} sv={sv} sections={sections} toggle={toggle} />
        )}

        {template === "esteticaCorporal" && (
          <TemplateEsteticaCorporal form={form} setForm={setForm} f={f} sv={sv} sections={sections} toggle={toggle} />
        )}

        {/* ── Exam Attachments ── */}
        <ExamAttachmentsSection patientId={patientId} />

        {/* ── Floating/Bottom Save Bar ── */}
        <div className="sticky bottom-0 pt-4 pb-2 bg-white/80 backdrop-blur-sm border-t border-slate-100 flex justify-end gap-3 z-10">
          <Button variant="outline" onClick={() => setForm(emptyForm)}>
            Limpar Campos
          </Button>
          <Button className="px-8 gap-2" disabled={mutation.isPending} onClick={handleSave}>
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Salvar Anamnese
          </Button>
        </div>

      </CardContent>
    </Card>
  );
}
