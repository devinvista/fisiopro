/**
 * Re-exporta de @workspace/shared-constants para manter compatibilidade
 * com imports existentes de "@workspace/db".
 * Fonte da verdade: lib/shared-constants/src/plan-features.ts
 */
export {
  PLAN_TIERS,
  FEATURES,
  PLAN_FEATURES,
  FEATURE_CATALOG,
  isPlanTier,
  planHasFeature,
  resolveFeatures,
  resolvePlanFeatures,
  extractCanonicalFeatures,
  planUsesCustomFeatures,
} from "@workspace/shared-constants";

export type {
  PlanTier,
  Feature,
  FeatureCategory,
  FeatureMeta,
} from "@workspace/shared-constants";
