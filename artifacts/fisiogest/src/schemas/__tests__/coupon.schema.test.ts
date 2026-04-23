import { describe, it, expect } from "vitest";
import {
  couponFormSchema,
  couponFormDefaults,
  buildCouponPayload,
} from "../coupon.schema";

const valid = {
  ...couponFormDefaults,
  code: "PROMO10",
  description: "Promoção de lançamento",
  discountValue: "10",
};

describe("couponFormSchema", () => {
  it("aceita um cupom de desconto válido", () => {
    expect(couponFormSchema.safeParse(valid).success).toBe(true);
  });

  it("rejeita código com caracteres inválidos", () => {
    const r = couponFormSchema.safeParse({ ...valid, code: "PROMO 10" });
    expect(r.success).toBe(false);
  });

  it("rejeita desconto percentual acima de 100%", () => {
    const r = couponFormSchema.safeParse({
      ...valid,
      discountType: "percent",
      discountValue: "150",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].path).toEqual(["discountValue"]);
    }
  });

  it("aceita desconto fixo acima de 100", () => {
    const r = couponFormSchema.safeParse({
      ...valid,
      discountType: "fixed",
      discountValue: "200",
    });
    expect(r.success).toBe(true);
  });

  it("exige clínica indicadora para cupom do tipo referral", () => {
    const r = couponFormSchema.safeParse({
      ...valid,
      type: "referral",
      referrerClinicId: "",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].path).toEqual(["referrerClinicId"]);
    }
  });

  it("exige valor de benefício quando referral define tipo de benefício", () => {
    const r = couponFormSchema.safeParse({
      ...valid,
      type: "referral",
      referrerClinicId: "5",
      referrerBenefitType: "percent",
      referrerBenefitValue: "",
    });
    expect(r.success).toBe(false);
  });
});

describe("buildCouponPayload", () => {
  it("uppercase no código e converte numéricos", () => {
    const payload = buildCouponPayload({
      ...valid,
      code: "promo10",
      discountValue: "15",
      maxUses: "100",
      minPlanAmount: "50",
    });
    expect(payload.code).toBe("PROMO10");
    expect(payload.discountValue).toBe(15);
    expect(payload.maxUses).toBe(100);
    expect(payload.minPlanAmount).toBe(50);
  });

  it("converte campos vazios em null", () => {
    const payload = buildCouponPayload(valid);
    expect(payload.maxUses).toBeNull();
    expect(payload.expiresAt).toBeNull();
    expect(payload.minPlanAmount).toBeNull();
    expect(payload.applicablePlanNames).toBeNull();
  });
});
