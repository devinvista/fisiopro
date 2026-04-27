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

  // ─── Financeiro (Sprint 2) ────────────────────────────────────────────────
  // "Caixa simples": entradas/saídas básicas. Disponível em todos os planos.
  "financial.view.simple",
  // Fluxo de Caixa Projetado (próximos 30/60/90 dias).
  "financial.view.cash_flow",
  // DRE — Demonstração do Resultado do Exercício.
  "financial.view.dre",
  // Orçado vs Realizado (requer configuração de metas/orçamentos por categoria).
  "financial.view.budget",
  // Plano de contas contábil completo (5 níveis, partidas dobradas).
  "financial.view.accounting",
  // Análise de custo por procedimento (margem unitária, ponto de equilíbrio).
  "financial.cost_per_procedure",
] as const;

export type Feature = (typeof FEATURES)[number];

const ESSENCIAL: Feature[] = [
  "module.patients",
  "module.appointments",
  "module.medical_records",
  "module.financial",
  "module.reports.basic",
  // Financeiro: visão simplificada (caixa entrada/saída) já no plano básico.
  "financial.view.simple",
];

const PROFISSIONAL: Feature[] = [
  ...ESSENCIAL,
  "module.reports.advanced",
  "module.patient_subscriptions",
  "module.patient_packages",
  "module.recurring_expenses",
  "module.audit_log",
  "module.priority_support",
  // Financeiro avançado: fluxo projetado, DRE, orçado vs realizado, custo por procedimento.
  "financial.view.cash_flow",
  "financial.view.dre",
  "financial.view.budget",
  "financial.cost_per_procedure",
];

const PREMIUM: Feature[] = [
  ...PROFISSIONAL,
  "module.multi_clinic",
  "module.api_integration",
  "module.whitelabel",
  "module.dedicated_support",
  // Financeiro premium: contabilidade completa com plano de contas.
  "financial.view.accounting",
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
