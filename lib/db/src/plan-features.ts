/**
 * Catálogo de features SaaS por plano.
 *
 * - PLAN_TIERS: nomes canônicos dos planos (espelham `subscription_plans.name`).
 * - FEATURES: chaves de feature usadas no backend e no frontend para liberar
 *   módulos/recursos. Devem ser estáveis — alterar uma chave aqui implica
 *   atualizar middlewares e componentes que a referenciam.
 * - PLAN_FEATURES: matriz declarativa de quais features cada plano possui.
 *
 * Use `planHasFeature(planName, feature)` em vez de checar manualmente.
 *
 * Para liberar uma nova feature em um plano, basta adicioná-la ao array do
 * plano correspondente.
 */

export const PLAN_TIERS = ["essencial", "profissional", "premium"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export const FEATURES = [
  // Módulos clínicos (todos os planos)
  "module.patients",
  "module.appointments",
  "module.medical_records",
  "module.financial",
  "module.reports.basic",

  // Profissional+
  "module.reports.advanced",
  "module.patient_subscriptions",
  "module.patient_packages",
  "module.recurring_expenses",
  "module.audit_log",
  "module.priority_support",

  // Premium
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

/**
 * Retorna true se o plano informado possui a feature.
 * - Plano desconhecido → trata como `essencial` (fail-safe restrito).
 * - SuperAdmin deve ser verificado fora desta função.
 */
export function planHasFeature(planName: string | null | undefined, feature: Feature): boolean {
  const tier: PlanTier = isPlanTier(planName) ? planName : "essencial";
  return PLAN_FEATURES[tier].includes(feature);
}

export function resolveFeatures(planName: string | null | undefined): Set<Feature> {
  const tier: PlanTier = isPlanTier(planName) ? planName : "essencial";
  return new Set(PLAN_FEATURES[tier]);
}
