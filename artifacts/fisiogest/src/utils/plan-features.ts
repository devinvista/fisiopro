/**
 * Re-exporta de @workspace/shared-constants para manter compatibilidade
 * com imports existentes de "@/utils/plan-features".
 * Fonte da verdade: lib/shared-constants/src/plan-features.ts
 */
export {
  PLAN_TIERS,
  FEATURES,
  PLAN_FEATURES,
  FEATURE_CATALOG,
  isPlanTier,
  planHasFeature,
  resolvePlanFeatures,
  extractCanonicalFeatures,
  planUsesCustomFeatures,
  getMinimumPlanForFeature,
  type PlanTier,
  type Feature,
  type FeatureCategory,
  type FeatureMeta,
} from "@workspace/shared-constants";
