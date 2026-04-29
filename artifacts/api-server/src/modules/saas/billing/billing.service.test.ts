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
      return () => {
        callLog.push(prop);
        if (queue.length === 0) {
          throw new Error(`[dbMock] queue exhausted on db.${prop}() — calls so far: ${callLog.join(",")}`);
        }
        const next = queue.shift();
        if (next && typeof next === "object" && "__throws" in next) throw (next as any).__throws;
        return makeChain(typeof next === "function" ? next() : next);
      };
    },
  });
  return {
    db,
    enqueue: (...rs: any[]) => queue.push(...rs),
    enqueueThrow: (err: unknown) => queue.push({ __throws: err }),
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

vi.mock("../saas-plans/saas-plans.service.js", () => ({
  applyPaymentToSubscription: vi.fn(async () => undefined),
}));

import { processWebhookEvent } from "./billing.service.js";
import { applyPaymentToSubscription } from "../saas-plans/saas-plans.service.js";

const baseSub = {
  id: 1,
  clinicId: 42,
  planId: 10,
  status: "active",
  paymentStatus: "overdue",
  billingMode: "asaas_card",
  asaasSubscriptionId: "sub_xyz",
};

describe("billingService.processWebhookEvent", () => {
  beforeEach(() => {
    dbMock.reset();
    vi.clearAllMocks();
  });

  it("aplica PAYMENT_CONFIRMED na assinatura via applyPaymentToSubscription", async () => {
    dbMock.enqueue(undefined); // insert (sucesso)
    dbMock.enqueue([baseSub]); // select sub by asaas id
    dbMock.enqueue(undefined); // update do finalize

    const outcome = await processWebhookEvent({
      id: "evt_001",
      event: "PAYMENT_CONFIRMED",
      payment: {
        id: "pay_1",
        customer: "cus_1",
        subscription: "sub_xyz",
        value: 99,
        status: "CONFIRMED",
        dueDate: "2026-04-26",
        paymentDate: "2026-04-25",
      },
    } as any);

    expect(outcome.result).toBe("applied");
    expect(outcome.clinicId).toBe(42);
    expect(applyPaymentToSubscription).toHaveBeenCalledWith(1, expect.any(Date));
  });

  it("descarta evento duplicado quando UNIQUE event_id viola", async () => {
    dbMock.enqueueThrow(Object.assign(new Error("dup"), { code: "23505" }));

    const outcome = await processWebhookEvent({
      id: "evt_dup",
      event: "PAYMENT_CONFIRMED",
      payment: { id: "p", customer: "c", subscription: "sub_xyz", value: 1, status: "CONFIRMED", dueDate: "2026-04-26" },
    } as any);

    expect(outcome.result).toBe("duplicate");
    expect(applyPaymentToSubscription).not.toHaveBeenCalled();
  });

  it("ignora payload sem subscription", async () => {
    dbMock.enqueue(undefined); // insert
    dbMock.enqueue(undefined); // finalize update

    const outcome = await processWebhookEvent({
      id: "evt_002",
      event: "PAYMENT_CONFIRMED",
      payment: { id: "p", customer: "c", value: 1, status: "CONFIRMED", dueDate: "2026-04-26" },
    } as any);

    expect(outcome.result).toBe("ignored");
    expect(applyPaymentToSubscription).not.toHaveBeenCalled();
  });

  it("retorna no_match quando assinatura Asaas não está vinculada a nenhuma clínica", async () => {
    dbMock.enqueue(undefined); // insert
    dbMock.enqueue([]); // select — nada encontrado
    dbMock.enqueue(undefined); // finalize

    const outcome = await processWebhookEvent({
      id: "evt_003",
      event: "PAYMENT_CONFIRMED",
      payment: { id: "p", customer: "c", subscription: "sub_unknown", value: 1, status: "CONFIRMED", dueDate: "2026-04-26" },
    } as any);

    expect(outcome.result).toBe("no_match");
  });

  it("marca paymentStatus=overdue em PAYMENT_OVERDUE", async () => {
    dbMock.enqueue(undefined); // insert
    dbMock.enqueue([baseSub]); // select
    dbMock.enqueue(undefined); // update sub
    dbMock.enqueue(undefined); // finalize

    const outcome = await processWebhookEvent({
      id: "evt_overdue",
      event: "PAYMENT_OVERDUE",
      payment: { id: "p", customer: "c", subscription: "sub_xyz", value: 99, status: "OVERDUE", dueDate: "2026-04-20" },
    } as any);

    expect(outcome.result).toBe("applied");
    expect(outcome.clinicId).toBe(42);
    expect(applyPaymentToSubscription).not.toHaveBeenCalled();
  });

  it("desvincula clínica em SUBSCRIPTION_DELETED", async () => {
    dbMock.enqueue(undefined); // insert
    dbMock.enqueue([{ clinicId: 42 }]); // select sub
    dbMock.enqueue(undefined); // update clinic_subscriptions (clear asaas_*)
    dbMock.enqueue(undefined); // finalize

    const outcome = await processWebhookEvent({
      id: "evt_subdel",
      event: "SUBSCRIPTION_DELETED",
      subscription: { id: "sub_xyz", customer: "cus_1", status: "INACTIVE" },
    } as any);

    expect(outcome.result).toBe("applied");
    expect(outcome.clinicId).toBe(42);
  });

  it("descarta eventos não rastreados (ex.: PAYMENT_CREATED)", async () => {
    dbMock.enqueue(undefined); // insert
    dbMock.enqueue([baseSub]); // select
    dbMock.enqueue(undefined); // finalize

    const outcome = await processWebhookEvent({
      id: "evt_created",
      event: "PAYMENT_CREATED",
      payment: { id: "p", customer: "c", subscription: "sub_xyz", value: 1, status: "PENDING", dueDate: "2026-04-26" },
    } as any);

    expect(outcome.result).toBe("ignored");
  });
});
