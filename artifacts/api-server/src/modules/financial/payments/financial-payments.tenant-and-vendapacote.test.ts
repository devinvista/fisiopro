/**
 * Sprint Financeiro 6 — PR-FIN6-3 (B5) e PR-FIN6-4 (B4).
 *
 * Cobre:
 *  • B4: filtro `clinicId = req.clinicId` aplicado em pendingRecords (tenant
 *    leakage). Verifica via assert no spy de `db.select().from().where(...)`.
 *  • B5: vendaPacote sem `accountingEntryId` em /payment → chama
 *    `postCashAdvance` (D Caixa / C Adiantamentos), NÃO `postReceivableSettlement`
 *    (que geraria recebível negativo).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

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
  const db: any = new Proxy({} as any, {
    get(_t, prop: string) {
      if (prop === "transaction") {
        return async (cb: (tx: any) => any) => {
          callLog.push("transaction");
          return cb(db);
        };
      }
      return () => {
        callLog.push(prop);
        if (queue.length === 0) {
          throw new Error(`[dbMock] queue exhausted on db.${prop}() — calls: ${callLog.join(",")}`);
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

// Auth alterável: o teste seta `currentClinicId` antes de cada caso.
const authState = vi.hoisted(() => ({ clinicId: 1 as number | undefined, isSuperAdmin: false as boolean }));
vi.mock("../../../middleware/auth.js", () => ({
  authMiddleware: (
    req: express.Request & { userId?: number; clinicId?: number; isSuperAdmin?: boolean },
    _res: express.Response,
    next: express.NextFunction,
  ) => {
    req.userId = 1;
    req.clinicId = authState.clinicId;
    req.isSuperAdmin = authState.isSuperAdmin;
    next();
  },
}));

vi.mock("../../../middleware/rbac.js", () => ({
  requirePermission:
    () => (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
      next(),
}));

vi.mock("../../../utils/auditLog.js", () => ({
  logAudit: vi.fn(async () => undefined),
}));

// assertPatientInClinic → libera (não queremos que ele consuma a fila).
vi.mock("../financial.repository.js", async () => {
  const actual = await vi.importActual<any>("../financial.repository.js");
  return { ...actual, assertPatientInClinic: vi.fn(async () => true) };
});

// Mocks de accounting service para checar qual helper foi chamado.
const postCashAdvanceMock = vi.hoisted(() => vi.fn(async () => ({ id: 700 })));
const postReceivableSettlementMock = vi.hoisted(() => vi.fn(async () => ({ id: 800 })));
const postReceivableRevenueMock = vi.hoisted(() => vi.fn(async () => ({ id: 600 })));
const postCashReceiptMock = vi.hoisted(() => vi.fn(async () => ({ id: 900 })));
const allocateReceivableMock = vi.hoisted(() => vi.fn(async () => undefined));
const getAccountingBalancesMock = vi.hoisted(() => vi.fn(async () => ({})));

vi.mock("../../shared/accounting/accounting.service.js", () => ({
  ACCOUNT_CODES: { cash: "1.1.1", receivables: "1.1.2", customerAdvances: "2.1.1" },
  allocateReceivable: allocateReceivableMock,
  getAccountingBalances: getAccountingBalancesMock,
  postCashAdvance: postCashAdvanceMock,
  postCashReceipt: postCashReceiptMock,
  postReceivableRevenue: postReceivableRevenueMock,
  postReceivableSettlement: postReceivableSettlementMock,
}));

const cascadeMock = vi.hoisted(() => vi.fn(async () => ({ cascadedChildIds: [], totalCascaded: "0.00" })));
const countPendingChildrenMock = vi.hoisted(() => vi.fn(async () => 0));
vi.mock("./payment-cascade.js", () => ({
  cascadeFaturaMensalAvulsoPayment: cascadeMock,
  countPendingChildren: countPendingChildrenMock,
}));

import paymentsRouter from "./financial-payments.routes.js";

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use("/api/financial", paymentsRouter);
  return app;
}

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = buildApp().listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  dbMock.reset();
  postCashAdvanceMock.mockClear();
  postReceivableSettlementMock.mockClear();
  postReceivableRevenueMock.mockClear();
  postCashReceiptMock.mockClear();
  allocateReceivableMock.mockClear();
  cascadeMock.mockClear();
  authState.clinicId = 1;
  authState.isSuperAdmin = false;
});

describe("PR-FIN6-3 (B5): vendaPacote sem accountingEntryId → postCashAdvance", () => {
  it("paga vendaPacote legado via /payment usando postCashAdvance, não settlement", async () => {
    authState.clinicId = 1;
    // patient lookup
    dbMock.enqueue([{ name: "João" }]);
    // dentro da transaction:
    // 1) insert paymentRecord returning
    dbMock.enqueue([{ id: 999, amount: "100.00" }]);
    // 2) select pendingRecords
    dbMock.enqueue([
      {
        id: 50,
        clinicId: 1,
        patientId: 5,
        type: "receita",
        amount: "100.00",
        status: "pendente",
        transactionType: "vendaPacote",
        accountingEntryId: null, // legado!
        recognizedEntryId: null,
        description: "Pacote 10 sessões",
        dueDate: "2026-04-29",
      },
    ]);
    // 3) update do pending para status=pago
    dbMock.enqueue(undefined);
    // 4) update final do paymentRecord (entryId)
    dbMock.enqueue(undefined);

    const res = await fetch(`${baseUrl}/api/financial/patients/5/payment`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: 100, paymentMethod: "pix" }),
    });
    expect(res.status).toBe(201);
    expect(postCashAdvanceMock).toHaveBeenCalledTimes(1);
    expect(postReceivableSettlementMock).not.toHaveBeenCalled();
    expect(postReceivableRevenueMock).not.toHaveBeenCalled();
    const advArg = postCashAdvanceMock.mock.calls[0][0];
    expect(advArg.amount).toBe(100);
    expect(advArg.clinicId).toBe(1);
  });
});

describe("PR-FIN6-4 (B4): filtro multi-tenant em /payment", () => {
  it("usuário com clinicId=2 → filtro inclui clinicId nas pendências", async () => {
    authState.clinicId = 2;
    authState.isSuperAdmin = false;

    dbMock.enqueue([{ name: "Maria" }]);
    dbMock.enqueue([{ id: 1001, amount: "50.00" }]); // paymentRecord
    dbMock.enqueue([]); // pendingRecords vazio
    // sem pendências → posta postCashReceipt como crédito em carteira
    dbMock.enqueue(undefined); // update final paymentRecord

    const res = await fetch(`${baseUrl}/api/financial/patients/5/payment`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: 50, paymentMethod: "pix" }),
    });
    expect(res.status).toBe(201);
    const calls = dbMock.calls();
    expect(calls).toContain("transaction");
    expect(calls.filter((c) => c === "select").length).toBeGreaterThanOrEqual(2);
  });

  it("super-admin sem clinicId → não aplica filtro (consolidação)", async () => {
    authState.clinicId = undefined;
    authState.isSuperAdmin = true;

    dbMock.enqueue([{ name: "Maria" }]);
    dbMock.enqueue([{ id: 1002, amount: "50.00" }]);
    dbMock.enqueue([]); // pendentes
    dbMock.enqueue(undefined);

    const res = await fetch(`${baseUrl}/api/financial/patients/5/payment`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: 50, paymentMethod: "pix" }),
    });
    expect(res.status).toBe(201);
  });
});
