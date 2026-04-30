/**
 * Sprint Financeiro 10 (P2) — testes do job de fechamento de mês.
 *
 * Mocka `db` com fila programável e os helpers de accounting service.
 *
 * Cobertura:
 *   1. dia != último dia do mês → no-op silencioso (não consulta DB).
 *   2. fatura com saldo residual → posta entry de fechamento + zera consumido.
 *   3. fatura totalmente apropriada (residual ~0) → marca consumed=total e
 *      não posta nada.
 *   4. forçando dia diferente via forceRun=true.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const dbMock = vi.hoisted(() => {
  const queue: any[] = [];
  const callLog: string[] = [];
  function makeChain(result: any): any {
    const handler: ProxyHandler<any> = {
      get(_t, prop) {
        if (prop === "then") return (r: any, j?: any) => Promise.resolve(result).then(r, j);
        if (prop === "catch") return (j: any) => Promise.resolve(result).catch(j);
        if (prop === "finally") return (cb: any) => Promise.resolve(result).finally(cb);
        return () => proxy;
      },
    };
    const proxy: any = new Proxy(() => undefined, handler);
    return proxy;
  }
  const db = new Proxy({} as any, {
    get(_t, prop: string) {
      if (prop === "transaction") {
        return async (cb: (tx: any) => any) => {
          callLog.push("transaction");
          return cb(db);
        };
      }
      if (prop === "execute") {
        return (..._args: any[]) => {
          callLog.push("execute");
          return Promise.resolve(undefined);
        };
      }
      return (..._args: any[]) => {
        callLog.push(prop);
        if (queue.length === 0) {
          throw new Error(`[dbMock] queue exhausted on db.${prop}() — chamadas: ${callLog.join(",")}`);
        }
        const next = queue.shift();
        return makeChain(typeof next === "function" ? next() : next);
      };
    },
  });
  return {
    db,
    enqueue: (...rs: any[]) => queue.push(...rs),
    reset: () => { queue.length = 0; callLog.length = 0; },
    pending: () => queue.length,
    calls: () => [...callLog],
  };
});

vi.mock("@workspace/db", async () => {
  const actual = await vi.importActual<any>("@workspace/db");
  return { ...actual, db: dbMock.db };
});

const postReceivableRevenueMock = vi.hoisted(() => vi.fn(async () => ({ id: 9999 })));
const postWalletUsageMock = vi.hoisted(() => vi.fn(async () => ({ id: 8888 })));
const resolveAccountCodeByIdMock = vi.hoisted(() =>
  vi.fn(async (_id: any, fallback: string) => fallback)
);
vi.mock("../../shared/accounting/accounting.service.js", () => ({
  postReceivableRevenue: postReceivableRevenueMock,
  postWalletUsage: postWalletUsageMock,
  resolveAccountCodeById: resolveAccountCodeByIdMock,
}));

import { runEndOfMonthRevenueClosure } from "./end-of-month-closure.service.js";

describe("runEndOfMonthRevenueClosure", () => {
  beforeEach(() => {
    dbMock.reset();
    postReceivableRevenueMock.mockClear();
    postWalletUsageMock.mockClear();
    resolveAccountCodeByIdMock.mockClear();
  });

  it("dia != último dia do mês → no-op (não consulta DB)", async () => {
    const result = await runEndOfMonthRevenueClosure({
      today: "2026-04-15", // abr tem 30 dias; 15 != 30
      triggeredBy: "test",
    });
    expect(result.closed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
    expect(dbMock.calls()).toEqual([]);
    expect(postReceivableRevenueMock).not.toHaveBeenCalled();
  });

  it("dia == último dia: fatura com saldo residual posta entry de fechamento (pendente → postReceivableRevenue)", async () => {
    // 1. SELECT candidates → 1 fatura
    dbMock.enqueue([{
      id: 100,
      clinicId: 1,
      patientId: 7,
      procedureId: null,
      description: "Mensalidade Pilates — abr/2026",
      amount: "800.00",
      recognizedAmount: "200.00",
      recognitionCreditsTotal: 8,
      recognitionCreditsConsumed: 2,
      status: "pendente",
      planMonthRef: "2026-04-01",
    }]);
    // 2. SELECT re-lê (dentro do tx) → mesma fatura
    dbMock.enqueue([{
      id: 100,
      amount: "800.00",
      recognizedAmount: "200.00",
      recognitionCreditsTotal: 8,
      recognitionCreditsConsumed: 2,
      status: "pendente",
      clinicId: 1,
      patientId: 7,
      procedureId: null,
      description: "Mensalidade Pilates — abr/2026",
      recognizedEntryId: 9001,
    }]);
    // 3. UPDATE financial_records
    dbMock.enqueue(undefined);

    postReceivableRevenueMock.mockResolvedValueOnce({ id: 9999 });

    const result = await runEndOfMonthRevenueClosure({
      today: "2026-04-30",
      triggeredBy: "test",
    });

    expect(result.closed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.residualTotal).toBe("600.00");
    expect(postReceivableRevenueMock).toHaveBeenCalledTimes(1);
    expect(postReceivableRevenueMock.mock.calls[0][0]).toMatchObject({
      amount: 600,
      financialRecordId: 100,
      eventType: "end_of_month_closure",
    });
  });

  it("dia == último dia: fatura PAGA usa postWalletUsage", async () => {
    dbMock.enqueue([{
      id: 200,
      clinicId: 1,
      patientId: 8,
      procedureId: null,
      description: "Plano",
      amount: "400.00",
      recognizedAmount: "100.00",
      recognitionCreditsTotal: 4,
      recognitionCreditsConsumed: 1,
      status: "pago",
      planMonthRef: "2026-04-01",
    }]);
    dbMock.enqueue([{
      id: 200,
      amount: "400.00",
      recognizedAmount: "100.00",
      recognitionCreditsTotal: 4,
      recognitionCreditsConsumed: 1,
      status: "pago",
      clinicId: 1,
      patientId: 8,
      procedureId: null,
      description: "Plano",
      recognizedEntryId: 8001,
    }]);
    dbMock.enqueue(undefined);

    postWalletUsageMock.mockResolvedValueOnce({ id: 8889 });

    const result = await runEndOfMonthRevenueClosure({
      today: "2026-04-30",
      triggeredBy: "test",
    });

    expect(result.closed).toBe(1);
    expect(postWalletUsageMock).toHaveBeenCalledTimes(1);
    expect(postReceivableRevenueMock).not.toHaveBeenCalled();
  });

  it("residual ~0 → skipped sem postar entry (mas marca consumed=total)", async () => {
    dbMock.enqueue([{
      id: 300,
      clinicId: 1,
      patientId: 9,
      procedureId: null,
      description: "Plano X",
      amount: "300.00",
      recognizedAmount: "299.999",
      recognitionCreditsTotal: 3,
      recognitionCreditsConsumed: 2,
      status: "pendente",
      planMonthRef: "2026-04-01",
    }]);
    dbMock.enqueue([{
      id: 300,
      amount: "300.00",
      recognizedAmount: "299.999",
      recognitionCreditsTotal: 3,
      recognitionCreditsConsumed: 2,
      status: "pendente",
      clinicId: 1,
      patientId: 9,
      procedureId: null,
      description: "Plano X",
      recognizedEntryId: null,
    }]);
    dbMock.enqueue(undefined); // update credits=total

    const result = await runEndOfMonthRevenueClosure({
      today: "2026-04-30",
      triggeredBy: "test",
    });

    expect(result.closed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(postReceivableRevenueMock).not.toHaveBeenCalled();
    expect(postWalletUsageMock).not.toHaveBeenCalled();
  });

  it("forceRun=true permite rodar em dia que não é último do mês", async () => {
    dbMock.enqueue([]); // sem candidatos
    const result = await runEndOfMonthRevenueClosure({
      today: "2026-04-15",
      triggeredBy: "test",
      forceRun: true,
    });
    expect(result.closed).toBe(0);
    expect(dbMock.calls()).toContain("select"); // tocou DB
  });
});
