/**
 * Sprint Financeiro 12 (P3) + Sprint 14 (Hardening) — cancelamento de plano.
 *
 * Cobre:
 *  • Estorno de TODAS as faturas mensais não consumidas (pendente/vencido).
 *  • Faturas pagas/parcialmentePago são puladas (ressarcimento manual).
 *  • Faturas com `recognitionCreditsConsumed > 0` (não pagas) recebem
 *    estorno PARCIAL pelo saldo restante e entram em
 *    `partiallyConsumedInvoiceIds` (não em `paidInvoiceIds`).
 *  • Idempotência: 2ª chamada em plano já cancelado é no-op.
 *  • Validação de motivo (mínimo 3 chars).
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

const postReversalMock = vi.hoisted(() =>
  vi.fn(async (_originalEntryId: number, _input: any) => ({ id: 99999 }))
);
const postReceivableRevenueMock = vi.hoisted(() =>
  vi.fn(async (_input: any) => ({ id: 88888 }))
);
const postPartialDeferredReversalMock = vi.hoisted(() =>
  vi.fn(async (_input: any) => ({ id: 77777 }))
);
const resolveAccountCodeByIdMock = vi.hoisted(() =>
  vi.fn(async (_id: any, fallback: string, _clinic: any, _tx?: any) => fallback)
);
vi.mock("../../shared/accounting/accounting.service.js", () => ({
  postReversal: postReversalMock,
  postReceivableRevenue: postReceivableRevenueMock,
  postPartialDeferredReversal: postPartialDeferredReversalMock,
  resolveAccountCodeById: resolveAccountCodeByIdMock,
}));

import { cancelTreatmentPlan } from "./treatment-plans.cancel.js";

const basePlan = {
  id: 100,
  patientId: 7,
  clinicId: 1,
  status: "vigente",
  cancellationReason: null as string | null,
};

const baseInvoice = (overrides: Partial<any> = {}) => ({
  id: 1000,
  patientId: 7,
  procedureId: 50,
  clinicId: 1,
  status: "pendente",
  transactionType: "faturaPlano",
  recognitionCreditsConsumed: 0,
  amount: "800.00",
  recognizedAmount: "0.00",
  ...overrides,
});

describe("cancelTreatmentPlan", () => {
  beforeEach(() => {
    dbMock.reset();
    postReversalMock.mockClear();
    postReceivableRevenueMock.mockClear();
    postPartialDeferredReversalMock.mockClear();
    resolveAccountCodeByIdMock.mockClear();
  });

  it("rejeita motivo vazio ou muito curto", async () => {
    await expect(
      cancelTreatmentPlan({ planId: 100, reason: "" }),
    ).rejects.toThrow(/motivo/i);
    await expect(
      cancelTreatmentPlan({ planId: 100, reason: "ab" }),
    ).rejects.toThrow(/motivo/i);
  });

  it("plano já cancelado → no-op idempotente, retorna contadores zerados", async () => {
    // 1. SELECT plan → já cancelado
    dbMock.enqueue([{ ...basePlan, status: "cancelado", cancellationReason: "antigo" }]);

    const result = await cancelTreatmentPlan({
      planId: 100,
      reason: "tentativa duplicada",
    });

    expect(result.invoicesCancelled).toBe(0);
    expect(result.reversalsPosted).toBe(0);
    expect(result.reason).toBe("antigo"); // mantém motivo original
    expect(postReversalMock).not.toHaveBeenCalled();
  });

  it("plano com 12 faturas pendentes → estorna 12 deferred_receivable e marca todas canceladas", async () => {
    // 1. SELECT plan
    dbMock.enqueue([{ ...basePlan }]);
    // 2. SELECT all invoices → 12 pendentes
    const invoices = Array.from({ length: 12 }, (_, i) =>
      baseInvoice({ id: 1000 + i }),
    );
    dbMock.enqueue(invoices);

    // Para cada fatura: SELECT deferred + UPDATE financial_record.
    for (let i = 0; i < 12; i++) {
      dbMock.enqueue([{ id: 5000 + i, clinicId: 1 }]); // deferred encontrado
      dbMock.enqueue(undefined); // UPDATE financial_records
    }
    // UPDATE treatment_plan
    dbMock.enqueue(undefined);

    const result = await cancelTreatmentPlan({
      planId: 100,
      reason: "Paciente solicitou rescisão",
      cancelledBy: 42,
    });

    expect(result.invoicesCancelled).toBe(12);
    expect(result.reversalsPosted).toBe(12);
    expect(result.paidInvoicesSkipped).toBe(0);
    expect(postReversalMock).toHaveBeenCalledTimes(12);
    // Verifica que cada chamada referencia o entry id correto.
    expect(postReversalMock.mock.calls[0][0]).toBe(5000);
    expect(postReversalMock.mock.calls[11][0]).toBe(5011);
  });

  it("3 faturas pendentes + 2 pagas → estorna só as 3 pendentes, lista as 2 pagas", async () => {
    dbMock.enqueue([{ ...basePlan }]);
    dbMock.enqueue([
      baseInvoice({ id: 1000, status: "pendente" }),
      baseInvoice({ id: 1001, status: "pago" }),
      baseInvoice({ id: 1002, status: "pendente" }),
      baseInvoice({ id: 1003, status: "parcialmentePago" }),
      baseInvoice({ id: 1004, status: "vencido" }),
    ]);

    // Para as 3 que serão canceladas (1000, 1002, 1004): SELECT deferred + UPDATE.
    dbMock.enqueue([{ id: 5000, clinicId: 1 }]);
    dbMock.enqueue(undefined);
    dbMock.enqueue([{ id: 5002, clinicId: 1 }]);
    dbMock.enqueue(undefined);
    dbMock.enqueue([{ id: 5004, clinicId: 1 }]);
    dbMock.enqueue(undefined);
    // UPDATE plan
    dbMock.enqueue(undefined);

    const result = await cancelTreatmentPlan({
      planId: 100,
      reason: "Cancelamento parcial",
    });

    expect(result.invoicesCancelled).toBe(3);
    expect(result.reversalsPosted).toBe(3);
    expect(result.paidInvoicesSkipped).toBe(2);
    expect(result.paidInvoiceIds).toEqual(expect.arrayContaining([1001, 1003]));
  });

  it("fatura pendente com receita já reconhecida (consumed>0) → estorno PARCIAL e entra em partiallyConsumedInvoiceIds", async () => {
    // Sprint Financeiro 14 (Hardening) — fix do bug que mislabeled
    // faturas parcialmente consumidas como `paidInvoiceIds` e pulava o
    // estorno do saldo restante (deixava recebível/adiantamento fantasma).
    dbMock.enqueue([{ ...basePlan }]);
    dbMock.enqueue([
      // Fatura 1000: limpa, será estornada integralmente.
      baseInvoice({
        id: 1000,
        status: "pendente",
        recognitionCreditsConsumed: 0,
        amount: "800.00",
        recognizedAmount: "0.00",
      }),
      // Fatura 1001: 2 sessões já reconhecidas. amount=800, recognized=200,
      // residual=600 → postPartialDeferredReversal({amount:600}).
      baseInvoice({
        id: 1001,
        status: "pendente",
        recognitionCreditsConsumed: 2,
        amount: "800.00",
        recognizedAmount: "200.00",
      }),
    ]);

    // Iteração 1 (inv 1000, consumed=0): SELECT deferred → tem → postReversal → UPDATE.
    dbMock.enqueue([{ id: 5000, clinicId: 1 }]);
    dbMock.enqueue(undefined); // UPDATE financial_record

    // Iteração 2 (inv 1001, consumed=2): SELECT deferred → tem → postPartialDeferredReversal → UPDATE.
    dbMock.enqueue([{ id: 5001, clinicId: 1 }]);
    dbMock.enqueue(undefined); // UPDATE financial_record

    dbMock.enqueue(undefined); // UPDATE plan

    const result = await cancelTreatmentPlan({
      planId: 100,
      reason: "Mid-month cancel",
    });

    expect(result.invoicesCancelled).toBe(2);
    expect(result.reversalsPosted).toBe(1);
    expect(result.partialReversalsPosted).toBe(1);
    expect(result.paidInvoicesSkipped).toBe(0);
    expect(result.paidInvoiceIds).toEqual([]);
    expect(result.partiallyConsumedInvoiceIds).toContain(1001);
    expect(result.partiallyConsumedInvoiceIds).not.toContain(1000);

    // Estorno parcial postado pelo SALDO restante (800 - 200 = 600).
    expect(postPartialDeferredReversalMock).toHaveBeenCalledTimes(1);
    expect(postPartialDeferredReversalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 600,
        sourceType: "financial_record",
        sourceId: 1001,
        financialRecordId: 1001,
      }),
      expect.anything(),
    );
  });

  it("fatura pendente com consumed>0 mas residual=0 (totalmente reconhecida) → marca cancelada SEM estorno parcial", async () => {
    // Edge case: fatura com todos os créditos já consumidos (recognized==amount).
    // Não há saldo a estornar, mas a fatura ainda é cancelada e listada.
    dbMock.enqueue([{ ...basePlan }]);
    dbMock.enqueue([
      baseInvoice({
        id: 1010,
        status: "pendente",
        recognitionCreditsConsumed: 4,
        amount: "800.00",
        recognizedAmount: "800.00",
      }),
    ]);

    // SELECT deferred → tem (mas residual=0, não posta nada).
    dbMock.enqueue([{ id: 5010, clinicId: 1 }]);
    dbMock.enqueue(undefined); // UPDATE financial_record
    dbMock.enqueue(undefined); // UPDATE plan

    const result = await cancelTreatmentPlan({
      planId: 100,
      reason: "Fully recognized",
    });

    expect(result.invoicesCancelled).toBe(1);
    expect(result.reversalsPosted).toBe(0);
    expect(result.partialReversalsPosted).toBe(0);
    expect(result.partiallyConsumedInvoiceIds).toContain(1010);
    expect(postPartialDeferredReversalMock).not.toHaveBeenCalled();
    expect(postReversalMock).not.toHaveBeenCalled();
  });

  it("fatura pendente SEM deferred_receivable (modelo legado) → marca cancelada sem postReversal", async () => {
    dbMock.enqueue([{ ...basePlan }]);
    dbMock.enqueue([baseInvoice({ id: 1000, status: "pendente" })]);

    // SELECT deferred → vazio (legado)
    dbMock.enqueue([]);
    // UPDATE financial_record
    dbMock.enqueue(undefined);
    // UPDATE plan
    dbMock.enqueue(undefined);

    const result = await cancelTreatmentPlan({
      planId: 100,
      reason: "Plano antigo",
    });

    expect(result.invoicesCancelled).toBe(1);
    expect(result.reversalsPosted).toBe(0); // não havia deferred para estornar
    expect(postReversalMock).not.toHaveBeenCalled();
  });
});
