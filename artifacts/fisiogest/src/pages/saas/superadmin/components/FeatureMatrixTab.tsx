import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Loader2,
  Save,
  RotateCcw,
  Layers,
  Sparkles,
  Crown,
  Wallet,
  Info,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { useToast } from "@/lib/toast";
import { apiFetch, apiFetchJson } from "@/lib/api";
import { api } from "../constants";
import type { Plan } from "../types";
import {
  FEATURES,
  type Feature,
  type FeatureCategory,
  type FeatureMeta,
} from "@/utils/plan-features";

type CatalogResponse = {
  catalog: FeatureMeta[];
  defaults: Record<string, Feature[]>;
  tiers: readonly string[];
};

const CATEGORY_META: Record<
  FeatureCategory,
  { label: string; description: string; icon: React.ElementType; color: string }
> = {
  core: {
    label: "Núcleo",
    description: "Módulos essenciais — disponíveis em todos os planos por padrão.",
    icon: Layers,
    color: "text-blue-600",
  },
  modules: {
    label: "Módulos avançados",
    description: "Recursos do plano Profissional em diante.",
    icon: Sparkles,
    color: "text-violet-600",
  },
  premium: {
    label: "Premium",
    description: "Funcionalidades exclusivas do plano Premium.",
    icon: Crown,
    color: "text-amber-600",
  },
  financial: {
    label: "Financeiro / Contabilidade",
    description: "Família de visões e ferramentas financeiras escalonadas por plano.",
    icon: Wallet,
    color: "text-emerald-600",
  },
};

const FEATURE_KEY_SET = new Set<string>(FEATURES);

/** Separa as chaves canônicas (entitlement) das strings de marketing. */
function partitionFeatures(arr: string[] | null | undefined): {
  canonical: Feature[];
  marketing: string[];
} {
  const canonical: Feature[] = [];
  const marketing: string[] = [];
  for (const item of arr ?? []) {
    if (typeof item !== "string") continue;
    if (FEATURE_KEY_SET.has(item)) canonical.push(item as Feature);
    else marketing.push(item);
  }
  return { canonical, marketing };
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

export function FeatureMatrixTab() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: plans = [], isLoading: loadingPlans } = useQuery<Plan[]>({
    queryKey: ["plans"],
    queryFn: () => apiFetchJson(api("/plans")),
  });

  const { data: catalogResp, isLoading: loadingCatalog } = useQuery<CatalogResponse>({
    queryKey: ["plans", "feature-catalog"],
    queryFn: () => apiFetchJson(api("/plans/feature-catalog")),
  });

  const catalog = catalogResp?.catalog ?? [];
  const defaults = catalogResp?.defaults ?? {};

  /** Estado local: planId → Set<Feature> selecionadas. */
  const [pending, setPending] = useState<Record<number, Set<Feature>>>({});

  /** Estado original (do servidor) para comparar dirty. */
  const original = useMemo(() => {
    const map: Record<number, Set<Feature>> = {};
    for (const p of plans) {
      const { canonical } = partitionFeatures(p.features);
      map[p.id] = new Set(canonical);
    }
    return map;
  }, [plans]);

  /** Inicializa pending quando os dados do servidor chegam. */
  useEffect(() => {
    if (plans.length === 0) return;
    setPending((prev) => {
      const next: Record<number, Set<Feature>> = {};
      for (const p of plans) {
        next[p.id] = prev[p.id] ?? new Set(original[p.id]);
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans.length]);

  const sortedPlans = useMemo(
    () => [...plans].sort((a, b) => a.sortOrder - b.sortOrder),
    [plans],
  );

  const grouped = useMemo(() => {
    const groups = new Map<FeatureCategory, FeatureMeta[]>();
    for (const f of catalog) {
      const arr = groups.get(f.category) ?? [];
      arr.push(f);
      groups.set(f.category, arr);
    }
    // Ordem fixa das categorias
    const order: FeatureCategory[] = ["core", "modules", "premium", "financial"];
    return order
      .filter((c) => groups.has(c))
      .map((c) => ({ category: c, meta: CATEGORY_META[c], items: groups.get(c)! }));
  }, [catalog]);

  const dirtyPlanIds = useMemo(() => {
    const ids: number[] = [];
    for (const p of plans) {
      const a = pending[p.id];
      const b = original[p.id];
      if (!a || !b) continue;
      if (!setsEqual(a, b)) ids.push(p.id);
    }
    return ids;
  }, [pending, original, plans]);

  const togglePlan = (planId: number, feature: Feature, checked: boolean) => {
    setPending((prev) => {
      const next = { ...prev };
      const set = new Set(next[planId] ?? []);
      if (checked) set.add(feature);
      else set.delete(feature);
      next[planId] = set;
      return next;
    });
  };

  const resetPlan = (planId: number) => {
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    const def = defaults[plan.name];
    if (!def) {
      toast({
        variant: "destructive",
        title: "Plano sem default",
        description: `Não há matriz hardcoded para "${plan.name}". Configure manualmente.`,
      });
      return;
    }
    setPending((prev) => ({ ...prev, [planId]: new Set(def) }));
  };

  const revertPlan = (planId: number) => {
    setPending((prev) => ({ ...prev, [planId]: new Set(original[planId] ?? []) }));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Salva apenas planos dirty.
      for (const planId of dirtyPlanIds) {
        const plan = plans.find((p) => p.id === planId);
        if (!plan) continue;
        const { marketing } = partitionFeatures(plan.features);
        const newCanonical = Array.from(pending[planId] ?? []);
        // Preserva strings de marketing (PT-BR) usadas pela landing/PlansTab.
        const merged = [...marketing, ...newCanonical];
        const res = await apiFetch(api(`/plans/${planId}`), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ features: merged }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(
            (err as any).message || `Erro ao salvar plano ${plan.displayName}`,
          );
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plans"] });
      toast({
        title: "Matriz atualizada",
        description: `${dirtyPlanIds.length} plano(s) salvos. As clínicas verão as mudanças no próximo carregamento.`,
      });
    },
    onError: (err: any) =>
      toast({ variant: "destructive", title: "Erro ao salvar", description: err.message }),
  });

  if (loadingPlans || loadingCatalog) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 py-16 text-center">
        <p className="text-slate-500">
          Nenhum plano cadastrado. Crie planos na aba "Planos" para configurar a matriz.
        </p>
      </div>
    );
  }

  const dirtyCount = dirtyPlanIds.length;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Matriz de Features</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Configure quais recursos cada plano libera — sem precisar mexer em código.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={dirtyCount === 0 || saveMutation.isPending}
              className="rounded-xl gap-2"
            >
              {saveMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {dirtyCount > 0 ? `Salvar (${dirtyCount} plano${dirtyCount > 1 ? "s" : ""})` : "Salvar"}
            </Button>
          </div>
        </div>

        {/* Banner explicativo */}
        <div className="rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3 flex items-start gap-3">
          <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
          <div className="text-xs text-blue-900 leading-relaxed">
            <p className="font-semibold mb-0.5">Como funciona</p>
            <p>
              Toda checagem de acesso (backend e frontend) consulta primeiro a coluna{" "}
              <code className="px-1 py-0.5 rounded bg-white text-[10px]">features</code> deste
              plano no banco. Se o plano não tiver nenhuma chave canônica gravada, o sistema cai
              automaticamente na <strong>matriz hardcoded</strong> do tier{" "}
              <code className="px-1 py-0.5 rounded bg-white text-[10px]">essencial / profissional / premium</code>.
              Bullets de marketing em PT-BR (ex.: "Agenda completa") são preservados e não interferem.
            </p>
          </div>
        </div>

        {/* Tabela da matriz */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80 border-b border-slate-100">
                  <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest min-w-[260px]">
                    Recurso
                  </TableHead>
                  {sortedPlans.map((plan) => {
                    const usingDefault = (original[plan.id]?.size ?? 0) === 0;
                    const isDirty = dirtyPlanIds.includes(plan.id);
                    return (
                      <TableHead
                        key={plan.id}
                        className="text-center min-w-[150px] align-top py-3"
                      >
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-bold text-slate-800">
                              {plan.displayName}
                            </span>
                            {isDirty && (
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Alterações pendentes" />
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {usingDefault ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                    <AlertTriangle className="w-3 h-3" /> usando padrão
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Nenhuma chave canônica gravada. Marque/desmarque qualquer
                                  célula abaixo e salve para começar a customizar este plano.
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                                    <CheckCircle2 className="w-3 h-3" /> customizado
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Este plano usa a configuração gravada no banco.
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5 mt-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => resetPlan(plan.id)}
                                  className="text-[10px] text-slate-500 hover:text-slate-800 px-1.5 py-0.5 rounded hover:bg-slate-100 inline-flex items-center gap-1"
                                >
                                  <RotateCcw className="w-3 h-3" /> padrão
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                Aplica a matriz hardcoded do tier "{plan.name}".
                              </TooltipContent>
                            </Tooltip>
                            {isDirty && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => revertPlan(plan.id)}
                                    className="text-[10px] text-amber-600 hover:text-amber-800 px-1.5 py-0.5 rounded hover:bg-amber-50"
                                  >
                                    desfazer
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Reverte para o estado salvo no banco.
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </div>
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {grouped.map(({ category, meta, items }) => {
                  const Icon = meta.icon;
                  return (
                    <>
                      <TableRow key={`hdr-${category}`} className="bg-slate-50/40 border-b border-slate-100">
                        <TableCell
                          colSpan={1 + sortedPlans.length}
                          className="py-2"
                        >
                          <div className="flex items-center gap-2">
                            <Icon className={`w-4 h-4 ${meta.color}`} />
                            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                              {meta.label}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              · {meta.description}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                      {items.map((feat) => (
                        <TableRow
                          key={feat.key}
                          className="border-b border-slate-50 hover:bg-slate-50/40"
                        >
                          <TableCell className="py-2.5">
                            <div>
                              <div className="text-sm font-semibold text-slate-800">
                                {feat.label}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                {feat.description}
                              </div>
                              <code className="text-[10px] text-slate-400 mt-0.5 inline-block">
                                {feat.key}
                              </code>
                            </div>
                          </TableCell>
                          {sortedPlans.map((plan) => {
                            const checked = pending[plan.id]?.has(feat.key) ?? false;
                            const wasChecked = original[plan.id]?.has(feat.key) ?? false;
                            const changed = checked !== wasChecked;
                            return (
                              <TableCell
                                key={plan.id}
                                className="text-center py-2.5"
                              >
                                <div className="flex items-center justify-center">
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={(v) =>
                                      togglePlan(plan.id, feat.key, Boolean(v))
                                    }
                                    className={
                                      changed
                                        ? "data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500 border-amber-400"
                                        : ""
                                    }
                                  />
                                </div>
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-slate-500">
          <div>
            {dirtyCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-amber-700 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                {dirtyCount} plano{dirtyCount > 1 ? "s" : ""} com alterações não salvas
              </span>
            ) : (
              <span>Tudo sincronizado com o banco.</span>
            )}
          </div>
          <div>{catalog.length} features no catálogo</div>
        </div>
      </div>
    </TooltipProvider>
  );
}
