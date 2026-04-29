/**
 * Sprint Financeiro 6 — PR-FIN6-1, PR-FIN6-2.
 *
 * Cobre:
 *  • B1 (DELETE seguro): receita já contabilizada exige `reversalReason`
 *    e dispara `postReversal`.
 *  • B2 (PATCH bloqueado): editar `amount`/`type`/`status` em registro
 *    contabilizado retorna 409 com `RECORD_ALREADY_POSTED`.
 *  • B3 (cascade + promote em /status): faturaMensalAvulso paga via
 *    `PATCH /:id/status` cascateia filhos; faturaPlano promove créditos.
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

vi.mock("../../../middleware/auth.js", () => ({
  authMiddleware: (
    req: express.Request & { userId?: number; clinicId?: number; isSuperAdmin?: boolean },
    _res: express.Response,
    next: express.NextFunction,
  ) => {
    req.userId = 1;
    req.clinicId = 1;
    req.isSuperAdmin = false;
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

const postReversalMock = vi.hoisted(() => vi.fn(async () => ({ id: 999 })));
const postReceivableSettlementMock = vi.hoisted(() => vi.fn(async () => ({ id: 555 })));
const allocateReceivableMock = vi.hoisted(() => vi.fn(async () => undefined));
const postReceivableRevenueMock = vi.hoisted(() => vi.fn(async () => ({ id: 444 })));

vi.mock("../../shared/accounting/accounting.service.js", () => ({
  postReversal: postReversalMock,
  postReceivableSettlement: postReceivableSettlementMock,
  allocateReceivable: allocateReceivableMock,
  postReceivableRevenue: postReceivableRevenueMock,
}));

const cascadeMock = vi.hoisted(() => vi.fn(async () => ({ cascadedChildIds: [], totalCascaded: "0.00" })));
vi.mock("../payments/payment-cascade.js", () => ({
  cascadeFaturaMensalAvulsoPayment: cascadeMock,
}));

const promotePrepaidMock = vi.hoisted(() => vi.fn(async () => ({ promotedCount: 0 })));
vi.mock("../../clinical/medical-records/treatment-plans.materialization.js", () => ({
  promotePrepaidCreditsForFinancialRecord: promotePrepaidMock,
}));

import financialRecordsRouter from "./financial-records.routes.js";

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use("/api/financial", financialRecordsRouter);
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
  postReversalMock.mockClear();
  postReceivableSettlementMock.mockClear();
  allocateReceivableMock.mockClear();
  postReceivableRevenueMock.mockClear();
  cascadeMock.mockClear();
  promotePrepaidMock.mockClear();
});

describe("PR-FIN6-1 (B2): PATCH /records/:id em registro contabilizado", () => {
  it("retorna 409 RECORD_ALREADY_POSTED ao tentar alterar amount", async () => {
    dbMock.enqueue([
      {
        id: 42,
        clinicId: 1,
        type: "receita",
        amount: "100.00",
        status: "pendente",
        accountingEntryId: 1234,
        recognizedEntryId: 1234,
        settlementEntryId: null,
      },
    ]);

    const res = await fetch(`${baseUrl}/api/financial/records/42`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: 200 }),
    });
    expect(res.status).toBe(409);
    const body = await res.json() as any;
    expect(body.code).toBe("RECORD_ALREADY_POSTED");
    expect(body.lockedFields).toContain("amount");
    expect(body.message).toMatch(/estorno/i);
  });

  it("permite atualizar descricao em registro contabilizado", async () => {
    dbMock.enqueue([
      {
        id: 42,
        clinicId: 1,
        type: "receita",
        amount: "100.00",
        status: "pago",
        description: "antiga",
        accountingEntryId: 1234,
      },
    ]);
    dbMock.enqueue([{ id: 42, description: "nova" }]); // update.returning

    const res = await fetch(`${baseUrl}/api/financial/records/42`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description: "nova" }),
    });
    expect(res.status).toBe(200);
  });
});

describe("PR-FIN6-1 (B1): DELETE /records/:id receita contabilizada", () => {
  it("retorna 400 REVERSAL_REASON_REQUIRED se receita tem accountingEntry e nao envia motivo", async () => {
    dbMock.enqueue([
      {
        id: 7,
        clinicId: 1,
        type: "receita",
        amount: "150.00",
        status: "pago",
        description: "Sessão",
        accountingEntryId: 800,
        recognizedEntryId: 800,
        settlementEntryId: 801,
      },
    ]);

    const res = await fetch(`${baseUrl}/api/financial/records/7`, { method: "DELETE" });
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.code).toBe("REVERSAL_REASON_REQUIRED");
    expect(postReversalMock).not.toHaveBeenCalled();
  });

  it("estorna via postReversal quando reversalReason é informado", async () => {
    dbMock.enqueue([
      {
        id: 7,
        clinicId: 1,
        type: "receita",
        amount: "150.00",
        status: "pago",
        description: "Sessão",
        accountingEntryId: 800,
        recognizedEntryId: 800,
        settlementEntryId: 801,
        patientId: 5,
      },
    ]);
    // dentro da transaction: 1) update record, postReversal é mock
    dbMock.enqueue(undefined); // update inside tx

    const res = await fetch(`${baseUrl}/api/financial/records/7?reversalReason=Cobranca%20duplicada`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    expect(postReversalMock).toHaveBeenCalledTimes(1);
    // Ordem de prioridade no código: accountingEntryId → recognizedEntryId → settlementEntryId
    expect(postReversalMock.mock.calls[0][0]).toBe(800);
  });

  it("é idempotente: receita já estornada retorna 204 sem reversal", async () => {
    dbMock.enqueue([
      {
        id: 7,
        clinicId: 1,
        type: "receita",
        status: "estornado",
        amount: "150.00",
        accountingEntryId: 800,
      },
    ]);
    const res = await fetch(`${baseUrl}/api/financial/records/7`, { method: "DELETE" });
    expect(res.status).toBe(204);
    expect(postReversalMock).not.toHaveBeenCalled();
  });

  it("despesa: DELETE físico sem exigir reversalReason", async () => {
    dbMock.enqueue([
      {
        id: 9,
        clinicId: 1,
        type: "despesa",
        status: "pago",
        amount: "30.00",
        description: "Aluguel",
      },
    ]);
    dbMock.enqueue(undefined); // delete

    const res = await fetch(`${baseUrl}/api/financial/records/9`, { method: "DELETE" });
    expect(res.status).toBe(204);
    expect(postReversalMock).not.toHaveBeenCalled();
  });
});

describe("PR-FIN6-2 (B3): PATCH /records/:id/status pago dispara cascade/promote", () => {
  it("faturaMensalAvulso paga → chama cascadeFaturaMensalAvulsoPayment", async () => {
    // existing
    dbMock.enqueue([
      {
        id: 100,
        clinicId: 1,
        patientId: 5,
        type: "receita",
        amount: "200.00",
        status: "pendente",
        transactionType: "faturaMensalAvulso",
        accountingEntryId: 1000,
        recognizedEntryId: 1000,
      },
    ]);
    // dentro do transaction:
    // 1) update record returning [updated]
    dbMock.enqueue([{ id: 100, status: "pago" }]);
    // 2) update settlementEntryId
    dbMock.enqueue(undefined);

    const res = await fetch(`${baseUrl}/api/financial/records/100/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "pago", paymentDate: "2026-04-29", paymentMethod: "pix" }),
    });
    expect(res.status).toBe(200);
    expect(postReceivableSettlementMock).toHaveBeenCalledTimes(1);
    expect(allocateReceivableMock).toHaveBeenCalledTimes(1);
    expect(cascadeMock).toHaveBeenCalledTimes(1);
    const cascadeArg = cascadeMock.mock.calls[0][0];
    expect(cascadeArg.parent.id).toBe(100);
    expect(cascadeArg.settlementEntryId).toBe(555);
    expect(promotePrepaidMock).not.toHaveBeenCalled();
  });

  it("faturaPlano paga → chama promotePrepaidCreditsForFinancialRecord", async () => {
    dbMock.enqueue([
      {
        id: 200,
        clinicId: 1,
        patientId: 5,
        type: "receita",
        amount: "300.00",
        status: "pendente",
        transactionType: "faturaPlano",
        accountingEntryId: 2000,
      },
    ]);
    dbMock.enqueue([{ id: 200, status: "pago" }]); // update returning
    dbMock.enqueue(undefined); // update settlementEntryId

    const res = await fetch(`${baseUrl}/api/financial/records/200/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "pago", paymentDate: "2026-04-29", paymentMethod: "pix" }),
    });
    expect(res.status).toBe(200);
    expect(promotePrepaidMock).toHaveBeenCalledTimes(1);
    expect(promotePrepaidMock.mock.calls[0][0]).toBe(200);
    expect(cascadeMock).not.toHaveBeenCalled();
  });
});
