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

/**
 * Catálogo enriquecido para UIs de configuração (Matriz de Features no
 * superadmin). Contém metadados (label PT-BR, descrição, categoria) usados
 * para agrupar/explicar cada feature.
 */
export type FeatureCategory =
  | "core" // módulos básicos disponíveis em todos os planos
  | "modules" // módulos avançados (profissional+)
  | "premium" // recursos premium
  | "financial"; // família financeiro/contabilidade

export interface FeatureMeta {
  key: Feature;
  label: string;
  description: string;
  category: FeatureCategory;
}

export const FEATURE_CATALOG: readonly FeatureMeta[] = [
  // ─── Core (todos os planos) ─────────────────────────────────────────────────
  { key: "module.patients",        category: "core",      label: "Pacientes",                description: "Cadastro e gestão de prontuário de pacientes." },
  { key: "module.appointments",    category: "core",      label: "Agendamentos",             description: "Agenda multiprofissional com confirmações." },
  { key: "module.medical_records", category: "core",      label: "Prontuário eletrônico",    description: "Evoluções, atestados, laudos e anamnese." },
  { key: "module.financial",       category: "core",      label: "Financeiro",               description: "Lançamentos, contas a pagar/receber, fluxo de caixa." },
  { key: "module.reports.basic",   category: "core",      label: "Relatórios básicos",       description: "Resumos diários, mensais e por profissional." },

  // ─── Módulos avançados (profissional+) ─────────────────────────────────────
  { key: "module.reports.advanced",      category: "modules", label: "Relatórios avançados",        description: "Análises customizáveis, exportação CSV/Excel." },
  { key: "module.patient_subscriptions", category: "modules", label: "Assinaturas de pacientes",    description: "Cobrança recorrente mensal por paciente." },
  { key: "module.patient_packages",      category: "modules", label: "Pacotes de sessões",          description: "Venda antecipada de sessões e créditos." },
  { key: "module.recurring_expenses",    category: "modules", label: "Despesas recorrentes",        description: "Lançamentos automáticos de aluguel, contas etc." },
  { key: "module.audit_log",             category: "modules", label: "Log de auditoria",            description: "Rastreio de ações sensíveis (LGPD)." },
  { key: "module.priority_support",      category: "modules", label: "Suporte prioritário",         description: "Atendimento via WhatsApp em horário comercial." },

  // ─── Premium ───────────────────────────────────────────────────────────────
  { key: "module.multi_clinic",       category: "premium", label: "Multi-clínica",       description: "Gestão consolidada de várias unidades." },
  { key: "module.api_integration",    category: "premium", label: "API de integração",   description: "API REST para integrar com sistemas externos." },
  { key: "module.whitelabel",         category: "premium", label: "White-label",         description: "Personalização de marca, logo e cores." },
  { key: "module.dedicated_support",  category: "premium", label: "Suporte dedicado",    description: "Gerente de contas e SLA contratual." },

  // ─── Financeiro / Contabilidade ────────────────────────────────────────────
  { key: "financial.view.simple",        category: "financial", label: "Caixa simples",                description: "Entradas e saídas básicas (todos os planos)." },
  { key: "financial.view.cash_flow",     category: "financial", label: "Fluxo de caixa projetado",     description: "Projeção de 30/60/90 dias." },
  { key: "financial.view.dre",           category: "financial", label: "DRE",                          description: "Demonstração do Resultado do Exercício." },
  { key: "financial.view.budget",        category: "financial", label: "Orçado vs Realizado",          description: "Metas mensais por categoria." },
  { key: "financial.view.accounting",    category: "financial", label: "Contabilidade completa",       description: "Plano de contas em 5 níveis, partidas dobradas." },
  { key: "financial.cost_per_procedure", category: "financial", label: "Custo por procedimento",       description: "Margem unitária e ponto de equilíbrio." },
];

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

const FEATURE_KEY_SET = new Set<string>(FEATURES);

/**
 * Filtra um array vindo do banco (subscription_plans.features jsonb) e devolve
 * apenas as chaves que pertencem ao catálogo canônico FEATURES.
 *
 * Strings de marketing (ex.: "Agenda completa", "Até 150 pacientes") presentes
 * na mesma coluna jsonb são silenciosamente ignoradas — elas continuam servindo
 * para landing/PlansTab sem interferir nas checagens de acesso.
 */
export function extractCanonicalFeatures(dbFeatures: unknown): Feature[] {
  if (!Array.isArray(dbFeatures)) return [];
  const out: Feature[] = [];
  for (const item of dbFeatures) {
    if (typeof item === "string" && FEATURE_KEY_SET.has(item)) {
      out.push(item as Feature);
    }
  }
  return out;
}

/**
 * Resolve a lista efetiva de features de um plano combinando DB ↔ hardcoded.
 *
 * Regra:
 *   1. Se o plano tem ≥1 chave canônica gravada na coluna jsonb → usa a do DB
 *      (é a "configuração customizada" feita pelo superadmin).
 *   2. Caso contrário → cai no `PLAN_FEATURES[tier]` hardcoded como default
 *      seguro (preserva comportamento anterior à introdução da Matriz).
 *
 * Sempre devolve uma lista deduplicada e sem chaves desconhecidas.
 */
export function resolvePlanFeatures(
  planName: string | null | undefined,
  dbFeatures: unknown,
): Feature[] {
  const fromDb = extractCanonicalFeatures(dbFeatures);
  if (fromDb.length > 0) return Array.from(new Set(fromDb));
  const tier: PlanTier = isPlanTier(planName) ? planName : "essencial";
  return [...PLAN_FEATURES[tier]];
}

/**
 * True se a coluna jsonb do plano contém pelo menos uma chave canônica
 * (ou seja, a configuração via UI sobrescreve o hardcoded).
 */
export function planUsesCustomFeatures(dbFeatures: unknown): boolean {
  return extractCanonicalFeatures(dbFeatures).length > 0;
}

/**
 * Plano mínimo (entre essencial → profissional → premium) que possui a feature.
 *
 * Usa a matriz hardcoded como base. Caso queira considerar customizações por
 * plano feitas via UI, passe `customMatrix` no formato {planName: features[]}.
 *
 * Retorna `null` se nenhum plano contém a feature.
 */
export function getMinimumPlanForFeature(
  feature: Feature,
  customMatrix?: Partial<Record<string, readonly Feature[]>>,
): PlanTier | null {
  for (const tier of PLAN_TIERS) {
    const list = customMatrix?.[tier] ?? PLAN_FEATURES[tier];
    if (list?.includes(feature)) return tier;
  }
  return null;
}
