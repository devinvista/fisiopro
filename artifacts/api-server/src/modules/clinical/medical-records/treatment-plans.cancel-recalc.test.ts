/**
 * Sprint Financeiro 13 (P4) — recálculo de diferença de preço no cancelamento.
 *
 * Quando `recalculate=true` é passado em `cancelTreatmentPlan` E a cláusula
 * `PRECO_DIFERENCIADO` está marcada como aceita no `acceptedClausesJson` do
 * plano, para cada appointment `compareceu/concluido` ligado a um item
 * `kind=avulso`:
 *   - Calcula `diff = tablePrice − effectivePrice`.
 *   - Se `diff > 0`: cria FR `transactionType='priceDifference'` e posta
 *     `D 1.1.2 / C 4.1.1` (postReceivableRevenue, eventType='price_difference').
 *   - Idempotente por (appointmentId, eventType='price_difference').
 *
 * Quando a cláusula NÃO está aceita, o recálculo é pulado com
 * `recalculateSkippedReason='clause_not_accepted'`.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const dbMock = vi.hoisted(() => {
  const queue: any[] = [];
  const callLog: string[] = [];
  const inserts: any[] = [];
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
  function trapInsert(_table: any) {
    return {
      values: (vals: any) => {
        inserts.push(vals);
        return {
          returning: () => Promise.resolve([{ id: Math.floor(Math.random() * 100000) + 1000 }]),
        };
      },
    };
  }
  const db = new Proxy({} as any, {
    get(_t, prop: string) {
      if (prop === "transaction") {
        return async (cb: (tx: any) => any) => {
          callLog.push("transaction");
          return cb(db);
        };
      }
      if (prop === "insert") {
        return (table: any) => {
          callLog.push("insert");
          return trapInsert(table);
        };
      }
      return (..._args: any[]) => {
        callLog.push(prop);
        if (queue.length === 0) {
          throw new Error(
            `[dbMock] queue exhausted on db.${prop}() — calls: ${callLog.join(",")}`,
          );
        }
        const next = queue.shift();
        return makeChain(typeof next === "function" ? next() : next);
      };
    },
  });
  return {
    db,
    enqueue: (...rs: any[]) => queue.push(...rs),
    reset: () => {
      queue.length = 0;
      callLog.length = 0;
      inserts.length = 0;
    },
    pending: () => queue.length,
    inserts: () => [...inserts],
  };
});

vi.mock("@workspace/db", async () => {
  const actual = await vi.importActual<any>("@workspace/db");
  return { ...actual, db: dbMock.db };
});

const postReversalMock = vi.hoisted(() =>
  vi.fn(async (_originalEntryId: number, _input: any) => ({ id: 99999 })),
);
const postReceivableRevenueMock = vi.hoisted(() =>
  vi.fn(async (_input: any, _tx: any) => ({ id: 88888 })),
);
const resolveAccountCodeByIdMock = vi.hoisted(() =>
  vi.fn(async (_id: any, fallback: string, _clinicId: any, _tx: any) => fallback),
);

vi.mock("../../shared/accounting/accounting.service.js", () => ({
  postReversal: postReversalMock,
  postReceivableRevenue: postReceivableRevenueMock,
  resolveAccountCodeById: resolveAccountCodeByIdMock,
}));

import { cancelTreatmentPlan } from "./treatment-plans.cancel.js";

const ACCEPTED_CLAUSE = JSON.stringify({
  items: [{ code: "PRECO_DIFERENCIADO", acceptedAt: "2026-04-01" }],
});

const planWithClause = {
  id: 100,
  patientId: 7,
  clinicId: 1,
  status: "vigente",
  cancellationReason: null as string | null,
  acceptedClausesJson: ACCEPTED_CLAUSE,
};

describe("cancelTreatmentPlan — recalculate (Sprint Financeiro 13/P4)", () => {
  beforeEach(() => {
    dbMock.reset();
    postReversalMock.mockClear();
    postReceivableRevenueMock.mockClear();
    resolveAccountCodeByIdMock.mockClear();
  });

  it("recalculate=false (default) → não dispara recálculo, campos zerados", async () => {
    dbMock.enqueue([planWithClause]);
    dbMock.enqueue([]); // sem faturas
    dbMock.enqueue(undefined); // UPDATE plan

    const result = await cancelTreatmentPlan({
      planId: 100,
      reason: "Cancelamento simples",
    });

    expect(result.recalculatedAppointments).toBe(0);
    expect(result.priceDifferenceTotal).toBe("0.00");
    expect(result.recalculateSkippedReason).toBeNull();
    expect(postReceivableRevenueMock).not.toHaveBeenCalled();
  });

  it("recalculate=true sem cláusula PRECO_DIFERENCIADO aceita → skip com reason", async () => {
    const planNoClause = {
      ...planWithClause,
      acceptedClausesJson: JSON.stringify({ items: [{ code: "OUTRA_CLAUSULA" }] }),
    };
    dbMock.enqueue([planNoClause]);
    dbMock.enqueue([]); // sem faturas
    dbMock.enqueue(undefined); // UPDATE plan

    const result = await cancelTreatmentPlan({
      planId: 100,
      reason: "Tentativa de recálculo sem cláusula",
      recalculate: true,
    });

    expect(result.recalculatedAppointments).toBe(0);
    expect(result.recalculateSkippedReason).toBe("clause_not_accepted");
    expect(postReceivableRevenueMock).not.toHaveBeenCalled();
  });

  it("recalculate=true com 3 appointments avulso → posta 3× price_difference", async () => {
    dbMock.enqueue([planWithClause]);
    dbMock.enqueue([]); // sem faturas
    dbMock.enqueue(undefined); // UPDATE plan

    // Items do plano (1 item avulso com preço efetivo 60 vs tabela 100 → diff=40).
    dbMock.enqueue([
      {
        itemId: 50,
        kind: "avulso",
        procedureId: 30,
        unitPrice: "70.00",
        unitMonthlyPrice: null,
        discount: "10",
        tablePrice: "100.00",
        procedureName: "Sessão fisio",
        accountingAccountId: null,
      },
    ]);

    // 3 appointments consumidos
    dbMock.enqueue([
      { id: 401, date: "2026-04-05", clinicId: 1, patientId: 7 },
      { id: 402, date: "2026-04-12", clinicId: 1, patientId: 7 },
      { id: 403, date: "2026-04-19", clinicId: 1, patientId: 7 },
    ]);

    // Para cada appointment: SELECT existing diff (vazio) + UPDATE FR depois do post.
    for (let i = 0; i < 3; i++) {
      dbMock.enqueue([]); // existingDiff
      dbMock.enqueue(undefined); // UPDATE financialRecords
    }

    const result = await cancelTreatmentPlan({
      planId: 100,
      reason: "Cancelamento com cobrança da diferença",
      recalculate: true,
    });

    expect(result.recalculatedAppointments).toBe(3);
    // diff = 100 - (70 - 10) = 40 por sessão; 3 sessões = 120.
    expect(result.priceDifferenceTotal).toBe("120.00");
    expect(result.recalculateSkippedReason).toBeNull();
    expect(postReceivableRevenueMock).toHaveBeenCalledTimes(3);

    const firstCall = postReceivableRevenueMock.mock.calls[0][0] as any;
    expect(firstCall.amount).toBe(40);
    expect(firstCall.eventType).toBe("price_difference");
    expect(firstCall.revenueAccountCode).toBe("4.1.1");
    expect(firstCall.appointmentId).toBe(401);

    const inserts = dbMock.inserts();
    expect(inserts).toHaveLength(3);
    for (const ins of inserts) {
      expect(ins.transactionType).toBe("priceDifference");
      expect(ins.amount).toBe("40.00");
      expect(ins.priceSource).toBe("tabela");
    }
  });

  it("recalculate=true com diff ≤ 0 (preço efetivo já era o de tabela) → não posta nada", async () => {
    dbMock.enqueue([planWithClause]);
    dbMock.enqueue([]); // sem faturas
    dbMock.enqueue(undefined); // UPDATE plan

    // tablePrice 80 = unitPrice 80, sem desconto → diff = 0.
    dbMock.enqueue([
      {
        itemId: 51,
        kind: "avulso",
        procedureId: 30,
        unitPrice: "80.00",
        unitMonthlyPrice: null,
        discount: "0",
        tablePrice: "80.00",
        procedureName: "Sessão fisio",
        accountingAccountId: null,
      },
    ]);

    const result = await cancelTreatmentPlan({
      planId: 100,
      reason: "Sem diferença para cobrar",
      recalculate: true,
    });

    expect(result.recalculatedAppointments).toBe(0);
    expect(result.priceDifferenceTotal).toBe("0.00");
    expect(postReceivableRevenueMock).not.toHaveBeenCalled();
  });

  it("recalculate=true com item kind=recorrenteMensal → pula (mensalidade não recalcula por sessão)", async () => {
    dbMock.enqueue([planWithClause]);
    dbMock.enqueue([]); // sem faturas
    dbMock.enqueue(undefined); // UPDATE plan

    dbMock.enqueue([
      {
        itemId: 60,
        kind: "recorrenteMensal",
        procedureId: 30,
        unitPrice: null,
        unitMonthlyPrice: "300.00",
        discount: "0",
        tablePrice: "100.00",
        procedureName: "Mensalidade",
        accountingAccountId: null,
      },
    ]);

    const result = await cancelTreatmentPlan({
      planId: 100,
      reason: "Mensalidade não recalcula",
      recalculate: true,
    });

    expect(result.recalculatedAppointments).toBe(0);
    expect(postReceivableRevenueMock).not.toHaveBeenCalled();
  });

  it("idempotência: appointment com price_difference já postado → skip", async () => {
    dbMock.enqueue([planWithClause]);
    dbMock.enqueue([]); // sem faturas
    dbMock.enqueue(undefined); // UPDATE plan

    dbMock.enqueue([
      {
        itemId: 70,
        kind: "avulso",
        procedureId: 30,
        unitPrice: "60.00",
        unitMonthlyPrice: null,
        discount: "0",
        tablePrice: "100.00",
        procedureName: "Sessão fisio",
        accountingAccountId: null,
      },
    ]);

    dbMock.enqueue([
      { id: 501, date: "2026-04-05", clinicId: 1, patientId: 7 },
      { id: 502, date: "2026-04-12", clinicId: 1, patientId: 7 },
    ]);

    // Primeiro appt: diff já postado (idempotência hit).
    dbMock.enqueue([{ id: 9999 }]); // existingDiff
    // Segundo appt: vazio, posta normal.
    dbMock.enqueue([]); // existingDiff
    dbMock.enqueue(undefined); // UPDATE financialRecords

    const result = await cancelTreatmentPlan({
      planId: 100,
      reason: "Tentativa de recálculo duplicado",
      recalculate: true,
    });

    expect(result.recalculatedAppointments).toBe(1);
    expect(result.priceDifferenceTotal).toBe("40.00");
    expect(postReceivableRevenueMock).toHaveBeenCalledTimes(1);
  });
});
