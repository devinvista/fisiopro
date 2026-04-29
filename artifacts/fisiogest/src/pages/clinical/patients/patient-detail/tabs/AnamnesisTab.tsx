import {
  useGetPatient,
  useCreateAnamnesis,
  useListProcedures,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetchJson } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Loader2, Clock, CheckCircle, Check, Lock, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useMemo } from "react";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/hooks/use-auth";
import { formatDateTime } from "../utils/format";

import { AnamnesisForm, AnamTemplate } from "./anamnesis/types";
import { TEMPLATE_OPTIONS, emptyForm } from "./anamnesis/constants";
import { ExamAttachmentsSection } from "./anamnesis/ExamAttachmentsSection";
import { TemplateReabilitacao } from "./anamnesis/TemplateReabilitacao";
import { TemplateEsteticaFacial } from "./anamnesis/TemplateEsteticaFacial";
import { TemplateEsteticaCorporal } from "./anamnesis/TemplateEsteticaCorporal";
import { TemplatePilates } from "./anamnesis/TemplatePilates";

// Referência estável para o default do useQuery: evita criar novo `[]` a cada
// render, o que dispararia o useEffect [template, allAnamnesis] a cada tecla
// digitada e zeraria o formulário.
const EMPTY_ANAMNESIS: any[] = [];

export function AnamnesisTab({ patientId }: { patientId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasRole, hasPermission } = useAuth();

  // ── RBAC ──
  // ÚNICO papel autorizado a editar/criar anamnese: profissional.
  // Admin e secretaria têm somente leitura.
  const canEdit = hasPermission("anamnesis.write") && hasRole("profissional");
  const canRead = hasPermission("anamnesis.read");

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: patient } = useGetPatient(patientId);

  // Lista de procedimentos da clínica (somente ativos por padrão).
  // Usado para mostrar APENAS os templates de anamnese cujas categorias de
  // procedimento estão habilitadas na clínica.
  const { data: procedures = [] } = useListProcedures(
    {},
    {
      query: {
        queryKey: ["listProcedures", "anamnesis-categories"],
        // Cache curto — categorias raramente mudam
        staleTime: 60_000,
        // Se o usuário não pode sequer ler anamnese, não precisamos buscar
        enabled: canRead,
      },
    },
  );

  const activeCategories = useMemo(() => {
    const set = new Set<string>();
    for (const p of procedures as Array<{ category?: string | null; isActive?: boolean | null }>) {
      if (p.isActive === false) continue;
      if (p.category) set.add(p.category);
    }
    return set;
  }, [procedures]);

  // Templates visíveis = aqueles cuja categoria está ativa na clínica.
  // Se nenhuma categoria for detectada (clínica nova / sem procedimentos),
  // mostramos todos como fallback para não bloquear o cadastro.
  const visibleTemplates = useMemo(() => {
    if (activeCategories.size === 0) return TEMPLATE_OPTIONS;
    return TEMPLATE_OPTIONS.filter(opt => activeCategories.has(opt.procedureCategory));
  }, [activeCategories]);

  const { data: allAnamnesis = EMPTY_ANAMNESIS, isLoading, refetch: refetchAll } = useQuery<any[]>({
    queryKey: [`/api/patients/${patientId}/anamnesis`, { all: true }],
    queryFn: () => apiFetchJson<any[]>(`/api/patients/${patientId}/anamnesis?all=true`),
    enabled: canRead,
  });

  const mutation = useCreateAnamnesis();

  const [template, setTemplate] = useState<AnamTemplate>(
    () => (visibleTemplates[0]?.value ?? "reabilitacao"),
  );

  // Mantém o template selecionado válido quando a lista de visíveis muda
  useEffect(() => {
    if (visibleTemplates.length === 0) return;
    if (!visibleTemplates.some(opt => opt.value === template)) {
      setTemplate(visibleTemplates[0].value);
    }
  }, [visibleTemplates, template]);

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
    if (!canEdit) return;
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

  if (!canRead) {
    return (
      <Card className="border-none shadow-md">
        <CardContent className="p-10 text-center text-slate-500">
          <Lock className="w-8 h-8 mx-auto mb-2 text-slate-400" />
          <p className="text-sm font-semibold text-slate-700">Acesso restrito</p>
          <p className="text-xs">Você não tem permissão para visualizar anamneses.</p>
        </CardContent>
      </Card>
    );
  }

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

        {/* ── Banner de somente leitura ── */}
        {!canEdit && (
          <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5">
            <Eye className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-800 leading-relaxed">
              <span className="font-semibold">Modo somente leitura.</span> A edição da anamnese é restrita a usuários com perfil <span className="font-semibold">Profissional</span>.
            </p>
          </div>
        )}

        {/* ── Template Selector ──
            Responsividade: o tab vive dentro de `lg:col-span-2` da página de
            paciente, então a largura útil ao final é ~2/3 da página. Forçar 4
            colunas a partir de `lg` (1024 px) deixa cada card com ~120-180 px
            e a descrição quebra em 5 linhas. Por isso:
              - 4 templates: 1 col → 2 cols (sm) → 4 cols só em 2xl (≥1536 px)
              - 3 templates: 1 col → 2 cols (sm) → 3 cols em xl (≥1280 px)
              - 2 templates: 1 col → 2 cols (sm) */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
            Tipo de Atendimento
            {visibleTemplates.length < TEMPLATE_OPTIONS.length && (
              <span className="ml-2 normal-case font-normal text-[10px] text-slate-400">
                · filtrado pelas categorias de procedimento ativas na clínica
              </span>
            )}
          </p>
          <div
            className={`grid gap-2.5 sm:gap-3 ${
              visibleTemplates.length >= 4
                ? "grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4"
                : visibleTemplates.length === 3
                ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
                : visibleTemplates.length === 2
                ? "grid-cols-1 sm:grid-cols-2"
                : "grid-cols-1"
            }`}
          >
            {visibleTemplates.map(opt => {
              const isActive = template === opt.value;
              const isFilled = filledTypes.has(opt.value);
              const activeStyles: Record<AnamTemplate, string> = {
                reabilitacao: "border-blue-500 bg-blue-50 text-blue-800 shadow-sm",
                esteticaFacial: "border-rose-500 bg-rose-50 text-rose-800 shadow-sm",
                esteticaCorporal: "border-violet-500 bg-violet-50 text-violet-800 shadow-sm",
                pilates: "border-teal-500 bg-teal-50 text-teal-800 shadow-sm",
              };
              const iconStyles: Record<AnamTemplate, string> = {
                reabilitacao: "bg-blue-100 text-blue-600",
                esteticaFacial: "bg-rose-100 text-rose-600",
                esteticaCorporal: "bg-violet-100 text-violet-600",
                pilates: "bg-teal-100 text-teal-600",
              };
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTemplate(opt.value)}
                  aria-pressed={isActive}
                  aria-label={`${opt.label}${isFilled ? " (preenchida)" : ""}`}
                  className={`relative flex items-start gap-2.5 p-2.5 sm:p-3 pr-7 sm:pr-8 rounded-xl border-2 transition-all text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                    isActive
                      ? activeStyles[opt.value]
                      : "border-slate-200 bg-white hover:border-slate-300 text-slate-700"
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isActive ? iconStyles[opt.value] : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {opt.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-bold leading-tight break-words">{opt.label}</p>
                      {isFilled && !isActive && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-700 whitespace-nowrap">
                          <Check className="w-2.5 h-2.5" />
                          preenchida
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] mt-0.5 opacity-70 leading-snug line-clamp-2 break-words">
                      {opt.desc}
                    </p>
                  </div>
                  {isActive && (
                    <CheckCircle className="absolute top-2 right-2 w-4 h-4 text-current opacity-60" />
                  )}
                </button>
              );
            })}
          </div>
          {visibleTemplates.length === 0 && (
            <p className="text-xs text-slate-500 mt-2">
              Nenhuma categoria de procedimento ativa nesta clínica. Cadastre procedimentos para liberar os templates de anamnese correspondentes.
            </p>
          )}
        </div>

        {template === "reabilitacao" && (
          <TemplateReabilitacao form={form} f={f} sv={sv} sections={sections} toggle={toggle} readOnly={!canEdit} />
        )}

        {template === "esteticaFacial" && (
          <TemplateEsteticaFacial form={form} setForm={setForm} f={f} sv={sv} sections={sections} toggle={toggle} readOnly={!canEdit} />
        )}

        {template === "esteticaCorporal" && (
          <TemplateEsteticaCorporal form={form} setForm={setForm} f={f} sv={sv} sections={sections} toggle={toggle} readOnly={!canEdit} />
        )}

        {template === "pilates" && (
          <TemplatePilates form={form} f={f} sv={sv} sections={sections} toggle={toggle} readOnly={!canEdit} />
        )}

        {/* ── Exam Attachments ── */}
        <ExamAttachmentsSection patientId={patientId} />

        {/* ── Floating/Bottom Save Bar (apenas para profissional) ── */}
        {canEdit && (
          <div className="sticky bottom-16 lg:bottom-0 pt-4 pb-2 bg-white/80 backdrop-blur-sm border-t border-slate-100 flex flex-col-reverse gap-2 sm:flex-row sm:gap-3 sm:justify-end z-10">
            <Button variant="outline" onClick={() => setForm(emptyForm)} className="w-full sm:w-auto h-10 rounded-xl">
              Limpar Campos
            </Button>
            <Button className="w-full sm:w-auto h-10 sm:px-8 rounded-xl gap-1.5" disabled={mutation.isPending} onClick={handleSave}>
              {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <CheckCircle className="w-4 h-4 shrink-0" />}
              Salvar Anamnese
            </Button>
          </div>
        )}

      </CardContent>
    </Card>
  );
}
