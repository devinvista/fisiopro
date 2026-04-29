import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

// dbMock: cada chamada top-level db.<verb>(...) consome um item da fila.
// Todas as chamadas encadeadas (.from, .where, .innerJoin, .values, .set,
// .returning, .limit) retornam o mesmo proxy thenable que resolve para o
// resultado enfileirado.
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
      return () => {
        callLog.push(prop);
        if (queue.length === 0) {
          throw new Error(`[dbMock] queue exhausted on db.${prop}() — calls so far: ${callLog.join(",")}`);
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
    },
    pending: () => queue.length,
    calls: () => [...callLog],
  };
});

vi.mock("@workspace/db", async () => {
  const actual = await vi.importActual<any>("@workspace/db");
  return { ...actual, db: dbMock.db };
});

// Auth: super-admin pula as verificações de ownership (que fazem suas próprias
// queries no DB). Isso mantém a fila enxuta e foca o teste na regra de aceite.
vi.mock("../../../middleware/auth.js", () => ({
  authMiddleware: (
    req: express.Request & { userId?: number; clinicId?: number; isSuperAdmin?: boolean },
    _res: express.Response,
    next: express.NextFunction,
  ) => {
    req.userId = 1;
    req.clinicId = undefined;
    req.isSuperAdmin = true;
    next();
  },
}));

vi.mock("../../../middleware/rbac.js", () => ({
  requirePermission:
    () => (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
      next(),
}));

import treatmentPlanProceduresRouter from "./treatment-plan-procedures.routes.js";

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use("/api/treatment-plans/:planId/procedures", treatmentPlanProceduresRouter);
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
});

const acceptedAt = new Date("2026-04-20T12:00:00Z");

describe("POST /api/treatment-plans/:planId/procedures (bloqueio pós-aceite)", () => {
  it("retorna 409 quando o plano já foi aceito", async () => {
    // existência do plano (com acceptedAt preenchido)
    dbMock.enqueue([{ id: 10, acceptedAt }]);

    const res = await fetch(`${baseUrl}/api/treatment-plans/10/procedures`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ procedureId: 5, sessionsPerWeek: 2, totalSessions: 10 }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("plan_already_accepted");
    expect(body.message).toMatch(/2026-04-20/);
    expect(body.message).toMatch(/renegoc/i);
    // Nenhuma INSERT deve ter sido feita.
    expect(dbMock.calls()).toEqual(["select"]);
  });

  it("permite inserir quando o plano ainda é rascunho (acceptedAt = null)", async () => {
    dbMock.enqueue([{ id: 10, acceptedAt: null }]);
    dbMock.enqueue([{ id: 99, treatmentPlanId: 10, procedureId: 5 }]); // insert.returning

    const res = await fetch(`${baseUrl}/api/treatment-plans/10/procedures`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ procedureId: 5, sessionsPerWeek: 2, totalSessions: 10 }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe(99);
    expect(dbMock.calls()).toEqual(["select", "insert"]);
  });
});

describe("PUT /api/treatment-plans/:planId/procedures/:id (bloqueio pós-aceite)", () => {
  const existingItem = {
    id: 50,
    treatmentPlanId: 10,
    procedureId: 5,
    packageId: null,
    sessionsPerWeek: 2,
    totalSessions: 10,
    unitPrice: "100.00",
    unitMonthlyPrice: null,
    discount: "0",
    priority: 1,
    notes: null,
    weekDays: null,
    defaultStartTime: null,
    defaultProfessionalId: null,
    scheduleId: null,
    sessionDurationMinutes: null,
  };

  it("rejeita com 409 ao tentar alterar valor unitário em plano aceito", async () => {
    dbMock.enqueue([{ item: existingItem, acceptedAt }]);

    const res = await fetch(`${baseUrl}/api/treatment-plans/10/procedures/50`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ unitPrice: 200 }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("plan_already_accepted");
    expect(body.message).toMatch(/valor unitário/i);
    // Nenhum UPDATE deve ter sido feito.
    expect(dbMock.calls()).toEqual(["select"]);
  });

  it("rejeita com 409 ao tentar alterar total de sessões em plano aceito", async () => {
    dbMock.enqueue([{ item: existingItem, acceptedAt }]);

    const res = await fetch(`${baseUrl}/api/treatment-plans/10/procedures/50`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ totalSessions: 30 }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("plan_already_accepted");
    expect(body.message).toMatch(/total de sessões/i);
    expect(dbMock.calls()).toEqual(["select"]);
  });

  it("rejeita com 409 ao tentar trocar o procedimento em plano aceito", async () => {
    dbMock.enqueue([{ item: existingItem, acceptedAt }]);

    const res = await fetch(`${baseUrl}/api/treatment-plans/10/procedures/50`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ procedureId: 999 }),
    });

    expect(res.status).toBe(409);
    expect(dbMock.calls()).toEqual(["select"]);
  });

  it("permite alterar campos operacionais (agenda, profissional) em plano aceito", async () => {
    dbMock.enqueue([{ item: existingItem, acceptedAt }]);
    dbMock.enqueue([{ ...existingItem, scheduleId: 7, weekDays: "1,3,5", defaultStartTime: "08:00" }]);

    const res = await fetch(`${baseUrl}/api/treatment-plans/10/procedures/50`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scheduleId: 7,
        weekDays: "1,3,5",
        defaultStartTime: "08:00",
        defaultProfessionalId: 42,
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scheduleId).toBe(7);
    expect(dbMock.calls()).toEqual(["select", "update"]);
  });

  it("aceita reenvio idêntico de campo comercial (no-op) em plano aceito", async () => {
    dbMock.enqueue([{ item: existingItem, acceptedAt }]);
    // Enviando mesmo valor não dispara UPDATE (updateData fica vazio → retorna existing).
    const res = await fetch(`${baseUrl}/api/treatment-plans/10/procedures/50`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ unitPrice: "100.00", totalSessions: 10, discount: "0" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(50);
    expect(dbMock.calls()).toEqual(["select"]);
  });

  it("permite alterar valor unitário quando plano ainda é rascunho", async () => {
    dbMock.enqueue([{ item: existingItem, acceptedAt: null }]);
    dbMock.enqueue([{ ...existingItem, unitPrice: "150.00" }]);

    const res = await fetch(`${baseUrl}/api/treatment-plans/10/procedures/50`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ unitPrice: 150 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.unitPrice).toBe("150.00");
    expect(dbMock.calls()).toEqual(["select", "update"]);
  });
});

describe("DELETE /api/treatment-plans/:planId/procedures/:id (bloqueio pós-aceite)", () => {
  const baseItem = {
    id: 50,
    treatmentPlanId: 10,
    procedureId: 5,
    packageId: null,
    sessionsPerWeek: 2,
    totalSessions: 10,
    unitPrice: "100.00",
    unitMonthlyPrice: null,
    discount: "0",
    priority: 1,
    notes: null,
    weekDays: null,
    defaultStartTime: null,
    defaultProfessionalId: null,
    scheduleId: null,
    sessionDurationMinutes: null,
  };

  it("retorna 409 quando o plano já foi aceito", async () => {
    dbMock.enqueue([{ item: baseItem, acceptedAt }]);

    const res = await fetch(`${baseUrl}/api/treatment-plans/10/procedures/50`, {
      method: "DELETE",
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("plan_already_accepted");
    expect(body.message).toMatch(/renegoc/i);
    // Nenhum DELETE deve ter sido feito.
    expect(dbMock.calls()).toEqual(["select"]);
  });

  it("remove com sucesso quando o plano ainda é rascunho", async () => {
    dbMock.enqueue([{ item: baseItem, acceptedAt: null }]);
    dbMock.enqueue(undefined); // delete

    const res = await fetch(`${baseUrl}/api/treatment-plans/10/procedures/50`, {
      method: "DELETE",
    });

    expect(res.status).toBe(204);
    expect(dbMock.calls()).toEqual(["select", "delete"]);
  });
});
