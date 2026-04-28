/**
 * Sprint 3 — testes unitários dos helpers puros do gerador lazy.
 *
 * O efeito completo (`runMonthlyPlanBilling`) toca várias tabelas via
 * Drizzle e é validado por integração no smoke da workflow. Aqui cobrimos
 * a lógica de tempo (`isMonthDue`, `iterMonths`) que decide quando uma
 * fatura mensal pode ser gerada.
 */
import { describe, it, expect } from "vitest";
import {
  isMonthDue,
  iterMonths,
} from "./monthly-plan-billing.service.js";

describe("isMonthDue", () => {
  const today = { year: 2026, month: 4, day: 5 };

  it("mês passado sempre é devido (gap-fill)", () => {
    expect(isMonthDue(2025, 12, today, 10, 5)).toBe(true);
    expect(isMonthDue(2026, 1, today, 28, 5)).toBe(true);
    expect(isMonthDue(2026, 3, today, 1, 5)).toBe(true);
  });

  it("mês futuro nunca é devido", () => {
    expect(isMonthDue(2026, 5, today, 10, 5)).toBe(false);
    expect(isMonthDue(2027, 1, today, 1, 5)).toBe(false);
  });

  it("mês corrente: aguarda chegar a D-tolerance do billingDay", () => {
    // billingDay=10, tol=5 → janela abre em 5
    expect(isMonthDue(2026, 4, { ...today, day: 4 }, 10, 5)).toBe(false);
    expect(isMonthDue(2026, 4, { ...today, day: 5 }, 10, 5)).toBe(true);
    expect(isMonthDue(2026, 4, { ...today, day: 10 }, 10, 5)).toBe(true);
    expect(isMonthDue(2026, 4, { ...today, day: 28 }, 10, 5)).toBe(true);
  });

  it("billingDay no início do mês: limite mínimo é o dia 1", () => {
    // billingDay=3, tol=5 → 3-5 = -2, mas threshold ≥ 1
    expect(isMonthDue(2026, 4, { ...today, day: 1 }, 3, 5)).toBe(true);
  });

  it("billingDay 31 em fevereiro: clampa para o último dia (28)", () => {
    const fevToday = { year: 2026, month: 2, day: 23 };
    // effectiveBilling = 28; threshold = 28 - 5 = 23
    expect(isMonthDue(2026, 2, { ...fevToday, day: 22 }, 31, 5)).toBe(false);
    expect(isMonthDue(2026, 2, { ...fevToday, day: 23 }, 31, 5)).toBe(true);
  });

  it("billingDay 31 em janeiro: usa 31 (mês comporta)", () => {
    const janToday = { year: 2026, month: 1, day: 26 };
    expect(isMonthDue(2026, 1, { ...janToday, day: 25 }, 31, 5)).toBe(false);
    expect(isMonthDue(2026, 1, { ...janToday, day: 26 }, 31, 5)).toBe(true);
  });

  it("toleranceDays=0: só gera no próprio billingDay", () => {
    expect(isMonthDue(2026, 4, { ...today, day: 9 }, 10, 0)).toBe(false);
    expect(isMonthDue(2026, 4, { ...today, day: 10 }, 10, 0)).toBe(true);
  });
});

describe("iterMonths", () => {
  function collect(yS: number, mS: number, yE: number, mE: number): string[] {
    return Array.from(iterMonths(yS, mS, yE, mE)).map((x) => x.ref);
  }

  it("mesmo mês: retorna apenas 1 entrada", () => {
    expect(collect(2026, 4, 2026, 4)).toEqual(["2026-04-01"]);
  });

  it("vários meses no mesmo ano", () => {
    expect(collect(2026, 1, 2026, 4)).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
    ]);
  });

  it("vira o ano corretamente", () => {
    expect(collect(2025, 11, 2026, 2)).toEqual([
      "2025-11-01",
      "2025-12-01",
      "2026-01-01",
      "2026-02-01",
    ]);
  });

  it("intervalo invertido: não retorna nada", () => {
    expect(collect(2026, 5, 2026, 3)).toEqual([]);
  });

  it("range longo: cobre 13 meses", () => {
    const r = collect(2025, 4, 2026, 4);
    expect(r.length).toBe(13);
    expect(r[0]).toBe("2025-04-01");
    expect(r[12]).toBe("2026-04-01");
  });
});
