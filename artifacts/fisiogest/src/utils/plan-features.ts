/**
 * Re-exporta de @workspace/shared-constants para manter compatibilidade
 * com imports existentes de "@/utils/plan-features".
 * Fonte da verdade: lib/shared-constants/src/plan-features.ts
 */
export {
  PLAN_TIERS,
  FEATURES,
  PLAN_FEATURES,
  isPlanTier,
  planHasFeature,
  type PlanTier,
  type Feature,
} from "@workspace/shared-constants";
