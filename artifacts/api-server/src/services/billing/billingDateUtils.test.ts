import { describe, it, expect } from "vitest";
import {
  calcNextBillingDate,
  effectiveBillingDay,
  isWithinBillingWindow,
} from "./billingDateUtils.js";

describe("effectiveBillingDay", () => {
  it("retorna o próprio billingDay quando o mês comporta", () => {
    expect(effectiveBillingDay(15, 2025, 3)).toBe(15);
    expect(effectiveBillingDay(1, 2025, 3)).toBe(1);
    expect(effectiveBillingDay(28, 2025, 2)).toBe(28);
  });

  it("clampa para o último dia em meses curtos", () => {
    expect(effectiveBillingDay(31, 2025, 2)).toBe(28); // fev não-bissexto
    expect(effectiveBillingDay(31, 2024, 2)).toBe(29); // fev bissexto
    expect(effectiveBillingDay(31, 2025, 4)).toBe(30); // abril
    expect(effectiveBillingDay(30, 2025, 2)).toBe(28);
    expect(effectiveBillingDay(29, 2025, 2)).toBe(28);
    expect(effectiveBillingDay(29, 2024, 2)).toBe(29); // bissexto comporta 29
  });

  it("aceita billingDay 31 em meses de 31 dias", () => {
    expect(effectiveBillingDay(31, 2025, 1)).toBe(31);
    expect(effectiveBillingDay(31, 2025, 12)).toBe(31);
  });
});

describe("calcNextBillingDate", () => {
  it("avança para o próximo mês mantendo o billingDay", () => {
    expect(calcNextBillingDate(15, 2025, 3)).toBe("2025-04-15");
    expect(calcNextBillingDate(1, 2025, 6)).toBe("2025-07-01");
  });

  it("vira o ano em dezembro", () => {
    expect(calcNextBillingDate(10, 2025, 12)).toBe("2026-01-10");
    expect(calcNextBillingDate(31, 2025, 12)).toBe("2026-01-31");
  });

  it("clampa billingDay 31 quando o próximo mês não tem 31 dias", () => {
    // janeiro (31) → fevereiro: clampa para o último dia
    expect(calcNextBillingDate(31, 2025, 1)).toBe("2025-02-28");
    expect(calcNextBillingDate(31, 2024, 1)).toBe("2024-02-29");
    // março (31) → abril (30)
    expect(calcNextBillingDate(31, 2025, 3)).toBe("2025-04-30");
  });

  it("zero-pads mês e dia", () => {
    expect(calcNextBillingDate(5, 2025, 1)).toBe("2025-02-05");
    expect(calcNextBillingDate(9, 2025, 8)).toBe("2025-09-09");
  });
});

describe("isWithinBillingWindow", () => {
  it("retorna true exatamente no billingDay", () => {
    expect(
      isWithinBillingWindow(15, { year: 2025, month: 3, day: 15 }),
    ).toBe(true);
  });

  it("retorna true dentro da tolerância padrão (3 dias)", () => {
    expect(
      isWithinBillingWindow(15, { year: 2025, month: 3, day: 16 }),
    ).toBe(true);
    expect(
      isWithinBillingWindow(15, { year: 2025, month: 3, day: 18 }),
    ).toBe(true);
  });

  it("retorna false antes do billingDay", () => {
    expect(
      isWithinBillingWindow(15, { year: 2025, month: 3, day: 14 }),
    ).toBe(false);
    expect(
      isWithinBillingWindow(15, { year: 2025, month: 3, day: 1 }),
    ).toBe(false);
  });

  it("retorna false fora da tolerância", () => {
    expect(
      isWithinBillingWindow(15, { year: 2025, month: 3, day: 19 }),
    ).toBe(false);
  });

  it("respeita tolerância customizada", () => {
    expect(
      isWithinBillingWindow(15, { year: 2025, month: 3, day: 20 }, 5),
    ).toBe(true);
    expect(
      isWithinBillingWindow(15, { year: 2025, month: 3, day: 21 }, 5),
    ).toBe(false);
    expect(
      isWithinBillingWindow(15, { year: 2025, month: 3, day: 16 }, 0),
    ).toBe(false);
  });

  it("clampa billingDay para o último dia em meses curtos", () => {
    // billingDay 31 em fevereiro 2025 (28 dias) → janela 28..31
    expect(
      isWithinBillingWindow(31, { year: 2025, month: 2, day: 28 }),
    ).toBe(true);
    expect(
      isWithinBillingWindow(31, { year: 2025, month: 2, day: 27 }),
    ).toBe(false);
  });

  it("nunca avança a janela para o mês seguinte", () => {
    // billingDay 28 em fevereiro: janela vai até 28+3=31, mas fev só tem
    // 28 dias — a função NÃO compara com o próximo mês.
    // Em 1º de março, o caller chama com {month: 3} — então retorna false.
    expect(
      isWithinBillingWindow(28, { year: 2025, month: 3, day: 1 }),
    ).toBe(false);
  });
});
