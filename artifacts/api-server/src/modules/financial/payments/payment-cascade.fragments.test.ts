/**
 * Sprint Financeiro 10 (P2) — testes de `reverseFaturaPlanoFragments`.
 *
 * Verifica que o helper:
 *   • estorna TODAS as fragmentas vivas via postReversal;
 *   • é idempotente (não estorna fragmentas já estornadas — exclui via NOT EXISTS);
 *   • retorna totalReversed correto.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const dbMock = vi.hoisted(() => {
  const queue: any[] = [];
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
        return async (cb: (tx: any) => any) => cb(db);
      }
      return (..._args: any[]) => {
        if (queue.length === 0) {
          throw new Error(`[dbMock] queue exhausted on db.${prop}()`);
        }
        const next = queue.shift();
        return makeChain(typeof next === "function" ? next() : next);
      };
    },
  });
  return {
    db,
    enqueue: (...rs: any[]) => queue.push(...rs),
    reset: () => { queue.length = 0; },
    pending: () => queue.length,
  };
});

vi.mock("@workspace/db", async () => {
  const actual = await vi.importActual<any>("@workspace/db");
  return { ...actual, db: dbMock.db };
});

const postReversalMock = vi.hoisted(() =>
  vi.fn(async (entryId: number) => ({ id: entryId + 50000 }))
);
const allocateReceivableMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("../../shared/accounting/accounting.service.js", () => ({
  postReversal: postReversalMock,
  allocateReceivable: allocateReceivableMock,
}));

import { reverseFaturaPlanoFragments } from "./payment-cascade.js";

describe("reverseFaturaPlanoFragments", () => {
  beforeEach(() => {
    dbMock.reset();
    postReversalMock.mockClear();
  });

  it("estorna 3 fragmentas vivas e retorna totalReversed somado", async () => {
    // SELECT fragments → 3 entries
    dbMock.enqueue([
      { id: 9001, amount: "100.00" },
      { id: 9002, amount: "100.00" },
      { id: 9003, amount: "100.00" },
    ]);

    const result = await reverseFaturaPlanoFragments({
      tx: dbMock.db,
      invoice: {
        id: 100,
        clinicId: 1,
        patientId: 7,
        procedureId: null,
        appointmentId: null,
        description: "Plano X",
      },
      reversalReason: "ajuste manual",
      reversedBy: 42,
      reversalDate: "2026-04-30",
    });

    expect(result.reversedEntryIds).toEqual([9001, 9002, 9003]);
    expect(result.reversalEntryIds).toEqual([59001, 59002, 59003]);
    expect(result.totalReversed).toBe("300.00");
    expect(postReversalMock).toHaveBeenCalledTimes(3);
    expect(postReversalMock.mock.calls[0][0]).toBe(9001);
    expect(postReversalMock.mock.calls[0][1]).toMatchObject({
      financialRecordId: 100,
      patientId: 7,
    });
  });

  it("0 fragmentas vivas (todas já estornadas) → no-op idempotente", async () => {
    dbMock.enqueue([]);

    const result = await reverseFaturaPlanoFragments({
      tx: dbMock.db,
      invoice: {
        id: 100,
        clinicId: 1,
        patientId: 7,
        procedureId: null,
        appointmentId: null,
        description: "Plano X",
      },
      reversalReason: "ajuste duplicado",
    });

    expect(result.reversedEntryIds).toEqual([]);
    expect(result.reversalEntryIds).toEqual([]);
    expect(result.totalReversed).toBe("0.00");
    expect(postReversalMock).not.toHaveBeenCalled();
  });
});
