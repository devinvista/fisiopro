import type { Feature, PlanTier } from "@/utils/plan-features";
import { PLAN_FEATURES } from "@/utils/plan-features";

interface PlanBadgeProps {
  feature: Feature;
  className?: string;
}

const TIER_LABEL: Record<PlanTier, string> = {
  essencial: "Essencial",
  profissional: "Pro",
  premium: "Premium",
};

const TIER_STYLES: Record<PlanTier, string> = {
  essencial: "bg-slate-200 text-slate-700",
  profissional: "bg-blue-100 text-blue-700",
  premium: "bg-amber-100 text-amber-800",
};

/**
 * Determina o menor plano que inclui a feature e renderiza um badge.
 * Útil para sinalizar visualmente que um item de menu/botão exige upgrade.
 */
export function PlanBadge({ feature, className = "" }: PlanBadgeProps) {
  const tier: PlanTier =
    (Object.entries(PLAN_FEATURES).find(([, feats]) => feats.includes(feature))?.[0] as PlanTier) ??
    "premium";

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${TIER_STYLES[tier]} ${className}`}
    >
      {TIER_LABEL[tier]}
    </span>
  );
}
