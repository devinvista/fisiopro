/**
 * Sprint 4 — Testes do helper `cascadeFaturaMensalAvulsoPayment`.
 *
 * Mocka:
 *   • `db` (`@workspace/db`) com fila de respostas (mesmo padrão de
 *     `billing.service.test.ts`) — usado quando o helper é chamado com
 *     `tx = db`;
 *   • `allocateReceivable` (accounting service), para podermos checar a
 *     contagem e os argumentos de cada alocação por filho.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const dbMock = vi.hoisted(() => {
  let queue: any[] = [];
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
        return () => {
          callLog.push("execute");
          return makeChain(undefined);
        };
      }
      return () => {
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

const allocateReceivableMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("../../shared/accounting/accounting.service.js", () => ({
  allocateReceivable: allocateReceivableMock,
}));

import { cascadeFaturaMensalAvulsoPayment } from "./payment-cascade.js";

describe("cascadeFaturaMensalAvulsoPayment", () => {
  beforeEach(() => {
    dbMock.reset();
    allocateReceivableMock.mockClear();
  });

  it("cascateia 2 filhos com recognizedEntryId, alocando o settlement contra cada um e marcando todos como pago", async () => {
    // 1. select children pendentes → 2 filhos
    dbMock.enqueue([
      { id: 11, amount: "80.00", recognizedEntryId: 901, accountingEntryId: 901 },
      { id: 12, amount: "80.00", recognizedEntryId: 902, accountingEntryId: 902 },
    ]);
    // 2. update child 11
    dbMock.enqueue(undefined);
    // 3. update child 12
    dbMock.enqueue(undefined);

    const result = await cascadeFaturaMensalAvulsoPayment({
      tx: dbMock.db,
      parent: { id: 100, clinicId: 1, patientId: 7, amount: "160.00" },
      paymentDate: "2026-04-28",
      paymentMethod: "pix",
      settlementEntryId: 555,
    });

    expect(result.cascadedChildIds).toEqual([11, 12]);
    expect(result.totalCascaded).toBe("160.00");
    expect(allocateReceivableMock).toHaveBeenCalledTimes(2);
    const firstArgs = allocateReceivableMock.mock.calls.map((c: any[]) => c[0]);
    expect(firstArgs[0]).toMatchObject({
      paymentEntryId: 555,
      receivableEntryId: 901,
      patientId: 7,
      amount: 80,
      allocatedAt: "2026-04-28",
      clinicId: 1,
    });
    expect(firstArgs[1]).toMatchObject({
      paymentEntryId: 555,
      receivableEntryId: 902,
      amount: 80,
    });
    expect(dbMock.pending()).toBe(0);
  });

  it("retorna vazio (e não aloca nada) quando não há filhos pendentes — idempotência da segunda chamada", async () => {
    dbMock.enqueue([]); // select children → vazio

    const result = await cascadeFaturaMensalAvulsoPayment({
      tx: dbMock.db,
      parent: { id: 100, clinicId: 1, patientId: 7, amount: "160.00" },
      paymentDate: "2026-04-28",
      paymentMethod: null,
      settlementEntryId: 555,
    });

    expect(result.cascadedChildIds).toEqual([]);
    expect(result.totalCascaded).toBe("0.00");
    expect(allocateReceivableMock).not.toHaveBeenCalled();
    expect(dbMock.pending()).toBe(0);
  });

  it("filho sem recognizedEntryId/accountingEntryId é marcado como pago mas SEM allocateReceivable", async () => {
    dbMock.enqueue([
      { id: 21, amount: "120.00", recognizedEntryId: null, accountingEntryId: null },
    ]);
    dbMock.enqueue(undefined); // update child

    const result = await cascadeFaturaMensalAvulsoPayment({
      tx: dbMock.db,
      parent: { id: 200, clinicId: 1, patientId: 7, amount: "120.00" },
      paymentDate: "2026-04-28",
      paymentMethod: "dinheiro",
      settlementEntryId: 777,
    });

    expect(result.cascadedChildIds).toEqual([21]);
    expect(allocateReceivableMock).not.toHaveBeenCalled();
  });

  it("não tenta alocar quando parent.patientId é null (defesa)", async () => {
    dbMock.enqueue([
      { id: 31, amount: "50.00", recognizedEntryId: 999, accountingEntryId: 999 },
    ]);
    dbMock.enqueue(undefined); // update

    const result = await cascadeFaturaMensalAvulsoPayment({
      tx: dbMock.db,
      parent: { id: 300, clinicId: 1, patientId: null, amount: "50.00" },
      paymentDate: "2026-04-28",
      paymentMethod: "pix",
      settlementEntryId: 888,
    });

    expect(result.cascadedChildIds).toEqual([31]);
    expect(allocateReceivableMock).not.toHaveBeenCalled();
  });
});
