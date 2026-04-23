import { describe, it, expect } from "vitest";
import {
  newSubscriptionFormSchema,
  newSubscriptionFormDefaults,
  buildNewSubscriptionPayload,
  subscriptionFormSchema,
  subscriptionFormDefaults,
  buildSubscriptionPayload,
} from "../subscription.schema";

describe("newSubscriptionFormSchema", () => {
  const valid = {
    ...newSubscriptionFormDefaults,
    clinicId: "3",
    planId: "2",
  };

  it("aceita assinatura nova válida", () => {
    expect(newSubscriptionFormSchema.safeParse(valid).success).toBe(true);
  });

  it("exige clinicId e planId numéricos > 0", () => {
    expect(
      newSubscriptionFormSchema.safeParse({ ...valid, clinicId: "" }).success,
    ).toBe(false);
    expect(
      newSubscriptionFormSchema.safeParse({ ...valid, planId: "abc" }).success,
    ).toBe(false);
  });

  it("aceita amount vazio (usa fallback do plano)", () => {
    expect(
      newSubscriptionFormSchema.safeParse({ ...valid, amount: "" }).success,
    ).toBe(true);
  });
});

describe("buildNewSubscriptionPayload", () => {
  const parsed = newSubscriptionFormSchema.parse({
    ...newSubscriptionFormDefaults,
    clinicId: "3",
    planId: "2",
  });

  it("usa amount informado quando presente", () => {
    const payload = buildNewSubscriptionPayload({ ...parsed, amount: "120" }, 99);
    expect(payload.amount).toBe(120);
  });

  it("cai no fallbackPlanPrice quando amount vazio", () => {
    const payload = buildNewSubscriptionPayload(parsed, 99);
    expect(payload.amount).toBe(99);
  });

  it("retorna amount undefined sem fallback", () => {
    const payload = buildNewSubscriptionPayload(parsed);
    expect(payload.amount).toBeUndefined();
  });
});

describe("subscriptionFormSchema (edit)", () => {
  it("rejeita período com fim antes do início", () => {
    const r = subscriptionFormSchema.safeParse({
      ...subscriptionFormDefaults,
      currentPeriodStart: "2026-05-01",
      currentPeriodEnd: "2026-04-15",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].path).toEqual(["currentPeriodEnd"]);
    }
  });

  it("aceita quando apenas um dos dois lados do período é informado", () => {
    expect(
      subscriptionFormSchema.safeParse({
        ...subscriptionFormDefaults,
        currentPeriodStart: "2026-05-01",
      }).success,
    ).toBe(true);
  });
});

describe("buildSubscriptionPayload", () => {
  it("converte campos preenchidos e omite os vazios", () => {
    const parsed = subscriptionFormSchema.parse({
      ...subscriptionFormDefaults,
      planId: "4",
      amount: "250",
      currentPeriodStart: "2026-05-01",
    });
    const payload = buildSubscriptionPayload(parsed);
    expect(payload.planId).toBe(4);
    expect(payload.amount).toBe(250);
    expect(payload.currentPeriodStart).toBe("2026-05-01");
    expect(payload.currentPeriodEnd).toBeUndefined();
    expect(payload.notes).toBeUndefined();
  });
});
