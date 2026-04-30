/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Sprint 15 (F1) — Testes do orquestrador atômico de aceite + materialização.
 *
 * Cobertura:
 *   - validatePlanForAtomicAccept devolve erros acionáveis para itens sem agenda.
 *   - acceptAndMaterializePlan caminho feliz chama aceite + materialize em ordem.
 *   - acceptAndMaterializePlan rollback: se materialize falha, reverte aceite.
 *   - acceptAndMaterializePlan idempotente: se já aceito+materializado, não faz nada.
 *   - revertPlanAcceptance zera os campos de trilha LGPD.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Mock do banco — drizzle chain (select/from/leftJoin/where/limit/update) ──
const dbMock = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const state = {
    plan: null as Row | null,
    items: [] as Row[],
    updateCalls: [] as Array<{ table: unknown; values: Row; whereDesc: string }>,
  };

  function selectChain(rows: Row[]): any {
    const chain: any = {
      from: () => chain,
      leftJoin: () => chain,
      where: () => chain,
      limit: () => Promise.resolve(rows),
      then: (cb: any) => Promise.resolve(rows).then(cb),
    };
    return chain;
  }

  const db = {
    selectIdx: 0,
    select: vi.fn((_cols?: any) => {
      // Padrão validate-only: chamada 1 = plan, chamada 2 = items.
      // Tests do orchestrator sobrescrevem com makeSelectImpl.
      db.selectIdx++;
      const isPlan = db.selectIdx % 2 === 1;
      const rows = isPlan
        ? state.plan
          ? [state.plan]
          : []
        : state.items;
      return selectChain(rows);
    }) as any,
    update: vi.fn((table: unknown) => {
      let setValues: Row = {};
      const chain: any = {
        set: (values: Row) => {
          setValues = values;
          return chain;
        },
        where: (_cond: unknown) => {
          state.updateCalls.push({ table, values: setValues, whereDesc: "ok" });
          return Promise.resolve();
        },
      };
      return chain;
    }) as any,
    transaction: vi.fn(async (fn: any) => fn(db)),
    state,
  } as any;

  return db;
});

vi.mock("@workspace/db", () => ({
  db: dbMock,
  treatmentPlansTable: { id: "plans.id", acceptedAt: "plans.accepted_at" },
  treatmentPlanProceduresTable: { id: "items.id", treatmentPlanId: "items.plan_id" },
  packagesTable: { id: "packages.id" },
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: any[]) => ({ _op: "and", args }),
  eq: (a: any, b: any) => ({ _op: "eq", a, b }),
}));

// ─── Mock dos serviços orquestrados ──────────────────────────────────────────
const acceptMock = vi.hoisted(() => vi.fn());
const materializeMock = vi.hoisted(() => vi.fn());
const dematerializeMock = vi.hoisted(() => vi.fn());

vi.mock("./medical-records.service.js", () => ({
  acceptPatientTreatmentPlan: acceptMock,
}));

vi.mock("./treatment-plans.materialization.js", () => ({
  materializeTreatmentPlan: materializeMock,
  dematerializeTreatmentPlan: dematerializeMock,
}));

vi.mock("./treatment-plans.acceptance.js", () => ({
  resolveItemKind: (item: { kind: string | null; packageId: number | null; packageType: string | null }) => {
    if (item.kind === "recorrenteMensal") return "recorrenteMensal";
    if (item.kind === "pacoteSessoes") return "pacoteSessoes";
    if (item.kind === "avulso") return "avulso";
    if (item.packageId != null) {
      if (item.packageType === "mensal") return "recorrenteMensal";
      return "pacoteSessoes";
    }
    return "avulso";
  },
}));

const {
  validatePlanForAtomicAccept,
  acceptAndMaterializePlan,
  revertPlanAcceptance,
} = await import("./treatment-plans.atomic.js");

/**
 * Helper: cria um stub de `db.select(...)` que devolve `state.items` na 2ª
 * chamada (sempre é o select de itens com leftJoin) e `state.plan` em todas
 * as outras (selects de plano isolado). O chain retornado é compatível com:
 *   - `.from(t).where(c).limit(1)` (await do array de rows)
 *   - `.from(t).leftJoin(...).where(c)` (await do array de rows)
 */
function makeSelectImpl(nextIdx: () => number) {
  return () => {
    const idx = nextIdx();
    const wantsItems = idx === 2;
    const rows = wantsItems
      ? dbMock.state.items
      : dbMock.state.plan
        ? [dbMock.state.plan]
        : [];
    const thenable = {
      then: (cb: any) => Promise.resolve(rows).then(cb),
      catch: (cb: any) => Promise.resolve(rows).catch(cb),
      finally: (cb: any) => Promise.resolve(rows).finally(cb),
    };
    const whereResult = {
      ...thenable,
      limit: () => Promise.resolve(rows),
    };
    return {
      from: () => ({
        leftJoin: () => ({ where: () => whereResult }),
        where: () => whereResult,
      }),
    };
  };
}

beforeEach(() => {
  acceptMock.mockReset();
  materializeMock.mockReset();
  dematerializeMock.mockReset();
  dbMock.state.plan = null;
  dbMock.state.items = [];
  dbMock.state.updateCalls = [];
  dbMock.selectIdx = 0;
  dbMock.update.mockClear();
  dbMock.select.mockClear();
  // restaura impl default (alguns tests sobrescrevem com makeSelectImpl)
  dbMock.select.mockImplementation((() => {
    dbMock.selectIdx++;
    const isPlan = dbMock.selectIdx % 2 === 1;
    const rows = isPlan
      ? dbMock.state.plan
        ? [dbMock.state.plan]
        : []
      : dbMock.state.items;
    const thenable = {
      then: (cb: any) => Promise.resolve(rows).then(cb),
      catch: (cb: any) => Promise.resolve(rows).catch(cb),
      finally: (cb: any) => Promise.resolve(rows).finally(cb),
    };
    const whereResult = { ...thenable, limit: () => Promise.resolve(rows) };
    return {
      from: () => ({
        leftJoin: () => ({ where: () => whereResult }),
        where: () => whereResult,
      }),
    };
  }) as any);
});

// ────────────────────────────────────────────────────────────────────────────
// validatePlanForAtomicAccept
// ────────────────────────────────────────────────────────────────────────────

describe("validatePlanForAtomicAccept", () => {
  it("ok=true para plano com 1 item recorrente totalmente configurado", async () => {
    dbMock.state.plan = {
      id: 1,
      startDate: "2026-05-01",
      durationMonths: 12,
      acceptedAt: null,
    };
    dbMock.state.items = [
      {
        id: 10,
        kind: "recorrenteMensal",
        packageId: 5,
        packageType: "mensal",
        weekDays: '["monday","wednesday"]',
        defaultStartTime: "09:00",
        startTimesByDay: null,
        scheduleId: 7,
        procedureId: 100,
        packageProcedureId: 100,
        totalSessions: null,
        unitMonthlyPrice: "400.00",
        unitPrice: null,
      },
    ];

    const result = await validatePlanForAtomicAccept(1);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("erro quando item recorrente está sem weekDays", async () => {
    dbMock.state.plan = { id: 1, startDate: "2026-05-01", durationMonths: 12, acceptedAt: null };
    dbMock.state.items = [
      {
        id: 10,
        kind: "recorrenteMensal",
        packageId: 5,
        packageType: "mensal",
        weekDays: null,
        defaultStartTime: "09:00",
        startTimesByDay: null,
        scheduleId: 7,
        procedureId: 100,
        packageProcedureId: 100,
        totalSessions: null,
        unitMonthlyPrice: "400.00",
        unitPrice: null,
      },
    ];

    const result = await validatePlanForAtomicAccept(1);
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      expect.objectContaining({ itemId: 10, field: "weekDays" }),
    ]);
  });

  it("erro quando item recorrente tem weekDays mas falta horário em algum dia", async () => {
    dbMock.state.plan = { id: 1, startDate: "2026-05-01", durationMonths: 12, acceptedAt: null };
    dbMock.state.items = [
      {
        id: 10,
        kind: "recorrenteMensal",
        packageId: 5,
        packageType: "mensal",
        weekDays: '["monday","wednesday"]',
        // só monday tem horário; wednesday não tem nem mapa nem default → erro
        defaultStartTime: null,
        startTimesByDay: '{"monday":"09:00"}',
        scheduleId: 7,
        procedureId: 100,
        packageProcedureId: 100,
        totalSessions: null,
        unitMonthlyPrice: "400.00",
        unitPrice: null,
      },
    ];

    const result = await validatePlanForAtomicAccept(1);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({
      itemId: 10,
      field: "startTimes",
    });
    expect(result.errors[0].message).toContain("wednesday");
  });

  it("permite item avulso sem agenda (mas exige preço unitário)", async () => {
    dbMock.state.plan = { id: 1, startDate: "2026-05-01", durationMonths: 12, acceptedAt: null };
    dbMock.state.items = [
      {
        id: 20,
        kind: "avulso",
        packageId: null,
        packageType: null,
        weekDays: null,
        defaultStartTime: null,
        startTimesByDay: null,
        scheduleId: null,
        procedureId: 100,
        packageProcedureId: null,
        totalSessions: null,
        unitMonthlyPrice: null,
        unitPrice: "120.00",
      },
    ];

    const result = await validatePlanForAtomicAccept(1);
    expect(result.ok).toBe(true);
  });

  it("erro quando item avulso está sem preço", async () => {
    dbMock.state.plan = { id: 1, startDate: "2026-05-01", durationMonths: 12, acceptedAt: null };
    dbMock.state.items = [
      {
        id: 20,
        kind: "avulso",
        packageId: null,
        packageType: null,
        weekDays: null,
        defaultStartTime: null,
        startTimesByDay: null,
        scheduleId: null,
        procedureId: 100,
        packageProcedureId: null,
        totalSessions: null,
        unitMonthlyPrice: null,
        unitPrice: null,
      },
    ];

    const result = await validatePlanForAtomicAccept(1);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({ itemId: 20, field: "unitPrice" });
  });

  it("erro quando plano não tem startDate", async () => {
    dbMock.state.plan = { id: 1, startDate: null, durationMonths: 12, acceptedAt: null };
    dbMock.state.items = [
      {
        id: 20,
        kind: "avulso",
        packageId: null,
        packageType: null,
        weekDays: null,
        defaultStartTime: null,
        startTimesByDay: null,
        scheduleId: null,
        procedureId: 100,
        packageProcedureId: null,
        totalSessions: null,
        unitMonthlyPrice: null,
        unitPrice: "120.00",
      },
    ];

    const result = await validatePlanForAtomicAccept(1);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.field === "startDate")).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// acceptAndMaterializePlan
// ────────────────────────────────────────────────────────────────────────────

describe("acceptAndMaterializePlan", () => {
  it("caminho feliz: chama aceite + materialize na ordem e retorna combinado", async () => {
    // O orquestrador faz 3 selects:
    //  1) validation: plan lookup
    //  2) validation: items lookup
    //  3) idempotência: plan lookup again
    //  4) ao final: plan lookup again para acceptedAt definitivo
    // Como dbMock alterna plan/items, configuramos para devolver o mesmo plano
    // sempre que pedirem plan e items em todos os call patterns.
    dbMock.state.plan = {
      id: 1,
      patientId: 7,
      startDate: "2026-05-01",
      durationMonths: 12,
      acceptedAt: null,
      materializedAt: null,
    };
    dbMock.state.items = [
      {
        id: 10,
        kind: "recorrenteMensal",
        packageId: 5,
        packageType: "mensal",
        weekDays: '["monday"]',
        defaultStartTime: "09:00",
        startTimesByDay: null,
        scheduleId: 7,
        procedureId: 100,
        packageProcedureId: 100,
        totalSessions: null,
        unitMonthlyPrice: "400.00",
        unitPrice: null,
      },
    ];
    // Override: select sempre devolve plan (vamos reconfigurar a heurística)
    let selectIdx = 0;
    dbMock.select.mockImplementation(makeSelectImpl(() => ++selectIdx) as any);

    acceptMock.mockResolvedValue({ id: 1, acceptedAt: new Date("2026-05-01T10:00:00Z") });
    materializeMock.mockResolvedValue({
      planId: 1,
      appointmentsCreated: 4,
      invoicesCreated: 12,
      monthsCovered: 12,
      totalContractedAmount: "4800.00",
    });

    const callOrder: string[] = [];
    acceptMock.mockImplementation(async () => {
      callOrder.push("accept");
      // simula efeito do accept: marca acceptedAt no plano para a re-leitura
      dbMock.state.plan = {
        ...dbMock.state.plan!,
        acceptedAt: new Date("2026-05-01T10:00:00Z"),
      };
      return { id: 1, acceptedAt: new Date("2026-05-01T10:00:00Z") };
    });
    materializeMock.mockImplementation(async () => {
      callOrder.push("materialize");
      return {
        planId: 1,
        appointmentsCreated: 4,
        invoicesCreated: 12,
        monthsCovered: 12,
        totalContractedAmount: "4800.00",
      };
    });

    const result = await acceptAndMaterializePlan({
      patientId: 7,
      planId: 1,
      ctx: { userId: 99 },
      trail: { signature: "Maria Silva", via: "presencial", acceptedClauseCodes: [] },
    });

    expect(callOrder).toEqual(["accept", "materialize"]);
    expect(result.ok).toBe(true);
    expect(result.materialization.appointmentsCreated).toBe(4);
    expect(result.materialization.invoicesCreated).toBe(12);
    expect(result.wasAlreadyAccepted).toBe(false);
    expect(result.wasAlreadyMaterialized).toBe(false);
    expect(dematerializeMock).not.toHaveBeenCalled();
  });

  it("rollback: se materialize falha, chama dematerialize + reseta acceptedAt", async () => {
    // Mesma configuração base do feliz
    dbMock.state.plan = {
      id: 1,
      patientId: 7,
      startDate: "2026-05-01",
      durationMonths: 12,
      acceptedAt: null,
      materializedAt: null,
    };
    dbMock.state.items = [
      {
        id: 10,
        kind: "recorrenteMensal",
        packageId: 5,
        packageType: "mensal",
        weekDays: '["monday"]',
        defaultStartTime: "09:00",
        startTimesByDay: null,
        scheduleId: 7,
        procedureId: 100,
        packageProcedureId: 100,
        totalSessions: null,
        unitMonthlyPrice: "400.00",
        unitPrice: null,
      },
    ];

    let selectIdx = 0;
    dbMock.select.mockImplementation(makeSelectImpl(() => ++selectIdx) as any);

    acceptMock.mockResolvedValue({ id: 1, acceptedAt: new Date() });
    materializeMock.mockRejectedValue(new Error("Schedule não encontrada"));
    dematerializeMock.mockResolvedValue({
      appointmentsDeleted: 0,
      invoicesDeleted: 0,
      appointmentsUnlinked: 0,
    });

    await expect(
      acceptAndMaterializePlan({
        patientId: 7,
        planId: 1,
        ctx: { userId: 99 },
        trail: { signature: "Maria", via: "presencial", acceptedClauseCodes: [] },
      }),
    ).rejects.toMatchObject({ status: 400 });

    expect(acceptMock).toHaveBeenCalledTimes(1);
    expect(materializeMock).toHaveBeenCalledTimes(1);
    expect(dematerializeMock).toHaveBeenCalledTimes(1);
    // revertPlanAcceptance deve ter chamado update (revert)
    expect(dbMock.update).toHaveBeenCalled();
    const lastUpdateCall = dbMock.state.updateCalls[dbMock.state.updateCalls.length - 1];
    expect(lastUpdateCall.values).toMatchObject({
      acceptedAt: null,
      acceptedBy: null,
      frozenPricesJson: null,
      acceptedClausesJson: null,
    });
  });

  it("idempotente: se já aceito e materializado, não chama nada", async () => {
    dbMock.state.plan = {
      id: 1,
      patientId: 7,
      startDate: "2026-05-01",
      durationMonths: 12,
      acceptedAt: new Date("2026-04-01T00:00:00Z"),
      materializedAt: new Date("2026-04-01T00:00:01Z"),
    };
    dbMock.state.items = [
      {
        id: 10,
        kind: "recorrenteMensal",
        packageId: 5,
        packageType: "mensal",
        weekDays: '["monday"]',
        defaultStartTime: "09:00",
        startTimesByDay: null,
        scheduleId: 7,
        procedureId: 100,
        packageProcedureId: 100,
        totalSessions: null,
        unitMonthlyPrice: "400.00",
        unitPrice: null,
      },
    ];

    let selectIdx = 0;
    dbMock.select.mockImplementation(makeSelectImpl(() => ++selectIdx) as any);

    const result = await acceptAndMaterializePlan({
      patientId: 7,
      planId: 1,
      ctx: { userId: 99 },
      trail: { signature: "Maria", via: "presencial", acceptedClauseCodes: [] },
    });

    expect(result.wasAlreadyAccepted).toBe(true);
    expect(result.wasAlreadyMaterialized).toBe(true);
    expect(acceptMock).not.toHaveBeenCalled();
    expect(materializeMock).not.toHaveBeenCalled();
    expect(dematerializeMock).not.toHaveBeenCalled();
  });

  it("falha 400 quando validação prévia rejeita (sem chamar accept/materialize)", async () => {
    dbMock.state.plan = {
      id: 1,
      patientId: 7,
      startDate: "2026-05-01",
      durationMonths: 12,
      acceptedAt: null,
      materializedAt: null,
    };
    dbMock.state.items = [
      {
        id: 10,
        kind: "recorrenteMensal",
        packageId: 5,
        packageType: "mensal",
        weekDays: null, // ← força erro
        defaultStartTime: null,
        startTimesByDay: null,
        scheduleId: null,
        procedureId: 100,
        packageProcedureId: 100,
        totalSessions: null,
        unitMonthlyPrice: "400.00",
        unitPrice: null,
      },
    ];

    let selectIdx = 0;
    dbMock.select.mockImplementation(makeSelectImpl(() => ++selectIdx) as any);

    await expect(
      acceptAndMaterializePlan({
        patientId: 7,
        planId: 1,
        ctx: { userId: 99 },
        trail: { signature: "Maria", via: "presencial", acceptedClauseCodes: [] },
      }),
    ).rejects.toMatchObject({ status: 400 });

    expect(acceptMock).not.toHaveBeenCalled();
    expect(materializeMock).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// revertPlanAcceptance
// ────────────────────────────────────────────────────────────────────────────

describe("revertPlanAcceptance", () => {
  it("zera todos os campos de trilha de aceite", async () => {
    await revertPlanAcceptance(42);

    expect(dbMock.update).toHaveBeenCalled();
    const call = dbMock.state.updateCalls[dbMock.state.updateCalls.length - 1];
    expect(call.values).toEqual({
      acceptedAt: null,
      acceptedBy: null,
      frozenPricesJson: null,
      acceptedClausesJson: null,
      acceptedBySignature: null,
      acceptedIp: null,
      acceptedDevice: null,
      acceptedVia: null,
    });
  });
});
