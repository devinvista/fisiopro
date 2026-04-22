import { describe, it, expect } from "vitest";
import {
  addDays,
  lastDayOfMonth,
  monthDateRangeBRT,
  nowBRT,
  todayBRT,
} from "../../utils/dateUtils.js";

describe("dateUtils", () => {
  describe("lastDayOfMonth", () => {
    it("janeiro/dezembro = 31", () => {
      expect(lastDayOfMonth(2026, 1)).toBe(31);
      expect(lastDayOfMonth(2026, 12)).toBe(31);
    });
    it("fev não-bissexto = 28, bissexto = 29", () => {
      expect(lastDayOfMonth(2025, 2)).toBe(28);
      expect(lastDayOfMonth(2024, 2)).toBe(29);
      expect(lastDayOfMonth(2000, 2)).toBe(29); // múltiplo de 400
      expect(lastDayOfMonth(1900, 2)).toBe(28); // múltiplo de 100, não 400
    });
    it("meses de 30 dias", () => {
      for (const m of [4, 6, 9, 11]) {
        expect(lastDayOfMonth(2026, m)).toBe(30);
      }
    });
  });

  describe("addDays", () => {
    it("soma dentro do mês", () => {
      expect(addDays("2026-04-22", 1)).toBe("2026-04-23");
      expect(addDays("2026-04-22", 7)).toBe("2026-04-29");
    });

    it("atravessa fronteira de mês", () => {
      expect(addDays("2026-04-30", 1)).toBe("2026-05-01");
      expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    });

    it("aceita deltas negativos", () => {
      expect(addDays("2026-04-01", -1)).toBe("2026-03-31");
      expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    });

    it("zero dias é idempotente", () => {
      expect(addDays("2026-04-22", 0)).toBe("2026-04-22");
    });

    it("respeita ano bissexto ao saltar fev", () => {
      expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
      expect(addDays("2024-02-29", 1)).toBe("2024-03-01");
      expect(addDays("2025-02-28", 1)).toBe("2025-03-01");
    });
  });

  describe("monthDateRangeBRT", () => {
    it("formata início e fim com zero-pad", () => {
      expect(monthDateRangeBRT(2026, 3)).toEqual({
        startDate: "2026-03-01",
        endDate: "2026-03-31",
      });
    });
  });

  describe("todayBRT / nowBRT", () => {
    it("retorna string ISO YYYY-MM-DD", () => {
      const today = todayBRT();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("nowBRT retorna campos consistentes com todayBRT", () => {
      const now = nowBRT();
      const today = todayBRT();
      const [y, m, d] = today.split("-").map(Number);
      expect(now.year).toBe(y);
      expect(now.month).toBe(m);
      expect(now.day).toBe(d);
      expect(now.month).toBeGreaterThanOrEqual(1);
      expect(now.month).toBeLessThanOrEqual(12);
      expect(now.day).toBeGreaterThanOrEqual(1);
      expect(now.day).toBeLessThanOrEqual(31);
    });
  });
});
