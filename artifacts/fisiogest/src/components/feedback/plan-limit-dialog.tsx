import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Crown,
  Sparkles,
  ShieldCheck,
  Check,
  X,
  Users,
  Calendar,
  UserPlus,
  Stethoscope,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetchJson, type PlanLimitInfo } from "@/lib/api";
import type { Plan } from "@/pages/saas/superadmin/types";

type Resource = PlanLimitInfo["resource"];
type Tier = "essencial" | "profissional" | "premium";

const TIER_BADGE: Record<Tier, { icon: React.ElementType; color: string; bg: string; gradient: string }> = {
  essencial: {
    icon: ShieldCheck,
    color: "text-slate-700",
    bg: "bg-slate-100",
    gradient: "border-slate-300 bg-slate-50",
  },
  profissional: {
    icon: Sparkles,
    color: "text-violet-700",
    bg: "bg-violet-100",
    gradient: "border-violet-300 bg-gradient-to-br from-violet-50 to-purple-50",
  },
  premium: {
    icon: Crown,
    color: "text-amber-700",
    bg: "bg-amber-100",
    gradient: "border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50",
  },
};

const RESOURCE_META: Record<
  Resource,
  { icon: React.ElementType; title: string; subject: string; subjectPlural: string }
> = {
  patients: {
    icon: Users,
    title: "Limite de pacientes atingido",
    subject: "paciente",
    subjectPlural: "pacientes",
  },
  users: {
    icon: UserPlus,
    title: "Limite de usuários atingido",
    subject: "usuário",
    subjectPlural: "usuários",
  },
  professionals: {
    icon: Stethoscope,
    title: "Limite de profissionais atingido",
    subject: "profissional",
    subjectPlural: "profissionais",
  },
  schedules: {
    icon: Calendar,
    title: "Limite de agendas atingido",
    subject: "agenda",
    subjectPlural: "agendas",
  },
};

function formatBRL(price: string | number | null | undefined): string {
  const n = typeof price === "string" ? Number(price) : price ?? 0;
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatLimit(limit: number | null | undefined): string {
  if (limit == null) return "ilimitado";
  return limit.toLocaleString("pt-BR");
}

interface PlanLimitDialogProps {
  info: PlanLimitInfo | null;
  onClose: () => void;
}

/**
 * Diálogo contextual de upgrade — disparado globalmente quando o backend
 * responde 402 com `limitReached: true`. Mostra consumo atual vs limite,
 * plano vigente, plano recomendado (com diferença de preço em BRL) e
 * encaminha para `/configuracoes#plano` ao confirmar.
 */
export function PlanLimitDialog({ info, onClose }: PlanLimitDialogProps) {
  const open = info !== null;
  const [, setLocation] = useLocation();

  // Busca planos públicos para preencher preço atual e novos benefícios.
  const { data: publicPlans = [] } = useQuery<Plan[]>({
    queryKey: ["plans", "public"],
    queryFn: () => apiFetchJson("/api/plans/public"),
    enabled: open,
    staleTime: 60_000,
  });

  const meta = info ? RESOURCE_META[info.resource] : null;
  const ResourceIcon = meta?.icon ?? Users;

  const currentPlan = useMemo(
    () => (info ? publicPlans.find((p) => p.name === info.planName) ?? null : null),
    [publicPlans, info],
  );

  const targetPlanFromList = useMemo(
    () => (info?.requiredPlan ? publicPlans.find((p) => p.name === info.requiredPlan?.name) ?? null : null),
    [publicPlans, info],
  );

  const targetTier: Tier | null = useMemo(() => {
    const name = info?.requiredPlan?.name;
    if (name === "essencial" || name === "profissional" || name === "premium") return name;
    return null;
  }, [info?.requiredPlan?.name]);

  const targetBadge = targetTier ? TIER_BADGE[targetTier] : null;
  const TargetIcon = targetBadge?.icon ?? Crown;

  const priceDiff = useMemo(() => {
    if (!info?.requiredPlan) return null;
    const target = Number(info.requiredPlan.price);
    const current = currentPlan ? Number(currentPlan.price) : 0;
    if (Number.isNaN(target)) return null;
    return target - current;
  }, [info, currentPlan]);

  // Reset ao fechar para forçar refetch dos contadores na próxima abertura.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!info || !meta) return null;

  const subjectLabel = info.limit === 1 ? meta.subject : meta.subjectPlural;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-2xl p-0 overflow-hidden"
        data-testid="dialog-plan-limit"
      >
        {/* Hero */}
        <div className="bg-gradient-to-br from-slate-50 via-white to-violet-50/40 px-6 py-6 border-b border-slate-100">
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-12 h-12 rounded-xl bg-rose-100 flex items-center justify-center">
              <ResourceIcon className="w-6 h-6 text-rose-600" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-xl font-bold text-slate-900">
                {meta.title}
              </DialogTitle>
              <DialogDescription className="text-sm text-slate-600 mt-1">
                Você usou{" "}
                <strong className="text-slate-900">
                  {info.current.toLocaleString("pt-BR")} de {formatLimit(info.limit)}
                </strong>{" "}
                {subjectLabel} disponíveis no plano{" "}
                <strong className="text-slate-900">{info.planDisplayName}</strong>.
              </DialogDescription>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Cards comparativos */}
          <div className="grid sm:grid-cols-2 gap-3">
            {/* Plano atual */}
            <div className="bg-white rounded-xl border border-slate-200 p-4" data-testid="card-current-plan">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                Plano atual
              </div>
              <div className="text-lg font-bold text-slate-900 mb-1">
                {currentPlan?.displayName ?? info.planDisplayName}
              </div>
              <div className="text-sm text-slate-500 mb-3">
                {currentPlan ? `${formatBRL(currentPlan.price)}/mês` : "—"}
              </div>
              <div className="flex items-center gap-2 text-sm text-rose-600">
                <X className="w-4 h-4 shrink-0" />
                <span>
                  Até {formatLimit(info.limit)} {subjectLabel}
                </span>
              </div>
            </div>

            {/* Plano alvo */}
            {info.requiredPlan && targetBadge ? (
              <div
                className={`rounded-xl border-2 p-4 relative ${targetBadge.gradient}`}
                data-testid="card-required-plan"
              >
                <div className="absolute -top-2.5 left-4 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-wider">
                  Recomendado
                </div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                  Plano necessário
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <TargetIcon className={`w-5 h-5 ${targetBadge.color}`} />
                  <span className="text-lg font-bold text-slate-900">
                    {info.requiredPlan.displayName}
                  </span>
                </div>
                <div className="text-sm text-slate-600 mb-3">
                  <span className="font-bold text-slate-900">
                    {formatBRL(info.requiredPlan.price)}
                  </span>
                  <span>/mês</span>
                  {priceDiff !== null && priceDiff > 0 && (
                    <span className="ml-1 text-xs text-emerald-700 font-semibold">
                      (+ {formatBRL(priceDiff)} vs atual)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-emerald-700 font-semibold">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>
                    {info.requiredPlan.limit == null
                      ? `${meta.subjectPlural[0].toUpperCase()}${meta.subjectPlural.slice(1)} ilimitados`
                      : `Até ${formatLimit(info.requiredPlan.limit)} ${subjectLabel}`}
                  </span>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-dashed border-slate-200 p-4 flex flex-col items-start justify-center text-sm">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                  Sem upgrade automático
                </div>
                <div className="text-slate-600">
                  Nenhum plano superior tem capacidade extra para esse recurso.
                  Entre em contato com o suporte.
                </div>
              </div>
            )}
          </div>

          {/* Barra de uso */}
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2">
              <span>Uso do plano atual</span>
              <span data-testid="text-usage">
                {info.current.toLocaleString("pt-BR")} / {formatLimit(info.limit)}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-rose-400 to-rose-500 w-full" />
            </div>
            {targetPlanFromList && info.requiredPlan && info.requiredPlan.limit != null && (
              <div className="mt-2.5 text-[11px] text-slate-500">
                Com o {targetPlanFromList.displayName} você pode cadastrar{" "}
                <strong className="text-emerald-700">
                  +{(info.requiredPlan.limit - info.limit).toLocaleString("pt-BR")} {subjectLabel}
                </strong>
                .
              </div>
            )}
            {info.requiredPlan && info.requiredPlan.limit == null && (
              <div className="mt-2.5 text-[11px] text-slate-500">
                Com o {info.requiredPlan.displayName} você passa a ter{" "}
                <strong className="text-emerald-700">{meta.subjectPlural} ilimitados</strong>.
              </div>
            )}
          </div>
        </div>

        {/* CTAs */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row gap-3 sm:justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            data-testid="button-dismiss-limit"
          >
            Agora não
          </button>
          <button
            onClick={() => {
              onClose();
              setLocation("/configuracoes#plano");
            }}
            className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 text-white text-sm font-bold hover:from-violet-700 hover:to-purple-700 transition-all shadow-sm hover:shadow-md inline-flex items-center justify-center gap-2"
            data-testid="button-upgrade-from-limit"
          >
            {info.requiredPlan
              ? `Atualizar para ${info.requiredPlan.displayName}`
              : "Ver planos"}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
