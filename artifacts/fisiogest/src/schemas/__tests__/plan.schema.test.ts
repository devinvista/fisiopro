import { describe, it, expect } from "vitest";
import {
  planFormSchema,
  planFormDefaults,
  buildPlanPayload,
} from "../plan.schema";

const valid = {
  ...planFormDefaults,
  name: "starter",
  displayName: "Starter",
  description: "Plano inicial",
};

describe("planFormSchema", () => {
  it("aceita um plano válido", () => {
    expect(planFormSchema.safeParse(valid).success).toBe(true);
  });

  it("rejeita identificador com maiúsculas ou espaço", () => {
    expect(planFormSchema.safeParse({ ...valid, name: "Starter" }).success).toBe(false);
    expect(planFormSchema.safeParse({ ...valid, name: "star ter" }).success).toBe(false);
  });

  it("rejeita preço inválido", () => {
    expect(planFormSchema.safeParse({ ...valid, price: "abc" }).success).toBe(false);
    expect(planFormSchema.safeParse({ ...valid, price: "" }).success).toBe(false);
  });

  it("aceita maxProfessionals = null (ilimitado)", () => {
    expect(
      planFormSchema.safeParse({ ...valid, maxProfessionals: null }).success,
    ).toBe(true);
  });

  it("rejeita maxProfessionals = 0", () => {
    const r = planFormSchema.safeParse({ ...valid, maxProfessionals: 0 });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].path).toEqual(["maxProfessionals"]);
    }
  });

  it("rejeita trialDays acima de 365", () => {
    expect(planFormSchema.safeParse({ ...valid, trialDays: 400 }).success).toBe(false);
  });
});

describe("buildPlanPayload", () => {
  it("converte preço em number e processa features", () => {
    const payload = buildPlanPayload(
      { ...valid, price: "99.90" },
      "Feature 1\n  Feature 2 \n\n  ",
    );
    expect(payload.price).toBe(99.9);
    expect(payload.features).toEqual(["Feature 1", "Feature 2"]);
  });
});
