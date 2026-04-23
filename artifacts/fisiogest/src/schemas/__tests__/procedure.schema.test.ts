import { describe, it, expect } from "vitest";
import {
  procedureFormSchema,
  procedureFormDefaults,
  buildProcedurePayload,
  procedureCostFormSchema,
  procedureCostFormDefaults,
  buildProcedureCostPayload,
} from "../procedure.schema";

const valid = {
  ...procedureFormDefaults,
  name: "Pilates Solo",
  price: "120",
};

describe("procedureFormSchema", () => {
  it("aceita procedimento individual válido", () => {
    expect(procedureFormSchema.safeParse(valid).success).toBe(true);
  });

  it("rejeita nome vazio", () => {
    expect(procedureFormSchema.safeParse({ ...valid, name: "  " }).success).toBe(false);
  });

  it("rejeita preço vazio ou zero", () => {
    expect(procedureFormSchema.safeParse({ ...valid, price: "" }).success).toBe(false);
    expect(procedureFormSchema.safeParse({ ...valid, price: "0" }).success).toBe(false);
  });

  it("rejeita duração fora do intervalo", () => {
    expect(
      procedureFormSchema.safeParse({ ...valid, durationMinutes: 4 }).success,
    ).toBe(false);
    expect(
      procedureFormSchema.safeParse({ ...valid, durationMinutes: 500 }).success,
    ).toBe(false);
  });

  it("modalidade grupo exige capacidade >= 2", () => {
    const r = procedureFormSchema.safeParse({
      ...valid,
      modalidade: "grupo",
      maxCapacity: 1,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].path).toEqual(["maxCapacity"]);
    }
    expect(
      procedureFormSchema.safeParse({
        ...valid,
        modalidade: "grupo",
        maxCapacity: 4,
      }).success,
    ).toBe(true);
  });

  it("modalidade individual aceita capacidade 1", () => {
    expect(
      procedureFormSchema.safeParse({
        ...valid,
        modalidade: "individual",
        maxCapacity: 1,
      }).success,
    ).toBe(true);
  });
});

describe("buildProcedurePayload", () => {
  it("preserva strings de preço/custo (backend converte)", () => {
    const payload = buildProcedurePayload({ ...valid, price: "120", cost: "30" });
    expect(payload.price).toBe("120");
    expect(payload.cost).toBe("30");
    expect(payload.name).toBe("Pilates Solo");
  });
});

describe("procedureCostFormSchema", () => {
  it("aceita campos vazios", () => {
    expect(procedureCostFormSchema.safeParse(procedureCostFormDefaults).success).toBe(
      true,
    );
  });

  it("rejeita valores não numéricos", () => {
    expect(
      procedureCostFormSchema.safeParse({
        ...procedureCostFormDefaults,
        priceOverride: "abc",
      }).success,
    ).toBe(false);
  });
});

describe("buildProcedureCostPayload", () => {
  it("converte vazios em null/0 e preenchidos em number", () => {
    const payload = buildProcedureCostPayload({
      priceOverride: "150",
      variableCost: "25",
      notes: "obs",
    });
    expect(payload.priceOverride).toBe(150);
    expect(payload.variableCost).toBe(25);
    expect(payload.fixedCost).toBe(0);
    expect(payload.notes).toBe("obs");
  });

  it("retorna null/0/null quando tudo vazio", () => {
    const payload = buildProcedureCostPayload(procedureCostFormDefaults);
    expect(payload.priceOverride).toBeNull();
    expect(payload.variableCost).toBe(0);
    expect(payload.notes).toBeNull();
  });
});
