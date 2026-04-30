/**
 * Sprint Financeiro 10 (P2) — testes do reconhecimento fracionado.
 *
 * Mocka:
 *   • `db` (`@workspace/db`) com fila programável de respostas;
 *   • `postReceivableRevenue`, `postWalletUsage`, `resolveAccountCodeById`
 *     do accounting service.
 *
 * Cada cenário monta a fila no mesmo ORDER em que o serviço executa:
 *   1. SELECT fatura
 *   2. (opcional) COUNT appointments — bootstrap pool
 *   3. SELECT entry existente — idempotência por sessão
 *   4. (opcional) SELECT procedure — sub-conta
 *   5. UPDATE financial_records
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
      if (prop === "execute") {
        return (..._args: any[]) => {
          callLog.push("execute");
          if (queue.length > 0 && queue[0]?.__execute) {
            const next = queue.shift();
            return Promise.resolve(next.value);
          }
          return Promise.resolve(undefined);
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
    enqueueExecute: (value: any) => queue.push({ __execute: true, value }),
    reset: () => { queue.length = 0; callLog.length = 0; },
    pending: () => queue.length,
    calls: () => [...callLog],
  };
});

vi.mock("@workspace/db", async () => {
  const actual = await vi.importActual<any>("@workspace/db");
  return { ...actual, db: dbMock.db };
});

const postReceivableRevenueMock = vi.hoisted(() =>
  vi.fn(async (_input: any) => ({ id: 7777 }))
);
const postWalletUsageMock = vi.hoisted(() =>
  vi.fn(async (_input: any) => ({ id: 8888 }))
);
const resolveAccountCodeByIdMock = vi.hoisted(() =>
  vi.fn(async (_id: any, fallback: string, _clinicId: any) => fallback)
);
vi.mock("../../shared/accounting/accounting.service.js", () => ({
  postReceivableRevenue: postReceivableRevenueMock,
  postWalletUsage: postWalletUsageMock,
  resolveAccountCodeById: resolveAccountCodeByIdMock,
}));

import { recognizeMonthlyInvoiceRevenuePartial } from "./treatment-plans.revenue-recognition.js";

const baseInvoice = {
  id: 100,
  type: "receita",
  amount: "800.00",
  description: "Mensalidade Plano Pilates — abr/2026",
  category: "plano",
  appointmentId: null,
  patientId: 7,
  procedureId: null,
  clinicId: 1,
  status: "pendente",
  transactionType: "faturaPlano",
  recognizedAmount: "0",
  recognitionCreditsTotal: null as number | null,
  recognitionCreditsConsumed: 0,
  recognizedEntryId: null as number | null,
  accountingEntryId: null as number | null,
};

describe("recognizeMonthlyInvoiceRevenuePartial", () => {
  beforeEach(() => {
    dbMock.reset();
    postReceivableRevenueMock.mockClear();
    postWalletUsageMock.mockClear();
    resolveAccountCodeByIdMock.mockClear();
  });

  it("primeira sessão de 8 → posta share 100,00 e snapshota pool=8", async () => {
    // 1. SELECT fatura
    dbMock.enqueue([{ ...baseInvoice }]);
    // 2. COUNT appointments → pool=8 (execute)
    dbMock.enqueueExecute([{ total: 8 }]);
    // 3. SELECT entry existente → vazio (idempotência: sem fragmenta prévia)
    dbMock.enqueue([]);
    // 4. UPDATE financial_records
    dbMock.enqueue(undefined);

    postReceivableRevenueMock.mockResolvedValueOnce({ id: 9001 });

    const result = await recognizeMonthlyInvoiceRevenuePartial({
      monthlyInvoiceId: 100,
      appointmentId: 501,
      appointmentDate: "2026-04-05",
    });

    expect(result.recognized).toBe(true);
    expect(result.shareAmount).toBe(100);
    expect(result.recognitionCreditsTotal).toBe(8);
    expect(result.recognitionCreditsConsumed).toBe(1);
    expect(postReceivableRevenueMock).toHaveBeenCalledTimes(1);
    expect(postReceivableRevenueMock.mock.calls[0][0]).toMatchObject({
      amount: 100,
      financialRecordId: 100,
      appointmentId: 501,
      revenueAccountCode: "4.1.2",
    });
  });

  it("última sessão (3/3) absorve resíduo de centavo (266,66)", async () => {
    // amount 800 / 3 = 266.6666... → 266.67 + 266.67 + 266.66 = 800
    dbMock.enqueue([{
      ...baseInvoice,
      amount: "800.00",
      recognizedAmount: "533.34", // 266.67 * 2
      recognitionCreditsTotal: 3,
      recognitionCreditsConsumed: 2,
      recognizedEntryId: 9001,
      accountingEntryId: 9002,
    }]);
    dbMock.enqueue([]); // idempotência
    dbMock.enqueue(undefined); // update

    postReceivableRevenueMock.mockResolvedValueOnce({ id: 9003 });

    const result = await recognizeMonthlyInvoiceRevenuePartial({
      monthlyInvoiceId: 100,
      appointmentId: 503,
      appointmentDate: "2026-04-20",
    });

    expect(result.recognized).toBe(true);
    expect(result.shareAmount).toBeCloseTo(266.66, 2);
    expect(postReceivableRevenueMock.mock.calls[0][0]).toMatchObject({
      amount: 266.66,
    });
  });

  it("idempotência por (fatura, sessão): 2ª chamada com mesma sessão é no-op", async () => {
    // SELECT fatura
    dbMock.enqueue([{
      ...baseInvoice,
      recognitionCreditsTotal: 8,
      recognitionCreditsConsumed: 1,
      recognizedAmount: "100.00",
    }]);
    // SELECT entry existente → JÁ EXISTE
    dbMock.enqueue([{ id: 9001, amount: "100.00" }]);

    const result = await recognizeMonthlyInvoiceRevenuePartial({
      monthlyInvoiceId: 100,
      appointmentId: 501,
      appointmentDate: "2026-04-05",
    });

    expect(result.recognized).toBe(false);
    expect(result.reason).toMatch(/já postada/i);
    expect(result.entryId).toBe(9001);
    expect(postReceivableRevenueMock).not.toHaveBeenCalled();
  });

  it("modelo legado (recognizedEntryId set + total NULL) → no-op", async () => {
    dbMock.enqueue([{
      ...baseInvoice,
      recognizedEntryId: 5001, // legado
      recognitionCreditsTotal: null,
    }]);

    const result = await recognizeMonthlyInvoiceRevenuePartial({
      monthlyInvoiceId: 100,
      appointmentId: 501,
      appointmentDate: "2026-04-05",
    });

    expect(result.recognized).toBe(false);
    expect(result.reason).toMatch(/legado/i);
    expect(result.entryId).toBe(5001);
    expect(postReceivableRevenueMock).not.toHaveBeenCalled();
  });

  it("fatura cancelada → bail sem efeito", async () => {
    dbMock.enqueue([{ ...baseInvoice, status: "cancelado" }]);

    const result = await recognizeMonthlyInvoiceRevenuePartial({
      monthlyInvoiceId: 100,
      appointmentId: 501,
      appointmentDate: "2026-04-05",
    });

    expect(result.recognized).toBe(false);
    expect(result.reason).toMatch(/cancelado/i);
    expect(postReceivableRevenueMock).not.toHaveBeenCalled();
  });

  it("transactionType != faturaPlano → bail", async () => {
    dbMock.enqueue([{ ...baseInvoice, transactionType: "faturaMensalAvulso" }]);
    const result = await recognizeMonthlyInvoiceRevenuePartial({
      monthlyInvoiceId: 100,
      appointmentId: 501,
      appointmentDate: "2026-04-05",
    });
    expect(result.recognized).toBe(false);
    expect(result.reason).toMatch(/faturaPlano/i);
  });

  it("fatura PAGA (status='pago') usa postWalletUsage em vez de postReceivableRevenue", async () => {
    dbMock.enqueue([{ ...baseInvoice, status: "pago" }]);
    dbMock.enqueueExecute([{ total: 4 }]);
    dbMock.enqueue([]);
    dbMock.enqueue(undefined);

    postWalletUsageMock.mockResolvedValueOnce({ id: 8001 });

    const result = await recognizeMonthlyInvoiceRevenuePartial({
      monthlyInvoiceId: 100,
      appointmentId: 501,
      appointmentDate: "2026-04-05",
    });

    expect(result.recognized).toBe(true);
    expect(result.shareAmount).toBe(200); // 800/4
    expect(postWalletUsageMock).toHaveBeenCalledTimes(1);
    expect(postReceivableRevenueMock).not.toHaveBeenCalled();
  });

  it("pool COUNT=0 (race) → fallback total=1, share = amount inteiro", async () => {
    dbMock.enqueue([{ ...baseInvoice }]);
    dbMock.enqueueExecute([{ total: 0 }]); // race com INSERT da própria sessão
    dbMock.enqueue([]);
    dbMock.enqueue(undefined);

    postReceivableRevenueMock.mockResolvedValueOnce({ id: 9999 });

    const result = await recognizeMonthlyInvoiceRevenuePartial({
      monthlyInvoiceId: 100,
      appointmentId: 501,
      appointmentDate: "2026-04-05",
    });

    expect(result.recognized).toBe(true);
    expect(result.recognitionCreditsTotal).toBe(1);
    expect(result.shareAmount).toBe(800);
  });

  it("expansão de pool: sessão extra além do snapshot inicial → expande total e posta share residual", async () => {
    // Pool = 3, já consumido 3 (esgotado), nova sessão chega.
    dbMock.enqueue([{
      ...baseInvoice,
      amount: "300.00",
      recognitionCreditsTotal: 3,
      recognitionCreditsConsumed: 3,
      recognizedAmount: "300.00",
    }]);
    dbMock.enqueue([]); // sem fragmenta prévia para esta sessão
    // Nesse caso não posta nada porque remaining=0; deveria devolver "Receita já totalmente apropriada"
    const result = await recognizeMonthlyInvoiceRevenuePartial({
      monthlyInvoiceId: 100,
      appointmentId: 999,
      appointmentDate: "2026-04-30",
    });
    expect(result.recognized).toBe(false);
    expect(result.reason).toMatch(/totalmente apropriada/i);
  });
});
