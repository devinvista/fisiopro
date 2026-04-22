import { useQuery } from "@tanstack/react-query";
import { Check, Crown, Sparkles, Star, Zap } from "lucide-react";
import { useAuth } from "@/utils/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/utils/api";
import type { PlanTier } from "@/utils/plan-features";

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = BASE.replace(/\/$/, "").replace(/\/[^/]+$/, "");
const api = (path: string) => `${API_BASE}/api${path}`;

interface PublicPlan {
  id: number;
  name: string;
  displayName: string;
  description: string;
  price: string;
  maxProfessionals: number | null;
  maxPatients: number | null;
  maxUsers: number | null;
  trialDays: number;
  features: unknown;
  sortOrder: number;
}

function normalizeFeatures(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((f): f is string => typeof f === "string");
}

function isKnownTier(name: string): name is PlanTier {
  return name === "essencial" || name === "profissional" || name === "premium";
}

const TIER_ORDER: Record<PlanTier, number> = { essencial: 0, profissional: 1, premium: 2 };

const TIER_VISUAL: Record<
  PlanTier,
  { icon: React.ComponentType<{ className?: string }>; gradient: string; ring: string; chip: string }
> = {
  essencial: {
    icon: Zap,
    gradient: "from-slate-50 to-slate-100",
    ring: "ring-slate-200",
    chip: "bg-slate-200 text-slate-700",
  },
  profissional: {
    icon: Star,
    gradient: "from-blue-50 to-indigo-50",
    ring: "ring-blue-300",
    chip: "bg-blue-100 text-blue-700",
  },
  premium: {
    icon: Crown,
    gradient: "from-amber-50 to-orange-50",
    ring: "ring-amber-300",
    chip: "bg-amber-100 text-amber-800",
  },
};

function formatPrice(value: string): string {
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function PlanoSection() {
  const { subscription, planName: currentPlanName } = useAuth();

  const { data: plans = [], isLoading } = useQuery<PublicPlan[]>({
    queryKey: ["public-plans"],
    queryFn: async () => {
      const res = await apiFetch(api("/public/plans"));
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });

  const tierIdxOf = (name: string): number =>
    isKnownTier(name) ? TIER_ORDER[name] : 99;

  const sortedPlans = [...plans].sort((a, b) => tierIdxOf(a.name) - tierIdxOf(b.name));

  const currentTierIdx = currentPlanName ? TIER_ORDER[currentPlanName] : -1;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            Plano da clínica
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Escolha o plano que melhor se encaixa no momento da sua clínica.
          </p>
        </div>
        {subscription && (
          <div className="flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-xl text-sm font-medium">
            Plano atual: <strong className="capitalize">{subscription.planName}</strong>
            {subscription.status === "trial" && (
              <Badge variant="outline" className="ml-1 text-[10px]">trial</Badge>
            )}
          </div>
        )}
      </div>

      {isLoading && (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            Carregando planos...
          </CardContent>
        </Card>
      )}

      {!isLoading && sortedPlans.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            Nenhum plano disponível no momento.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {sortedPlans.map((plan) => {
          const visual = isKnownTier(plan.name) ? TIER_VISUAL[plan.name] : TIER_VISUAL.essencial;
          const Icon = visual.icon;
          const isCurrent = plan.name === currentPlanName;
          const tierIdx = tierIdxOf(plan.name);
          const isUpgrade = currentTierIdx >= 0 && tierIdx > currentTierIdx;
          const isDowngrade = currentTierIdx >= 0 && tierIdx < currentTierIdx;
          const planFeatures = normalizeFeatures(plan.features);

          return (
            <Card
              key={plan.id}
              className={`relative overflow-hidden bg-gradient-to-br ${visual.gradient} border-2 ${
                isCurrent ? `ring-2 ${visual.ring} border-primary/40` : "border-border/50"
              }`}
            >
              {isCurrent && (
                <div className="absolute top-3 right-3">
                  <Badge className="bg-primary text-primary-foreground">Plano atual</Badge>
                </div>
              )}
              <CardHeader className="pb-3">
                <div
                  className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${visual.chip}`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <CardTitle className="text-xl mt-3 capitalize">{plan.displayName}</CardTitle>
                <p className="text-sm text-muted-foreground">{plan.description}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-foreground">{formatPrice(plan.price)}</span>
                  <span className="text-sm text-muted-foreground">/mês</span>
                </div>

                <ul className="space-y-2 text-sm">
                  {planFeatures.length === 0 ? (
                    <li className="text-xs text-muted-foreground italic">
                      Detalhes do plano em breve.
                    </li>
                  ) : (
                    planFeatures.map((feat, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                        <span className="text-foreground/80">{feat}</span>
                      </li>
                    ))
                  )}
                </ul>

                {isCurrent ? (
                  <Button variant="outline" className="w-full" disabled>
                    Plano em uso
                  </Button>
                ) : isUpgrade ? (
                  <Button
                    className="w-full"
                    onClick={() => {
                      window.open(
                        `mailto:contato@fisiogestpro.com.br?subject=Upgrade para ${plan.displayName}`,
                        "_blank",
                      );
                    }}
                  >
                    Fazer upgrade
                  </Button>
                ) : isDowngrade ? (
                  <Button variant="outline" className="w-full" disabled>
                    Plano inferior ao atual
                  </Button>
                ) : (
                  <Button variant="outline" className="w-full" disabled>
                    Disponível após contratação
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-dashed">
        <CardContent className="p-4 text-xs text-muted-foreground">
          Ao alterar de plano, novas regras de acesso entram em vigor imediatamente. Para mudanças
          de plano e detalhes de cobrança, entre em contato com o suporte.
        </CardContent>
      </Card>
    </div>
  );
}
