import { describe, it, expect } from "vitest";
import {
  PLAN_TIERS,
  PLAN_FEATURES,
  isPlanTier,
  planHasFeature,
  resolveFeatures,
} from "./plan-features.js";

describe("plan-features catalog", () => {
  it("declares the three canonical tiers", () => {
    expect(PLAN_TIERS).toEqual(["essencial", "profissional", "premium"]);
  });

  it("is strictly inclusive (essencial ⊆ profissional ⊆ premium)", () => {
    const ess = new Set(PLAN_FEATURES.essencial);
    const pro = new Set(PLAN_FEATURES.profissional);
    const prem = new Set(PLAN_FEATURES.premium);

    for (const f of ess) expect(pro.has(f)).toBe(true);
    for (const f of pro) expect(prem.has(f)).toBe(true);
  });
});

describe("isPlanTier", () => {
  it("accepts the three valid tiers", () => {
    expect(isPlanTier("essencial")).toBe(true);
    expect(isPlanTier("profissional")).toBe(true);
    expect(isPlanTier("premium")).toBe(true);
  });

  it("rejects unknown / null / undefined", () => {
    expect(isPlanTier(null)).toBe(false);
    expect(isPlanTier(undefined)).toBe(false);
    expect(isPlanTier("")).toBe(false);
    expect(isPlanTier("enterprise")).toBe(false);
    expect(isPlanTier("ESSENCIAL")).toBe(false);
  });
});

describe("planHasFeature", () => {
  it("returns true for features included in the plan", () => {
    expect(planHasFeature("essencial", "module.patients")).toBe(true);
    expect(planHasFeature("profissional", "module.patient_subscriptions")).toBe(true);
    expect(planHasFeature("premium", "module.multi_clinic")).toBe(true);
  });

  it("returns false for features above the plan tier", () => {
    expect(planHasFeature("essencial", "module.patient_subscriptions")).toBe(false);
    expect(planHasFeature("essencial", "module.audit_log")).toBe(false);
    expect(planHasFeature("profissional", "module.multi_clinic")).toBe(false);
    expect(planHasFeature("profissional", "module.whitelabel")).toBe(false);
  });

  it("treats unknown / null plan as essencial (fail-safe restrictive)", () => {
    expect(planHasFeature(null, "module.patients")).toBe(true);
    expect(planHasFeature(undefined, "module.patients")).toBe(true);
    expect(planHasFeature("foo", "module.patients")).toBe(true);
    expect(planHasFeature(null, "module.patient_subscriptions")).toBe(false);
    expect(planHasFeature("foo", "module.multi_clinic")).toBe(false);
  });
});

describe("resolveFeatures", () => {
  it("returns the full set of features for the tier", () => {
    const prem = resolveFeatures("premium");
    expect(prem.has("module.patients")).toBe(true);
    expect(prem.has("module.multi_clinic")).toBe(true);
    expect(prem.has("module.whitelabel")).toBe(true);
  });

  it("falls back to essencial for unknown plan", () => {
    const fallback = resolveFeatures("ghost-plan");
    expect(fallback.has("module.patients")).toBe(true);
    expect(fallback.has("module.patient_subscriptions")).toBe(false);
  });
});
