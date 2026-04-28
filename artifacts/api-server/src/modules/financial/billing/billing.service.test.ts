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
      // `db.transaction(cb)` — invoca o callback com o próprio proxy como `tx`
      // sem consumir item da fila (a fila representa apenas as queries reais).
      if (prop === "transaction") {
        return async (cb: (tx: any) => any) => {
          callLog.push("transaction");
          return cb(db);
        };
      }
      // `tx.execute(sql\`pg_advisory_xact_lock(...)\`)` — não consome fila,
      // resolve para undefined.
      if (prop === "execute") {
        return () => {
          callLog.push("execute");
          return makeChain(undefined);
        };
      }
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

import { runBilling } from "./billing.service.js";
import { nowBRT } from "../../../utils/dateUtils.js";

const brt = nowBRT();
const todayDay = brt.day;

function activeSub(overrides: Partial<any> = {}) {
  return {
    pkg: {
      id: 100,
      patientId: 7,
      procedureId: 8,
      clinicId: 1,
      recurrenceStatus: "ativa",
      recurrenceType: "mensal",
      monthlyAmount: "199.90",
      billingDay: todayDay, // dentro da janela por padrão
      ...overrides,
    },
    patientName: "Maria Souza",
    procedureName: "Pilates Mensal",
    procedureCategory: "Pilates",
  };
}

describe("billingService.runBilling", () => {
  beforeEach(() => dbMock.reset());

  it("gera cobrança quando dia está na janela e não há registro do mês", async () => {
    dbMock.enqueue([activeSub()]);                 // 1. select assinaturas
    dbMock.enqueue([]);                            // 2. select existing → vazio
    dbMock.enqueue([]);                            // 3. tx.select recheck dentro do lock → vazio
    dbMock.enqueue([{ id: 555 }]);                 // 4. tx.insert.returning → registro criado
    dbMock.enqueue(undefined);                     // 5. tx.update nextBillingDate
    dbMock.enqueue(undefined);                     // 6. db.insert billing_run_logs

    const result = await runBilling({ triggeredBy: "manual" });

    expect(result.processed).toBe(1);
    expect(result.generated).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.recordIds).toEqual([555]);
    expect(result.details[0]).toMatchObject({ action: "generated" });
    expect(dbMock.pending()).toBe(0);
  });

  it("dryRun: marca como gerado mas não insere nem grava log permanente", async () => {
    dbMock.enqueue([activeSub()]);                 // select assinaturas
    dbMock.enqueue([]);                            // select existing → vazio
    // Sem insert/update/log: se forem chamados, "queue exhausted" quebra o teste.

    const result = await runBilling({ dryRun: true });

    expect(result.generated).toBe(1);
    expect(result.recordIds).toEqual([]); // nenhum id real criado
    expect(result.details[0].reason).toContain("dry-run");
    expect(dbMock.pending()).toBe(0);
  });

  it("pula cobrança quando já existe registro do mês (idempotência)", async () => {
    dbMock.enqueue([activeSub()]);                 // select assinaturas
    dbMock.enqueue([{ id: 999 }]);                 // existing já encontrado
    dbMock.enqueue(undefined);                     // log

    const result = await runBilling();

    expect(result.skipped).toBe(1);
    expect(result.generated).toBe(0);
    expect(result.details[0]).toMatchObject({ action: "skipped_already_billed" });
    expect(result.details[0].reason).toContain("#999");
  });

  it("pula cobrança fora da janela de tolerância", async () => {
    // billingDay propositadamente longe do dia atual + além da tolerância
    const farDay = todayDay > 15 ? 1 : 28;
    dbMock.enqueue([activeSub({ billingDay: farDay })]);
    dbMock.enqueue(undefined); // log

    const result = await runBilling({ toleranceDays: 1 });

    expect(result.skipped).toBe(1);
    expect(result.generated).toBe(0);
    expect(result.details[0]).toMatchObject({ action: "skipped_wrong_day" });
  });

  it("janela de tolerância: cobra no dia seguinte ao billingDay", async () => {
    if (todayDay <= 1) {
      // Em dia 1 não dá pra testar "dia anterior" sem cair em mês curto. Skip seguro.
      return;
    }
    dbMock.enqueue([activeSub({ billingDay: todayDay - 1 })]);
    dbMock.enqueue([]);              // existing vazio
    dbMock.enqueue([]);              // tx.recheck vazio
    dbMock.enqueue([{ id: 777 }]);   // insert
    dbMock.enqueue(undefined);       // update next billing
    dbMock.enqueue(undefined);       // log

    const result = await runBilling({ toleranceDays: 3 });
    expect(result.generated).toBe(1);
  });

  it("contabiliza erro sem abortar batch quando insert falha", async () => {
    dbMock.enqueue([activeSub({ id: 1 }), activeSub({ id: 2 })]); // 2 assinaturas
    // Sub #1: existing vazio, recheck vazio, insert FALHA
    dbMock.enqueue([]);
    dbMock.enqueue([]);
    dbMock.enqueue(() => { throw new Error("insert violou constraint"); });
    // Sub #2: existing vazio, recheck vazio, gera com sucesso
    dbMock.enqueue([]);
    dbMock.enqueue([]);
    dbMock.enqueue([{ id: 222 }]);
    dbMock.enqueue(undefined); // update next billing
    dbMock.enqueue(undefined); // log

    const result = await runBilling();
    expect(result.errors).toBe(1);
    expect(result.generated).toBe(1);
    expect(result.recordIds).toEqual([222]);
  });

  it("pula registro de log se a inserção do log falhar (não propaga)", async () => {
    dbMock.enqueue([]); // sem assinaturas
    dbMock.enqueue(() => { throw new Error("log table indisponível"); });

    const result = await runBilling();
    expect(result.processed).toBe(0);
    expect(result.errors).toBe(0); // o erro do log não conta no errors do batch
  });
});
