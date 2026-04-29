import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDbMock } from "../../shared/test-utils/db-mock.js";

// Hoisted: precisa estar disponível antes de o vi.mock executar.
const dbMock = vi.hoisted(() => {
  // Re-import dentro do hoist seria circular; recriamos a fábrica inline.
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
        if (queue.length === 0) throw new Error(`[dbMock] queue exhausted on db.${prop}()`);
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

// Dataset de hoje (BRT). Importa todayBRT real para alinhar com a função em teste.
import { todayBRT, addDays } from "../../../utils/dateUtils.js";
import { runSubscriptionCheck } from "./subscription.service.js";

const today = todayBRT();
const yesterday = addDays(today, -1);
const tomorrow = addDays(today, 1);
const longAgo = addDays(today, -100); // bem além do grace period (7d)

function row(sub: Partial<any>, clinic = { id: 1, name: "Clínica Teste" }, plan = { id: 10 }) {
  return {
    sub: {
      id: 1,
      clinicId: 1,
      planId: 10,
      status: "active",
      paymentStatus: "paid",
      trialEndDate: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      ...sub,
    },
    clinic,
    plan,
  };
}

describe("subscriptionService.runSubscriptionCheck", () => {
  beforeEach(() => dbMock.reset());

  it("converte trial expirado pago em assinatura ativa", async () => {
    dbMock.enqueue([
      row({ status: "trial", paymentStatus: "paid", trialEndDate: yesterday }),
    ]);
    dbMock.enqueue(undefined); // update

    const result = await runSubscriptionCheck();

    expect(result.trialsExpired).toBe(1);
    expect(result.markedOverdue).toBe(0);
    expect(result.suspended).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.details[0]).toMatchObject({ action: "trial_converted" });
  });

  it("marca trial expirado sem pagamento como overdue", async () => {
    dbMock.enqueue([
      row({ status: "trial", paymentStatus: "pending", trialEndDate: yesterday }),
    ]);
    dbMock.enqueue(undefined); // update

    const result = await runSubscriptionCheck();

    expect(result.trialsExpired).toBe(1);
    expect(result.details[0]).toMatchObject({ action: "trial_expired_overdue" });
  });

  it("não toca em trial ainda dentro da validade", async () => {
    dbMock.enqueue([
      row({ status: "trial", paymentStatus: "pending", trialEndDate: tomorrow }),
    ]);
    // sem update enfileirado — se for chamado, "queue exhausted" quebra o teste.

    const result = await runSubscriptionCheck();

    expect(result.trialsExpired).toBe(0);
    expect(result.markedOverdue).toBe(0);
    expect(result.suspended).toBe(0);
    expect(dbMock.pending()).toBe(0);
  });

  it("renova período de assinatura ativa paga com período expirado e marca como overdue", async () => {
    dbMock.enqueue([
      row({
        status: "active",
        paymentStatus: "paid",
        currentPeriodStart: addDays(today, -45),
        currentPeriodEnd: yesterday,
      }),
    ]);
    dbMock.enqueue(undefined); // update

    const result = await runSubscriptionCheck();

    expect(result.renewed).toBe(1);
    expect(result.markedOverdue).toBe(0);
    expect(result.details[0]).toMatchObject({ action: "period_renewed" });
    // O reason traz a nova janela: yesterday → yesterday+30
    expect(result.details[0].reason).toContain(yesterday);
    expect(result.details[0].reason).toContain(addDays(yesterday, 30));
  });

  it("não renova quando período ainda não venceu", async () => {
    dbMock.enqueue([
      row({
        status: "active",
        paymentStatus: "paid",
        currentPeriodStart: yesterday,
        currentPeriodEnd: tomorrow,
      }),
    ]);
    const result = await runSubscriptionCheck();
    expect(result.renewed).toBe(0);
    expect(dbMock.pending()).toBe(0);
  });

  it("marca como overdue assinatura ativa com paymentStatus pending e período vencido", async () => {
    dbMock.enqueue([
      row({
        status: "active",
        paymentStatus: "pending",
        currentPeriodEnd: yesterday,
      }),
    ]);
    dbMock.enqueue(undefined); // update

    const result = await runSubscriptionCheck();

    expect(result.markedOverdue).toBe(1);
    expect(result.details[0]).toMatchObject({ action: "marked_overdue" });
  });

  it("suspende assinatura overdue além do grace period (7 dias)", async () => {
    dbMock.enqueue([
      row({
        status: "active",
        paymentStatus: "overdue",
        currentPeriodEnd: longAgo, // > 7d atrás
      }),
    ]);
    dbMock.enqueue(undefined); // update

    const result = await runSubscriptionCheck();

    expect(result.suspended).toBe(1);
    expect(result.details[0]).toMatchObject({ action: "suspended" });
    expect(result.details[0].reason).toContain("7 dias");
  });

  it("não suspende assinatura overdue ainda dentro do grace period", async () => {
    dbMock.enqueue([
      row({
        status: "active",
        paymentStatus: "overdue",
        currentPeriodEnd: addDays(today, -3), // 3 dias < grace 7d
      }),
    ]);
    const result = await runSubscriptionCheck();
    expect(result.suspended).toBe(0);
    expect(dbMock.pending()).toBe(0);
  });

  it("ignora assinaturas free e paid sem renovação pendente", async () => {
    dbMock.enqueue([
      row({ status: "active", paymentStatus: "free", currentPeriodEnd: tomorrow }),
      row({ status: "active", paymentStatus: "paid", currentPeriodEnd: tomorrow }),
    ]);
    const result = await runSubscriptionCheck();
    expect(result.trialsExpired + result.renewed + result.markedOverdue + result.suspended).toBe(0);
    expect(result.errors).toBe(0);
  });

  it("conta erros sem abortar o batch", async () => {
    // 2 linhas: a 1ª causa erro no update, a 2ª é processada normalmente.
    dbMock.enqueue([
      row({ id: 1, status: "trial", paymentStatus: "paid", trialEndDate: yesterday }),
      row({ id: 2, status: "trial", paymentStatus: "paid", trialEndDate: yesterday }),
    ]);
    dbMock.enqueue(() => {
      throw new Error("DB falhou");
    });
    dbMock.enqueue(undefined); // update da 2ª linha

    const result = await runSubscriptionCheck();
    expect(result.errors).toBe(1);
    expect(result.trialsExpired).toBe(1);
  });
});
