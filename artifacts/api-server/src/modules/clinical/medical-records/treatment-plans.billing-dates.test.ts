import { describe, it, expect } from "vitest";
import {
  planInstallmentDueDate,
  planMonthRefOf,
  monthOffsetFromStart,
  resolveMonthlyDueDay,
} from "./treatment-plans.billing-dates.js";

describe("planInstallmentDueDate", () => {
  it("primeira parcela cai no mesmo mês quando billingDay >= startDay", () => {
    expect(planInstallmentDueDate("2026-05-01", 10, 0)).toBe("2026-05-10");
    expect(planInstallmentDueDate("2026-05-10", 10, 0)).toBe("2026-05-10");
    expect(planInstallmentDueDate("2026-05-09", 10, 0)).toBe("2026-05-10");
  });

  it("primeira parcela vai pro mês seguinte quando billingDay < startDay", () => {
    // Caso reportado: start 28/04, billingDay 20 → primeira em 20/05
    expect(planInstallmentDueDate("2026-04-28", 20, 0)).toBe("2026-05-20");
    expect(planInstallmentDueDate("2026-05-15", 10, 0)).toBe("2026-06-10");
  });

  it("parcelas seguintes seguem mês a mês a partir da primeira", () => {
    expect(planInstallmentDueDate("2026-05-01", 10, 0)).toBe("2026-05-10");
    expect(planInstallmentDueDate("2026-05-01", 10, 1)).toBe("2026-06-10");
    expect(planInstallmentDueDate("2026-05-01", 10, 2)).toBe("2026-07-10");

    // Quando há shift do primeiro mês, todas as parcelas ficam shiftadas.
    expect(planInstallmentDueDate("2026-05-15", 10, 0)).toBe("2026-06-10");
    expect(planInstallmentDueDate("2026-05-15", 10, 1)).toBe("2026-07-10");
    expect(planInstallmentDueDate("2026-05-15", 10, 2)).toBe("2026-08-10");
  });

  it("clamp para o último dia em meses curtos (ex.: dia 31 em fevereiro)", () => {
    expect(planInstallmentDueDate("2026-01-01", 31, 0)).toBe("2026-01-31");
    expect(planInstallmentDueDate("2026-01-01", 31, 1)).toBe("2026-02-28");
    expect(planInstallmentDueDate("2026-01-01", 31, 2)).toBe("2026-03-31");
    expect(planInstallmentDueDate("2026-01-01", 31, 3)).toBe("2026-04-30");
  });

  it("rola para o ano seguinte quando o offset ultrapassa dezembro", () => {
    expect(planInstallmentDueDate("2026-11-01", 5, 1)).toBe("2026-12-05");
    expect(planInstallmentDueDate("2026-11-01", 5, 2)).toBe("2027-01-05");
    expect(planInstallmentDueDate("2026-12-15", 10, 0)).toBe("2027-01-10");
  });
});

describe("planMonthRefOf", () => {
  it("retorna o 1º dia do mês de competência", () => {
    expect(planMonthRefOf("2026-05-15", 0)).toBe("2026-05-01");
    expect(planMonthRefOf("2026-05-15", 1)).toBe("2026-06-01");
    expect(planMonthRefOf("2026-12-15", 1)).toBe("2027-01-01");
  });
});

describe("monthOffsetFromStart", () => {
  it("calcula offset positivo para meses futuros", () => {
    expect(monthOffsetFromStart("2026-05-01", 2026, 5)).toBe(0);
    expect(monthOffsetFromStart("2026-05-01", 2026, 6)).toBe(1);
    expect(monthOffsetFromStart("2026-05-01", 2027, 5)).toBe(12);
  });

  it("retorna null para meses anteriores ao startDate", () => {
    expect(monthOffsetFromStart("2026-05-01", 2026, 4)).toBeNull();
    expect(monthOffsetFromStart("2026-05-01", 2025, 12)).toBeNull();
  });
});

// ── Sprint Financeiro 9 (P1) — vencimento da mensalidade ───────────────────
describe("resolveMonthlyDueDay", () => {
  it("prioriza o dia escolhido pelo paciente no plano", () => {
    expect(
      resolveMonthlyDueDay({
        planMonthlyDueDay: 5,
        packageBillingDay: 10,
        clinicDefaultDueDays: 15,
      }),
    ).toBe(5);
  });

  it("cai no billingDay do pacote quando plano não definiu", () => {
    expect(
      resolveMonthlyDueDay({
        planMonthlyDueDay: null,
        packageBillingDay: 20,
        clinicDefaultDueDays: 15,
      }),
    ).toBe(20);
    // undefined também é ignorado.
    expect(
      resolveMonthlyDueDay({
        planMonthlyDueDay: undefined,
        packageBillingDay: 20,
      }),
    ).toBe(20);
  });

  it("cai no defaultDueDays da clínica quando plano e pacote são nulos", () => {
    expect(
      resolveMonthlyDueDay({
        planMonthlyDueDay: null,
        packageBillingDay: null,
        clinicDefaultDueDays: 7,
      }),
    ).toBe(7);
  });

  it("cai na constante 10 quando nada foi definido", () => {
    expect(resolveMonthlyDueDay({})).toBe(10);
    expect(
      resolveMonthlyDueDay({
        planMonthlyDueDay: null,
        packageBillingDay: null,
        clinicDefaultDueDays: null,
      }),
    ).toBe(10);
  });

  it("ignora valores fora do intervalo [1, 28] e tenta o próximo nível", () => {
    // plan inválido (0) → cai no pacote.
    expect(
      resolveMonthlyDueDay({ planMonthlyDueDay: 0, packageBillingDay: 12 }),
    ).toBe(12);
    // plan inválido (29) → cai no pacote.
    expect(
      resolveMonthlyDueDay({ planMonthlyDueDay: 29, packageBillingDay: 15 }),
    ).toBe(15);
    // pacote inválido (31) → cai no clinic.
    expect(
      resolveMonthlyDueDay({
        planMonthlyDueDay: null,
        packageBillingDay: 31,
        clinicDefaultDueDays: 8,
      }),
    ).toBe(8);
    // todos inválidos → 10.
    expect(
      resolveMonthlyDueDay({
        planMonthlyDueDay: -1,
        packageBillingDay: 30,
        clinicDefaultDueDays: 0,
      }),
    ).toBe(10);
  });

  it("aceita strings numéricas (Number coerção) e ignora NaN", () => {
    expect(
      resolveMonthlyDueDay({ planMonthlyDueDay: "15" as unknown as number }),
    ).toBe(15);
    expect(
      resolveMonthlyDueDay({
        planMonthlyDueDay: "abc" as unknown as number,
        packageBillingDay: 12,
      }),
    ).toBe(12);
  });
});
