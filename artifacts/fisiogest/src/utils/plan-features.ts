/**
 * Espelho client-side do catálogo de features SaaS.
 *
 * Mantenha sincronizado com `lib/db/src/plan-features.ts`. Idealmente, a fonte
 * da verdade vem do servidor via `/api/auth/me` (campo `features`), mas este
 * mapa é útil para checagens optimistas (ex: esconder item de menu antes do
 * /me retornar) e para tipagem.
 */

export const PLAN_TIERS = ["essencial", "profissional", "premium"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export const FEATURES = [
  "module.patients",
  "module.appointments",
  "module.medical_records",
  "module.financial",
  "module.reports.basic",
  "module.reports.advanced",
  "module.patient_subscriptions",
  "module.patient_packages",
  "module.recurring_expenses",
  "module.audit_log",
  "module.priority_support",
  "module.multi_clinic",
  "module.api_integration",
  "module.whitelabel",
  "module.dedicated_support",
] as const;

export type Feature = (typeof FEATURES)[number];

const ESSENCIAL: Feature[] = [
  "module.patients",
  "module.appointments",
  "module.medical_records",
  "module.financial",
  "module.reports.basic",
];

const PROFISSIONAL: Feature[] = [
  ...ESSENCIAL,
  "module.reports.advanced",
  "module.patient_subscriptions",
  "module.patient_packages",
  "module.recurring_expenses",
  "module.audit_log",
  "module.priority_support",
];

const PREMIUM: Feature[] = [
  ...PROFISSIONAL,
  "module.multi_clinic",
  "module.api_integration",
  "module.whitelabel",
  "module.dedicated_support",
];

export const PLAN_FEATURES: Record<PlanTier, Feature[]> = {
  essencial: ESSENCIAL,
  profissional: PROFISSIONAL,
  premium: PREMIUM,
};

export function isPlanTier(name: string | null | undefined): name is PlanTier {
  return !!name && (PLAN_TIERS as readonly string[]).includes(name);
}

export function planHasFeature(planName: string | null | undefined, feature: Feature): boolean {
  const tier: PlanTier = isPlanTier(planName) ? planName : "essencial";
  return PLAN_FEATURES[tier].includes(feature);
}
