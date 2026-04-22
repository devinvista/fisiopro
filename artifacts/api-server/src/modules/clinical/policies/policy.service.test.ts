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
      return () => {
        callLog.push(prop);
        if (queue.length === 0) throw new Error(`[dbMock] queue exhausted on db.${prop}() — chamadas: ${callLog.join(",")}`);
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

// Auditoria e contábil são side-effects irrelevantes para esses testes.
const auditCalls: any[] = [];
vi.mock("../../../utils/auditLog.js", () => ({
  logAudit: vi.fn(async (entry: any) => {
    auditCalls.push(entry);
  }),
}));

const accountingCalls: any[] = [];
vi.mock("../../shared/accounting/accounting.service.js", async () => {
  const actual = await vi.importActual<any>("../../shared/accounting/accounting.service.js");
  return {
    ...actual,
    postReceivableRevenue: vi.fn(async (input: any) => {
      accountingCalls.push(input);
      return { id: 9999 };
    }),
  };
});

import { runAutoConfirmPolicies, runEndOfDayPolicies } from "./policy.service.js";

beforeEach(() => {
  dbMock.reset();
  auditCalls.length = 0;
  accountingCalls.length = 0;
});

describe("policyService.runAutoConfirmPolicies", () => {
  it("ignora clínicas sem autoConfirmHours configurado", async () => {
    dbMock.enqueue([
      { id: 1, name: "Clínica A", autoConfirmHours: 0 },
      { id: 2, name: "Clínica B", autoConfirmHours: null },
    ]);
    const result = await runAutoConfirmPolicies();
    expect(result.autoConfirmed).toBe(0);
    expect(result.errors).toBe(0);
    expect(dbMock.pending()).toBe(0);
  });

  it("auto-confirma agendamentos dentro da janela e registra auditoria", async () => {
    dbMock.enqueue([{ id: 1, name: "Clínica A", autoConfirmHours: 24 }]); // clinics
    dbMock.enqueue([
      { id: 101, patientId: 70 },
      { id: 102, patientId: 71 },
    ]);                          // toAutoConfirm
    dbMock.enqueue(undefined);   // update appt 101
    dbMock.enqueue(undefined);   // update appt 102

    const result = await runAutoConfirmPolicies();

    expect(result.autoConfirmed).toBe(2);
    expect(result.errors).toBe(0);
    expect(auditCalls).toHaveLength(2);
    expect(auditCalls[0]).toMatchObject({
      action: "update",
      entityType: "appointment",
      entityId: 101,
      userName: "sistema",
    });
  });

  it("registra erro por agendamento mas continua com os outros", async () => {
    dbMock.enqueue([{ id: 1, name: "Clínica A", autoConfirmHours: 12 }]);
    dbMock.enqueue([
      { id: 201, patientId: 50 },
      { id: 202, patientId: 51 },
    ]);
    dbMock.enqueue(() => { throw new Error("update falhou"); }); // update 201
    dbMock.enqueue(undefined);                                    // update 202

    const result = await runAutoConfirmPolicies();
    expect(result.autoConfirmed).toBe(1);
    expect(result.errors).toBe(1);
  });

  it("erro de clínica não derruba o resto do batch", async () => {
    dbMock.enqueue([
      { id: 1, name: "Clínica A", autoConfirmHours: 12 },
      { id: 2, name: "Clínica B", autoConfirmHours: 12 },
    ]);
    dbMock.enqueue(() => { throw new Error("query da clínica 1 quebrou"); }); // toAutoConfirm A
    dbMock.enqueue([{ id: 333, patientId: 10 }]);                              // toAutoConfirm B
    dbMock.enqueue(undefined);                                                 // update 333

    const result = await runAutoConfirmPolicies();
    expect(result.errors).toBe(1);
    expect(result.autoConfirmed).toBe(1);
  });
});

describe("policyService.runEndOfDayPolicies", () => {
  it("marca no-show e gera taxa quando habilitada", async () => {
    dbMock.enqueue([
      { id: 1, name: "Clínica A", noShowFeeEnabled: true, noShowFeeAmount: "50.00" },
    ]); // clinics
    dbMock.enqueue([
      { id: 800, patientId: 30, procedureId: 9, date: "2026-04-22", endTime: "10:00" },
    ]); // noShowCandidates
    dbMock.enqueue(undefined);                                       // update appt → faltou
    dbMock.enqueue([]);                                              // existing fee → vazio (idempotência)
    dbMock.enqueue([{ name: "João Silva" }]);                        // patient lookup
    dbMock.enqueue([{ name: "Pilates", category: "Pilates" }]);      // procedure lookup
    dbMock.enqueue([{ id: 4242 }]);                                  // insert financialRecord.returning
    dbMock.enqueue(undefined);                                       // update accountingEntryId
    dbMock.enqueue([]);                                              // toAutoComplete vazio

    const result = await runEndOfDayPolicies();

    expect(result.noShowMarked).toBe(1);
    expect(result.noShowFeesGenerated).toBe(1);
    expect(result.autoCompleted).toBe(0);
    expect(accountingCalls).toHaveLength(1);
    expect(accountingCalls[0]).toMatchObject({
      amount: 50,
      eventType: "no_show_fee",
      sourceType: "financial_record",
      sourceId: 4242,
    });
  });

  it("idempotência: não cria nova taxa se já existe registro de no-show para o agendamento", async () => {
    dbMock.enqueue([
      { id: 1, name: "Clínica A", noShowFeeEnabled: true, noShowFeeAmount: "50.00" },
    ]);
    dbMock.enqueue([
      { id: 801, patientId: 30, procedureId: 9, date: "2026-04-22", endTime: "10:00" },
    ]);
    dbMock.enqueue(undefined);                          // update → faltou
    dbMock.enqueue([{ id: 1234 }]);                     // existing fee JÁ ENCONTRADO → bloqueia criação
    dbMock.enqueue([]);                                 // toAutoComplete vazio

    const result = await runEndOfDayPolicies();

    expect(result.noShowMarked).toBe(1);
    expect(result.noShowFeesGenerated).toBe(0); // ← idempotência respeitada
    expect(accountingCalls).toHaveLength(0);
  });

  it("não gera taxa quando clínica tem noShowFeeEnabled=false", async () => {
    dbMock.enqueue([
      { id: 1, name: "Clínica A", noShowFeeEnabled: false, noShowFeeAmount: "50.00" },
    ]);
    dbMock.enqueue([
      { id: 802, patientId: 30, procedureId: 9, date: "2026-04-22", endTime: "10:00" },
    ]);
    dbMock.enqueue(undefined);   // update → faltou
    dbMock.enqueue([]);          // toAutoComplete vazio

    const result = await runEndOfDayPolicies();
    expect(result.noShowMarked).toBe(1);
    expect(result.noShowFeesGenerated).toBe(0);
    expect(accountingCalls).toHaveLength(0);
  });

  it("auto-conclui agendamentos compareceu cujo horário já passou", async () => {
    dbMock.enqueue([{ id: 1, name: "Clínica A", noShowFeeEnabled: false, noShowFeeAmount: null }]);
    dbMock.enqueue([]); // sem no-show
    dbMock.enqueue([
      { id: 900, patientId: 88 },
      { id: 901, patientId: 89 },
    ]); // toAutoComplete
    dbMock.enqueue(undefined); // update 900
    dbMock.enqueue(undefined); // update 901

    const result = await runEndOfDayPolicies();
    expect(result.autoCompleted).toBe(2);
    expect(result.noShowMarked).toBe(0);
    expect(auditCalls).toHaveLength(2);
    expect(auditCalls[0].summary).toContain("compareceu → concluido");
  });

  it("não vaza erro entre clínicas: erro em uma não bloqueia a próxima", async () => {
    dbMock.enqueue([
      { id: 1, name: "Clínica A", noShowFeeEnabled: false, noShowFeeAmount: null },
      { id: 2, name: "Clínica B", noShowFeeEnabled: false, noShowFeeAmount: null },
    ]);
    // Clínica A: erro na query de no-shows
    dbMock.enqueue(() => { throw new Error("query quebrou"); });
    // Clínica B: processamento normal e vazio
    dbMock.enqueue([]); // no-shows
    dbMock.enqueue([]); // auto-complete

    const result = await runEndOfDayPolicies();
    expect(result.errors).toBe(1);
    // A clínica B foi processada mesmo após o erro da A.
  });
});
