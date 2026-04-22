import { describe, it, expect } from "vitest";
import {
  RECEIVABLE_TYPES,
  isActiveFinancialRecord,
  isRevenueSummaryRecord,
  monthDateRange,
  monthlyCreditQuantity,
} from "./financial-reports.service.js";

describe("financialReportsService — pure helpers", () => {
  describe("RECEIVABLE_TYPES", () => {
    it("contém todos os tipos de recebível esperados", () => {
      expect(RECEIVABLE_TYPES).toEqual([
        "creditoAReceber",
        "cobrancaSessao",
        "cobrancaMensal",
        "faturaConsolidada",
      ]);
    });
  });

  describe("isActiveFinancialRecord", () => {
    it("aceita registros pendentes e pagos", () => {
      expect(isActiveFinancialRecord("pendente")).toBe(true);
      expect(isActiveFinancialRecord("pago")).toBe(true);
    });

    it("rejeita estornados e cancelados", () => {
      expect(isActiveFinancialRecord("estornado")).toBe(false);
      expect(isActiveFinancialRecord("cancelado")).toBe(false);
    });
  });

  describe("isRevenueSummaryRecord", () => {
    const baseRecord = {
      type: "receita" as const,
      status: "pago",
      transactionType: "cobrancaSessao",
    } as any;

    it("considera receita ativa de competência como elegível para o sumário", () => {
      expect(isRevenueSummaryRecord(baseRecord)).toBe(true);
    });

    it("exclui despesas mesmo que ativas", () => {
      expect(isRevenueSummaryRecord({ ...baseRecord, type: "despesa" })).toBe(false);
    });

    it("exclui registros estornados/cancelados", () => {
      expect(isRevenueSummaryRecord({ ...baseRecord, status: "estornado" })).toBe(false);
      expect(isRevenueSummaryRecord({ ...baseRecord, status: "cancelado" })).toBe(false);
    });

    it("exclui tipos não-competência (depósito, venda de pacote, pagamento, fatura consolidada)", () => {
      for (const tt of ["depositoCarteira", "vendaPacote", "pagamento", "faturaConsolidada"]) {
        expect(isRevenueSummaryRecord({ ...baseRecord, transactionType: tt })).toBe(false);
      }
    });

    it("aceita registros sem transactionType (legado)", () => {
      expect(isRevenueSummaryRecord({ ...baseRecord, transactionType: null })).toBe(true);
    });
  });

  describe("monthDateRange", () => {
    it("janeiro tem 31 dias", () => {
      expect(monthDateRange(2026, 1)).toEqual({
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      });
    });

    it("fevereiro de ano não-bissexto tem 28", () => {
      expect(monthDateRange(2025, 2)).toEqual({
        startDate: "2025-02-01",
        endDate: "2025-02-28",
      });
    });

    it("fevereiro de ano bissexto tem 29", () => {
      expect(monthDateRange(2024, 2)).toEqual({
        startDate: "2024-02-01",
        endDate: "2024-02-29",
      });
    });

    it("dezembro tem 31 dias", () => {
      expect(monthDateRange(2026, 12)).toEqual({
        startDate: "2026-12-01",
        endDate: "2026-12-31",
      });
    });
  });

  describe("monthlyCreditQuantity", () => {
    it("padrão 1x/semana → 4 créditos/mês", () => {
      expect(monthlyCreditQuantity()).toBe(4);
      expect(monthlyCreditQuantity(null)).toBe(4);
      expect(monthlyCreditQuantity(1)).toBe(4);
    });

    it("2x/semana → 8 créditos", () => {
      expect(monthlyCreditQuantity(2)).toBe(8);
    });

    it("3x/semana → 12 créditos", () => {
      expect(monthlyCreditQuantity(3)).toBe(12);
    });

    it("nunca devolve menos que 1", () => {
      expect(monthlyCreditQuantity(0)).toBe(1);
      expect(monthlyCreditQuantity(-5)).toBe(1);
    });

    it("arredonda valores fracionados", () => {
      // 0.5x/semana = 2.0 → 2
      expect(monthlyCreditQuantity(0.5)).toBe(2);
      // 1.4x/semana ≈ 5.6 → 6
      expect(monthlyCreditQuantity(1.4)).toBe(6);
    });
  });
});
