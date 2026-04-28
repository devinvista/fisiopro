import { describe, it, expect } from "vitest";
import {
  packageFormSchema,
  packageFormDefaults,
  buildPackagePayload,
} from "../package.schema";

const validSessoes = {
  ...packageFormDefaults,
  name: "Pacote 8 sessões",
  procedureId: "3",
  packageType: "sessoes" as const,
  price: "640",
};

const validMensal = {
  ...packageFormDefaults,
  name: "Plano mensal",
  procedureId: "3",
  packageType: "mensal" as const,
  monthlyPrice: "320",
};

describe("packageFormSchema", () => {
  it("aceita pacote por sessões válido", () => {
    expect(packageFormSchema.safeParse(validSessoes).success).toBe(true);
  });

  it("aceita pacote mensal válido", () => {
    expect(packageFormSchema.safeParse(validMensal).success).toBe(true);
  });

  it("rejeita o tipo legado faturaConsolidada (descontinuado em Sprint 5)", () => {
    expect(
      packageFormSchema.safeParse({
        ...validMensal,
        // @ts-expect-error — valor legado removido do union
        packageType: "faturaConsolidada",
      }).success,
    ).toBe(false);
  });

  it("exige price em pacote por sessões", () => {
    const r = packageFormSchema.safeParse({ ...validSessoes, price: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].path).toEqual(["price"]);
    }
  });

  it("exige monthlyPrice em pacote mensal", () => {
    const r = packageFormSchema.safeParse({ ...validMensal, monthlyPrice: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].path).toEqual(["monthlyPrice"]);
    }
  });

  it("exige procedureId numérico", () => {
    expect(
      packageFormSchema.safeParse({ ...validSessoes, procedureId: "" }).success,
    ).toBe(false);
    expect(
      packageFormSchema.safeParse({ ...validSessoes, procedureId: "abc" }).success,
    ).toBe(false);
  });

  it("rejeita sessionsPerWeek fora do intervalo 1-7", () => {
    expect(
      packageFormSchema.safeParse({ ...validSessoes, sessionsPerWeek: 0 }).success,
    ).toBe(false);
    expect(
      packageFormSchema.safeParse({ ...validSessoes, sessionsPerWeek: 8 }).success,
    ).toBe(false);
  });

  it("rejeita billingDay fora do intervalo 1-31", () => {
    expect(
      packageFormSchema.safeParse({ ...validMensal, billingDay: 0 }).success,
    ).toBe(false);
    expect(
      packageFormSchema.safeParse({ ...validMensal, billingDay: 32 }).success,
    ).toBe(false);
  });
});

describe("buildPackagePayload", () => {
  it("pacote por sessões: zera campos mensais", () => {
    const payload = buildPackagePayload(validSessoes);
    expect(payload.totalSessions).toBe(8);
    expect(payload.price).toBe(640);
    expect(payload.monthlyPrice).toBeNull();
    expect(payload.billingDay).toBeNull();
    expect(payload.absenceCreditLimit).toBe(0);
  });

  it("pacote mensal: zera campos de sessões e usa monthlyPrice em price", () => {
    const payload = buildPackagePayload(validMensal);
    expect(payload.totalSessions).toBeNull();
    expect(payload.validityDays).toBeNull();
    expect(payload.price).toBe(320);
    expect(payload.monthlyPrice).toBe(320);
    expect(payload.billingDay).toBe(5);
  });

  it("description vazia vira null", () => {
    const payload = buildPackagePayload({ ...validSessoes, description: "" });
    expect(payload.description).toBeNull();
  });
});
