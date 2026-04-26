import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Crown, Sparkles, Star, Zap, CreditCard, ExternalLink, Loader2, AlertCircle } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/lib/toast";
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

interface BillingStatus {
  billingMode: "manual" | "asaas_card";
  asaasSubscriptionId: string | null;
  asaasCheckoutUrl: string | null;
  paymentStatus: string;
  currentPeriodEnd: string | null;
  status: string;
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
  essencial: { icon: Zap, gradient: "from-slate-50 to-slate-100", ring: "ring-slate-200", chip: "bg-slate-200 text-slate-700" },
  profissional: { icon: Star, gradient: "from-blue-50 to-indigo-50", ring: "ring-blue-300", chip: "bg-blue-100 text-blue-700" },
  premium: { icon: Crown, gradient: "from-amber-50 to-orange-50", ring: "ring-amber-300", chip: "bg-amber-100 text-amber-800" },
};

function formatPrice(value: string): string {
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function PlanoSection() {
  const { subscription, planName: currentPlanName } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);

  const { data: plans = [], isLoading } = useQuery<PublicPlan[]>({
    queryKey: ["public-plans"],
    queryFn: async () => {
      const res = await apiFetch(api("/public/plans"));
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: billing } = useQuery<BillingStatus | null>({
    queryKey: ["saas-billing-mine"],
    queryFn: async () => {
      const res = await apiFetch(api("/saas-billing/mine"));
      if (!res.ok) return null;
      return res.json();
    },
  });

  const subscribeMutation = useMutation({
    mutationFn: async (planId: number) => {
      const res = await apiFetch(api("/saas-billing/subscribe"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? "Falha ao iniciar cobrança");
      }
      return res.json() as Promise<{ checkoutUrl: string; subscriptionId: string }>;
    },
    onSuccess: (data) => {
      toast({ title: "Pagamento criado", description: "Abrindo página segura do gateway…" });
      qc.invalidateQueries({ queryKey: ["saas-billing-mine"] });
      window.open(data.checkoutUrl, "_blank", "noopener,noreferrer");
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao processar", description: err.message, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(api("/saas-billing/cancel"), { method: "POST" });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? "Falha ao cancelar cobrança");
      }
    },
    onSuccess: () => {
      toast({ title: "Cobrança automática cancelada", description: "Você pode reativar a qualquer momento." });
      qc.invalidateQueries({ queryKey: ["saas-billing-mine"] });
      setConfirmCancel(false);
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao cancelar", description: err.message, variant: "destructive" });
    },
  });

  const tierIdxOf = (name: string): number => (isKnownTier(name) ? TIER_ORDER[name] : 99);
  const sortedPlans = [...plans].sort((a, b) => tierIdxOf(a.name) - tierIdxOf(b.name));
  const currentTierIdx = currentPlanName ? TIER_ORDER[currentPlanName] : -1;
  const isAsaasManaged = billing?.billingMode === "asaas_card" && Boolean(billing?.asaasSubscriptionId);
  const isOverdue = billing?.paymentStatus === "overdue" || billing?.paymentStatus === "expired";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-primary shrink-0" />
            <span className="truncate">Plano da clínica</span>
          </h2>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">
            Escolha o plano que melhor se encaixa no momento da sua clínica.
          </p>
        </div>
        {subscription && (
          <div className="inline-flex flex-wrap items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-xl text-xs sm:text-sm font-medium w-fit">
            Plano atual: <strong className="capitalize">{subscription.planName}</strong>
            {subscription.status === "trial" && (
              <Badge variant="outline" className="ml-1 text-[10px]">trial</Badge>
            )}
            {isAsaasManaged && (
              <Badge className="ml-1 bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">
                cobrança automática
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* ── Status de cobrança automática ── */}
      {billing && isAsaasManaged && (
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="py-4 px-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start gap-3">
              <CreditCard className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-emerald-900">Cobrança automática ativa</p>
                <p className="text-emerald-700/80 text-xs mt-0.5">
                  Seu cartão será cobrado mensalmente. Próximo vencimento:{" "}
                  <strong>
                    {billing.currentPeriodEnd
                      ? new Date(billing.currentPeriodEnd).toLocaleDateString("pt-BR")
                      : "—"}
                  </strong>
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {billing.asaasCheckoutUrl && (
                <Button
                  size="sm"
                  variant="outline"
                  asChild
                  className="border-emerald-300 text-emerald-700"
                >
                  <a href={billing.asaasCheckoutUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Abrir cobrança
                  </a>
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmCancel(true)}
                disabled={cancelMutation.isPending}
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                Cancelar cobrança
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {billing && isOverdue && (
        <Card className="border-amber-300 bg-amber-50/60">
          <CardContent className="py-4 px-5 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-900">Pagamento em aberto</p>
              <p className="text-amber-700/80 text-xs mt-0.5">
                {isAsaasManaged
                  ? "Sua última fatura está pendente. Acesse a cobrança acima para regularizar."
                  : "Sua assinatura está vencida. Contate o suporte para regularizar."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <Card>
          <CardContent className="py-10 px-6 sm:p-12 text-center text-muted-foreground">
            Carregando planos...
          </CardContent>
        </Card>
      )}

      {!isLoading && sortedPlans.length === 0 && (
        <Card>
          <CardContent className="py-10 px-6 sm:p-12 text-center text-muted-foreground">
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
          const isPending = subscribeMutation.isPending && subscribeMutation.variables === plan.id;

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
                <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${visual.chip}`}>
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
                    <li className="text-xs text-muted-foreground italic">Detalhes do plano em breve.</li>
                  ) : (
                    planFeatures.map((feat, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                        <span className="text-foreground/80">{feat}</span>
                      </li>
                    ))
                  )}
                </ul>

                {isCurrent && !isAsaasManaged ? (
                  <Button
                    className="w-full"
                    onClick={() => subscribeMutation.mutate(plan.id)}
                    disabled={subscribeMutation.isPending}
                  >
                    {isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Aguarde…</>
                    ) : (
                      <><CreditCard className="w-4 h-4 mr-2" /> Pagar com cartão</>
                    )}
                  </Button>
                ) : isCurrent && isAsaasManaged ? (
                  <Button variant="outline" className="w-full" disabled>
                    Plano em uso
                  </Button>
                ) : isUpgrade ? (
                  <Button
                    className="w-full"
                    onClick={() => subscribeMutation.mutate(plan.id)}
                    disabled={subscribeMutation.isPending}
                  >
                    {isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Aguarde…</>
                    ) : (
                      <><CreditCard className="w-4 h-4 mr-2" /> Fazer upgrade</>
                    )}
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
        <CardContent className="p-4 text-xs text-muted-foreground space-y-1">
          <p>
            O pagamento é processado de forma segura pelo gateway Asaas. Seu cartão é cobrado
            automaticamente todo mês. Você pode cancelar a cobrança automática a qualquer momento
            sem perder o acesso ao período já pago.
          </p>
          <p>
            Mudanças de plano seguem em vigor imediatamente. Para suporte, fale com{" "}
            <a href="mailto:contato@fisiogestpro.com.br" className="text-primary underline">
              contato@fisiogestpro.com.br
            </a>
            .
          </p>
        </CardContent>
      </Card>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar cobrança automática?</AlertDialogTitle>
            <AlertDialogDescription>
              A cobrança recorrente no cartão será encerrada. Você manterá o acesso até o fim do
              período já pago. Para reativar, basta clicar em "Pagar com cartão" novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelMutation.isPending}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                cancelMutation.mutate();
              }}
              disabled={cancelMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {cancelMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Cancelando…</>
              ) : (
                "Sim, cancelar"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
