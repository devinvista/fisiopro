/**
 * Sprint Financeiro 13 (P4) — Aceite contábil antecipado para avulsos do plano.
 *
 * Cobertura:
 *  • Item kind=avulso com sessionsPerWeek=2, durationMonths=3 →
 *    cria 3 faturas `faturaPlanoAvulsoMensal`, cada uma com
 *    `recognitionCreditsTotal = sessionsPerMonth (8)` e amount =
 *    sessionsPerMonth × effective.
 *  • Para cada fatura criada, posta `deferred_receivable` (D 1.1.2 / C 2.1.1).
 *  • Idempotência: chamar 2× não duplica faturas (skip via lookup).
 *  • Item avulso com unitPrice ≤ 0 ou sem procedureId → skip silencioso.
 *  • Item kind=recorrenteMensal não entra no novo branch (delegado ao fluxo
 *    legado P3 — já coberto em outras suites).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const dbMock = vi.hoisted(() => {
  const queue: any[] = [];
  const callLog: Array<{ op: string; args?: any }> = [];
  const inserts: any[] = [];
  function makeChain(result: any): any {
    const handler: ProxyHandler<any> = {
      get(_t, prop) {
        if (prop === "then") return (r: any, j?: any) => Promise.resolve(result).then(r, j);
        if (prop === "catch") return (j: any) => Promise.resolve(result).catch(j);
        if (prop === "finally") return (cb: any) => Promise.resolve(result).finally(cb);
        return (..._a: any[]) => proxy;
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
          callLog.push({ op: "transaction" });
          return cb(db);
        };
      }
      if (prop === "insert") {
        return (table: any) => {
          callLog.push({ op: "insert" });
          return trapInsert(table);
        };
      }
      return (..._args: any[]) => {
        callLog.push({ op: prop });
        if (queue.length === 0) {
          throw new Error(
            `[dbMock] queue exhausted on db.${prop}() — calls: ${callLog
              .map((c) => c.op)
              .join(",")}`,
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
    calls: () => callLog.map((c) => c.op),
  };
});

vi.mock("@workspace/db", async () => {
  const actual = await vi.importActual<any>("@workspace/db");
  return { ...actual, db: dbMock.db };
});

const postDeferredReceivableMock = vi.hoisted(() =>
  vi.fn(async (_input: any, _tx: any) => ({ id: 77777 })),
);
const resolveAccountCodeByIdMock = vi.hoisted(() =>
  vi.fn(async (_id: any, fallback: string, _clinicId: any, _tx: any) => fallback),
);

vi.mock("../../shared/accounting/accounting.service.js", () => ({
  postDeferredReceivable: postDeferredReceivableMock,
  resolveAccountCodeById: resolveAccountCodeByIdMock,
}));

import { acceptPlanFinancials } from "./treatment-plans.acceptance.js";

const basePlan = {
  id: 200,
  patientId: 9,
  clinicId: 1,
  paymentMode: "postpago",
  startDate: "2026-05-01",
  durationMonths: 3,
  monthlyDueDay: 10,
};

const baseProcedure = {
  name: "Sessão fisio",
  category: "Fisioterapia",
  price: "100.00",
  accountingAccountId: null,
};

describe("acceptPlanFinancials — avulso (Sprint Financeiro 13/P4)", () => {
  beforeEach(() => {
    dbMock.reset();
    postDeferredReceivableMock.mockClear();
    resolveAccountCodeByIdMock.mockClear();
  });

  it("item avulso com sessionsPerWeek=2 / 3 meses → 3 faturas faturaPlanoAvulsoMensal e 3 deferred_receivable", async () => {
    // 1. SELECT plano
    dbMock.enqueue([basePlan]);
    // 2. SELECT items (loadAcceptanceItems)
    dbMock.enqueue([
      {
        id: 1,
        kind: "avulso",
        procedureId: 50,
        packageId: null,
        unitPrice: "80.00",
        unitMonthlyPrice: null,
        discount: "0",
        totalSessions: null,
        sessionsPerWeek: 2,
        packageType: null,
        packageBillingDay: null,
        packageProcedureId: null,
        packagePaymentMode: null,
        packageName: null,
        packageMonthlyPrice: null,
      },
    ]);
    // 3. SELECT patient (name)
    dbMock.enqueue([{ name: "Fulano" }]);
    // 4. SELECT procedure (no transaction)
    dbMock.enqueue([baseProcedure]);
    // 5. Para cada um dos 3 meses: SELECT idempotência fatura (vazio) +
    //    SELECT idempotência deferred (vazio).
    for (let m = 0; m < 3; m++) {
      dbMock.enqueue([]); // exists fatura
      dbMock.enqueue([]); // existing deferred
    }

    const result = await acceptPlanFinancials(200);

    // 8 sessões/mês × R$80 = R$640/mês
    expect(result.invoicesCreated).toBe(3);
    expect(result.totalImmediateCharge).toBe("640.00");

    const inserts = dbMock.inserts();
    expect(inserts).toHaveLength(3);
    for (const ins of inserts) {
      expect(ins.transactionType).toBe("faturaPlanoAvulsoMensal");
      expect(ins.amount).toBe("640.00");
      expect(ins.recognitionCreditsTotal).toBe(8);
      expect(ins.priceSource).toBe("plano_avulso_estimado");
      expect(ins.treatmentPlanId).toBe(200);
      expect(ins.treatmentPlanProcedureId).toBe(1);
    }
    expect(inserts[0].planMonthRef).toBe("2026-05-01");
    expect(inserts[1].planMonthRef).toBe("2026-06-01");
    expect(inserts[2].planMonthRef).toBe("2026-07-01");

    // 1 deferred_receivable por fatura.
    expect(postDeferredReceivableMock).toHaveBeenCalledTimes(3);
    const firstCall = postDeferredReceivableMock.mock.calls[0][0] as any;
    expect(firstCall.amount).toBe(640);
    expect(firstCall.eventType).toBeUndefined(); // default
    expect(firstCall.revenueAccountCode).toBe("4.1.1");
  });

  it("item avulso com unitPrice = 0 (após desconto) → skip silencioso", async () => {
    dbMock.enqueue([basePlan]);
    dbMock.enqueue([
      {
        id: 2,
        kind: "avulso",
        procedureId: 50,
        packageId: null,
        unitPrice: "30.00",
        unitMonthlyPrice: null,
        discount: "30",
        totalSessions: null,
        sessionsPerWeek: 1,
        packageType: null,
        packageBillingDay: null,
        packageProcedureId: null,
        packagePaymentMode: null,
        packageName: null,
        packageMonthlyPrice: null,
      },
    ]);
    dbMock.enqueue([{ name: "Fulano" }]);

    const result = await acceptPlanFinancials(200);

    expect(result.invoicesCreated).toBe(0);
    expect(result.totalImmediateCharge).toBe("0.00");
    expect(dbMock.inserts()).toHaveLength(0);
    expect(postDeferredReceivableMock).not.toHaveBeenCalled();
  });

  it("item avulso sem procedureId → skip silencioso", async () => {
    dbMock.enqueue([basePlan]);
    dbMock.enqueue([
      {
        id: 3,
        kind: "avulso",
        procedureId: null,
        packageId: null,
        unitPrice: "100.00",
        unitMonthlyPrice: null,
        discount: "0",
        totalSessions: null,
        sessionsPerWeek: 1,
        packageType: null,
        packageBillingDay: null,
        packageProcedureId: null,
        packagePaymentMode: null,
        packageName: null,
        packageMonthlyPrice: null,
      },
    ]);
    dbMock.enqueue([{ name: "Fulano" }]);

    const result = await acceptPlanFinancials(200);

    expect(result.invoicesCreated).toBe(0);
    expect(postDeferredReceivableMock).not.toHaveBeenCalled();
  });

  it("idempotência: fatura já existente para o mesmo (item, mês) → não duplica nem reposta deferred", async () => {
    dbMock.enqueue([basePlan]);
    dbMock.enqueue([
      {
        id: 4,
        kind: "avulso",
        procedureId: 50,
        packageId: null,
        unitPrice: "80.00",
        unitMonthlyPrice: null,
        discount: "0",
        totalSessions: null,
        sessionsPerWeek: 1, // 4 sessões/mês × R$80 = R$320
        packageType: null,
        packageBillingDay: null,
        packageProcedureId: null,
        packagePaymentMode: null,
        packageName: null,
        packageMonthlyPrice: null,
      },
    ]);
    dbMock.enqueue([{ name: "Fulano" }]);
    dbMock.enqueue([baseProcedure]);
    // Para cada mês: fatura JÁ EXISTE (id 9000+m), e deferred TAMBÉM já existe.
    for (let m = 0; m < 3; m++) {
      dbMock.enqueue([{ id: 9000 + m }]); // fatura existe
      dbMock.enqueue([{ id: 12345 + m }]); // deferred já postado
    }

    const result = await acceptPlanFinancials(200);

    expect(result.invoicesCreated).toBe(0);
    expect(dbMock.inserts()).toHaveLength(0);
    expect(postDeferredReceivableMock).not.toHaveBeenCalled();
  });
});
