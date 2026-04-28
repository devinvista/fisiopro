import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Crown, Sparkles, ShieldCheck, Loader2, Check, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { apiFetchJson } from "@/lib/api";
import {
  FEATURE_CATALOG,
  getMinimumPlanForFeature,
  resolvePlanFeatures,
  type Feature,
  type PlanTier,
} from "@/utils/plan-features";
import type { Plan } from "@/pages/saas/superadmin/types";

interface FeatureRouteProps {
  component: React.ComponentType;
  feature: Feature;
}

const TIER_BADGE: Record<PlanTier, { icon: React.ElementType; color: string; bg: string }> = {
  essencial: { icon: ShieldCheck, color: "text-slate-700", bg: "bg-slate-100" },
  profissional: { icon: Sparkles, color: "text-violet-700", bg: "bg-violet-100" },
  premium: { icon: Crown, color: "text-amber-700", bg: "bg-amber-100" },
};

function formatBRL(price: string | number | null | undefined): string {
  const n = typeof price === "string" ? Number(price) : price ?? 0;
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Guarda de rota baseada em plano. Exige que o usuário esteja autenticado E
 * que a clínica ativa tenha a feature liberada pelo plano. Caso contrário,
 * mostra uma tela de upgrade CONTEXTUAL: nome da feature, plano mínimo
 * necessário, diferença de preço vs plano atual e CTA para a tela de planos.
 */
export function FeatureRoute({ component: Component, feature }: FeatureRouteProps) {
  const { isAuthenticated, isLoading, hasFeature, planName, subscription } = useAuth();
  const [, setLocation] = useLocation();

  // Busca planos públicos para mostrar preços reais e features atuais por plano.
  const { data: publicPlans = [] } = useQuery<Plan[]>({
    queryKey: ["plans", "public"],
    queryFn: () => apiFetchJson("/api/plans/public"),
    enabled: isAuthenticated && !hasFeature(feature),
    staleTime: 60_000,
  });

  // Metadados da feature bloqueada (label/description) vindos do catálogo canônico.
  const featureMeta = useMemo(
    () => FEATURE_CATALOG.find((f) => f.key === feature) ?? null,
    [feature],
  );

  // Constrói matriz {planName: features[]} a partir dos planos do banco para que
  // a busca de "menor plano que tem a feature" respeite customizações da Matriz.
  const customMatrix = useMemo(() => {
    const out: Record<string, Feature[]> = {};
    for (const p of publicPlans) {
      out[p.name] = resolvePlanFeatures(p.name, p.features);
    }
    return out;
  }, [publicPlans]);

  const minTier = useMemo(
    () => getMinimumPlanForFeature(feature, customMatrix),
    [feature, customMatrix],
  );

  const targetPlan = useMemo(
    () => publicPlans.find((p) => p.name === minTier) ?? null,
    [publicPlans, minTier],
  );

  const currentPlan = useMemo(
    () => publicPlans.find((p) => p.name === (planName ?? subscription?.planName)) ?? null,
    [publicPlans, planName, subscription?.planName],
  );

  const priceDiff = useMemo(() => {
    if (!targetPlan) return null;
    const target = Number(targetPlan.price);
    const current = currentPlan ? Number(currentPlan.price) : 0;
    if (Number.isNaN(target)) return null;
    return target - current;
  }, [targetPlan, currentPlan]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) setLocation("/login");
  }, [isAuthenticated, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }
  if (!isAuthenticated) return null;

  if (hasFeature(feature)) return <Component />;

  const TargetIcon = minTier ? TIER_BADGE[minTier].icon : Crown;
  const tierBadge = minTier ? TIER_BADGE[minTier] : TIER_BADGE.premium;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/30 px-4 py-12 flex items-center justify-center">
      <div className="max-w-2xl w-full">
        {/* Hero */}
        <div className="text-center mb-8">
          <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl ${tierBadge.bg} mb-4`}>
            <TargetIcon className={`w-8 h-8 ${tierBadge.color}`} />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            {featureMeta?.label ?? "Recurso"} está bloqueado
          </h1>
          <p className="text-slate-600 max-w-lg mx-auto">
            {featureMeta?.description ??
              "Este recurso não está incluso no seu plano atual."}
          </p>
        </div>

        {/* Cards comparativos */}
        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          {/* Plano atual */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              Plano atual
            </div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl font-bold text-slate-900">
                {currentPlan?.displayName ?? planName ?? "—"}
              </span>
            </div>
            <div className="text-sm text-slate-500 mb-3">
              {currentPlan ? `${formatBRL(currentPlan.price)}/mês` : "—"}
            </div>
            <div className="flex items-center gap-2 text-sm text-rose-600">
              <X className="w-4 h-4" />
              <span>Não inclui {featureMeta?.label ?? feature}</span>
            </div>
          </div>

          {/* Plano alvo */}
          {targetPlan && minTier ? (
            <div className={`rounded-2xl border-2 p-5 relative ${
              minTier === "premium"
                ? "border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50"
                : minTier === "profissional"
                ? "border-violet-300 bg-gradient-to-br from-violet-50 to-purple-50"
                : "border-slate-300 bg-slate-50"
            }`}>
              <div className="absolute -top-2.5 left-4 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-wider">
                Recomendado
              </div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                Plano necessário
              </div>
              <div className="flex items-center gap-2 mb-1">
                <TargetIcon className={`w-5 h-5 ${tierBadge.color}`} />
                <span className="text-xl font-bold text-slate-900">
                  {targetPlan.displayName}
                </span>
              </div>
              <div className="text-sm text-slate-600 mb-3">
                <span className="font-bold text-slate-900">
                  {formatBRL(targetPlan.price)}
                </span>
                <span>/mês</span>
                {priceDiff !== null && priceDiff > 0 && (
                  <span className="ml-1 text-xs text-emerald-700 font-semibold">
                    (+ {formatBRL(priceDiff)} vs atual)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-emerald-700 font-semibold">
                <Check className="w-4 h-4" />
                <span>Inclui {featureMeta?.label ?? feature}</span>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center justify-center text-sm text-slate-400">
              Carregando opções de upgrade…
            </div>
          )}
        </div>

        {/* Outros benefícios do plano alvo */}
        {targetPlan && minTier && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5 mb-6 shadow-sm">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              Você também ganha com o {targetPlan.displayName}
            </div>
            <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2">
              {(() => {
                const currentSet = new Set(
                  currentPlan
                    ? resolvePlanFeatures(currentPlan.name, currentPlan.features)
                    : [],
                );
                const targetFeatures = resolvePlanFeatures(
                  targetPlan.name,
                  targetPlan.features,
                );
                const newOnes = targetFeatures.filter((f) => !currentSet.has(f));
                if (newOnes.length === 0) {
                  return (
                    <span className="text-sm text-slate-400 col-span-2">
                      Acesso à feature solicitada.
                    </span>
                  );
                }
                return newOnes.slice(0, 8).map((f) => {
                  const meta = FEATURE_CATALOG.find((c) => c.key === f);
                  return (
                    <div
                      key={f}
                      className="flex items-start gap-2 text-sm text-slate-700"
                    >
                      <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                      <span>{meta?.label ?? f}</span>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
          <button
            onClick={() => setLocation("/dashboard")}
            className="px-5 py-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Voltar ao dashboard
          </button>
          <button
            onClick={() => setLocation("/configuracoes#plano")}
            className="px-5 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white text-sm font-bold hover:from-violet-700 hover:to-purple-700 transition-all shadow-md hover:shadow-lg inline-flex items-center justify-center gap-2"
          >
            {targetPlan
              ? `Atualizar para ${targetPlan.displayName}`
              : "Ver planos"}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Rodapé técnico */}
        <p className="text-center text-[11px] text-slate-400 mt-6">
          Recurso solicitado:{" "}
          <code className="px-1.5 py-0.5 rounded bg-slate-100">{feature}</code>
          {minTier && (
            <>
              {" · "}plano mínimo:{" "}
              <strong className="text-slate-500">{minTier}</strong>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

