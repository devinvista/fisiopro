/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Sprint 15 (F5) — Testes do sistema de holds para slots.
 *
 * Cobertura:
 *   - Validação de input (slots mal-formados, vazios, items inexistentes).
 *   - Conflito com appointment existente → 409 `slot_conflict`.
 *   - Conflito com hold vivo de OUTRO plano → 409 `slot_conflict`.
 *   - Holds expirados são filtrados pela query (não bloqueiam).
 *   - Idempotência: renovar próprio hold sobrescreve sem conflito consigo mesmo.
 *   - releaseHolds e purgeExpiredHolds chamam o update correto.
 *   - findConflictsForPlanMaterialization usa o preview e checa contra outros holds.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Mock do banco — arquitetura idêntica ao treatment-plans.atomic.test.ts ──
const dbMock = vi.hoisted(() => {
  type Row = Record<string, unknown>;

  const state = {
    /** Linha do plano corrente (resposta de SELECT em treatmentPlansTable.id = X). */
    plan: null as Row | null,
    /** Items do plano (resposta de SELECT em treatmentPlanProceduresTable). */
    items: [] as Row[],
    /** Appointments existentes a serem retornados pela query de conflito. */
    appointments: [] as Row[],
    /** Outros planos com hold vivo (filtro por slotHoldsExpiresAt > NOW). */
    otherPlanHolds: [] as Row[],
    /** Histórico de updates feitos. */
    updateCalls: [] as Array<{ values: Row; returning: Row[] | null }>,
    /** Modo de leitura: cada chamada select() devolve linhas de uma fila. */
    selectQueue: [] as Row[][],
  };

  function selectChain(rows: Row[]): any {
    const chain: any = {
      from: () => chain,
      leftJoin: () => chain,
      innerJoin: () => chain,
      where: () => chain,
      limit: () => Promise.resolve(rows),
      then: (cb: any) => Promise.resolve(rows).then(cb),
    };
    return chain;
  }

  const db = {
    select: vi.fn((_cols?: any) => {
      const next = state.selectQueue.shift() ?? [];
      return selectChain(next);
    }) as any,
    update: vi.fn((_table: unknown) => {
      let setValues: Row = {};
      const chain: any = {
        set: (values: Row) => {
          setValues = values;
          return chain;
        },
        where: (_cond: unknown) => {
          const r: { values: Row; returning: Row[] | null } = {
            values: setValues,
            returning: null,
          };
          state.updateCalls.push(r);
          // returning() encadeado é opcional; quando chamado, devolvemos
          // um array configurado pelo teste.
          return {
            returning: () => Promise.resolve(state.updateCalls.at(-1)?.returning ?? []),
            then: (cb: any) => Promise.resolve().then(cb),
          };
        },
      };
      return chain;
    }) as any,
    state,
    reset() {
      state.plan = null;
      state.items = [];
      state.appointments = [];
      state.otherPlanHolds = [];
      state.updateCalls = [];
      state.selectQueue = [];
    },
  } as any;

  return db;
});

// drizzle-orm helpers — apenas precisamos que retornem algo truthy.
vi.mock("drizzle-orm", () => ({
  and: (...args: any[]) => ({ __op: "and", args }),
  eq: (...args: any[]) => ({ __op: "eq", args }),
  ne: (...args: any[]) => ({ __op: "ne", args }),
  inArray: (...args: any[]) => ({ __op: "inArray", args }),
  isNotNull: (...args: any[]) => ({ __op: "isNotNull", args }),
  sql: (..._args: any[]) => ({ __op: "sql" }),
}));

vi.mock("@workspace/db", () => ({
  db: dbMock,
  treatmentPlansTable: {
    id: "plans.id",
    materializedAt: "plans.materializedAt",
    slotHoldsJson: "plans.slotHoldsJson",
    slotHoldsExpiresAt: "plans.slotHoldsExpiresAt",
  },
  treatmentPlanProceduresTable: {
    id: "items.id",
    treatmentPlanId: "items.treatmentPlanId",
    scheduleId: "items.scheduleId",
    procedureId: "items.procedureId",
  },
  appointmentsTable: {
    id: "appts.id",
    date: "appts.date",
    startTime: "appts.startTime",
    endTime: "appts.endTime",
    scheduleId: "appts.scheduleId",
    status: "appts.status",
  },
}));

// Mock de `enumeratePlanAppointments` para
// `findConflictsForPlanMaterialization`.
const enumerateMock = vi.fn();
vi.mock("./treatment-plans.preview.js", () => ({
  enumeratePlanAppointments: (...args: any[]) => enumerateMock(...args),
}));

import {
  createOrRenewHolds,
  releaseHolds,
  getHolds,
  purgeExpiredHolds,
  findConflictsForPlanMaterialization,
  DEFAULT_HOLD_TTL_MINUTES,
} from "./slot-holds.service.js";
import { HttpError } from "../../../utils/httpError.js";

const PLAN_ID = 42;
const ITEM_ID = 7;
const SCHEDULE_ID = 3;
const PROCEDURE_ID = 11;

function validSlot(over: Partial<{ date: string; startTime: string; endTime: string }> = {}) {
  return {
    itemId: ITEM_ID,
    date: over.date ?? "2026-05-04",
    startTime: over.startTime ?? "08:00",
    endTime: over.endTime ?? "09:00",
    scheduleId: SCHEDULE_ID,
    procedureId: PROCEDURE_ID,
  };
}

function queueHappyPath() {
  // Ordem dos selects do createOrRenewHolds:
  // 1) items (validação de pertencimento)
  // 2) plan (existência + materializedAt)
  // 3) appointments conflitantes (pode ser []) — feito em Promise.all com (4)
  // 4) outros planos com hold vivo (pode ser [])
  // Como Promise.all não garante ordem das chamadas síncronas, mas elas
  // são consumidas pelo mesmo `state.selectQueue.shift()`, basta empilhar
  // appointments + otherPlanHolds em qualquer ordem — porém a ordem das
  // chamadas no service é determinística (findConflictingAppointments roda
  // antes de findConflictingHolds dentro do Promise.all).
  dbMock.state.selectQueue.push(
    [{ id: ITEM_ID, treatmentPlanId: PLAN_ID }], // items
    [{ id: PLAN_ID, materializedAt: null }],     // plan
    dbMock.state.appointments,                   // appointments
    dbMock.state.otherPlanHolds,                 // outros holds
  );
}

beforeEach(() => {
  dbMock.reset();
  enumerateMock.mockReset();
});

describe("createOrRenewHolds — validação de input", () => {
  it("rejeita lista vazia com 400 no_slots", async () => {
    await expect(createOrRenewHolds(PLAN_ID, [])).rejects.toMatchObject({
      status: 400,
      issues: { code: "no_slots" },
    });
  });

  it("rejeita slot mal-formado (endTime <= startTime)", async () => {
    await expect(
      createOrRenewHolds(PLAN_ID, [validSlot({ startTime: "10:00", endTime: "10:00" })]),
    ).rejects.toBeInstanceOf(HttpError);
  });

  it("rejeita item que não pertence ao plano", async () => {
    dbMock.state.selectQueue.push(
      [{ id: ITEM_ID, treatmentPlanId: 999 }], // outro plano
    );
    await expect(createOrRenewHolds(PLAN_ID, [validSlot()])).rejects.toMatchObject({
      status: 400,
      issues: { code: "item_plan_mismatch" },
    });
  });

  it("rejeita planId já materializado", async () => {
    dbMock.state.selectQueue.push(
      [{ id: ITEM_ID, treatmentPlanId: PLAN_ID }],
      [{ id: PLAN_ID, materializedAt: new Date() }],
    );
    await expect(createOrRenewHolds(PLAN_ID, [validSlot()])).rejects.toMatchObject({
      status: 400,
      issues: { code: "plan_already_materialized" },
    });
  });
});

describe("createOrRenewHolds — conflitos", () => {
  it("retorna 409 com conflicts quando appointment já ocupa o slot", async () => {
    dbMock.state.appointments = [
      {
        id: 555,
        date: "2026-05-04",
        startTime: "08:30", // overlap com 08:00-09:00
        endTime: "09:30",
        scheduleId: SCHEDULE_ID,
      },
    ];
    queueHappyPath();
    await expect(createOrRenewHolds(PLAN_ID, [validSlot()])).rejects.toMatchObject({
      status: 409,
      issues: {
        code: "slot_conflict",
        conflicts: [
          {
            source: "appointment",
            conflictingAppointmentId: 555,
          },
        ],
      },
    });
  });

  it("retorna 409 quando outro plano tem hold vivo no mesmo slot", async () => {
    dbMock.state.otherPlanHolds = [
      {
        planId: 99,
        json: JSON.stringify([validSlot({ startTime: "08:30", endTime: "09:30" })]),
        expiresAt: new Date(Date.now() + 5 * 60_000),
      },
    ];
    queueHappyPath();
    await expect(createOrRenewHolds(PLAN_ID, [validSlot()])).rejects.toMatchObject({
      status: 409,
      issues: {
        code: "slot_conflict",
        conflicts: [{ source: "hold", conflictingPlanId: 99 }],
      },
    });
  });

  it("não conflita quando o slot está em outra agenda (scheduleId diferente)", async () => {
    dbMock.state.appointments = [
      {
        id: 555,
        date: "2026-05-04",
        startTime: "08:00",
        endTime: "09:00",
        scheduleId: 999, // outra agenda
      },
    ];
    queueHappyPath();
    const result = await createOrRenewHolds(PLAN_ID, [validSlot()]);
    expect(result.ok).toBe(true);
    expect(result.slots).toHaveLength(1);
  });

  it("não conflita quando o intervalo NÃO se sobrepõe (touching)", async () => {
    dbMock.state.appointments = [
      {
        id: 555,
        date: "2026-05-04",
        startTime: "07:00",
        endTime: "08:00", // termina exatamente no início do nosso slot
        scheduleId: SCHEDULE_ID,
      },
    ];
    queueHappyPath();
    const result = await createOrRenewHolds(PLAN_ID, [validSlot()]);
    expect(result.ok).toBe(true);
  });
});

describe("createOrRenewHolds — caminho feliz", () => {
  it("persiste o hold com TTL default e devolve expiresAt", async () => {
    queueHappyPath();
    const before = Date.now();
    const result = await createOrRenewHolds(PLAN_ID, [validSlot()]);
    expect(result.ok).toBe(true);
    expect(result.slots).toHaveLength(1);
    expect(result.ttlSecondsRemaining).toBe(DEFAULT_HOLD_TTL_MINUTES * 60);
    const expiresAt = new Date(result.expiresAt).getTime();
    expect(expiresAt).toBeGreaterThanOrEqual(before + DEFAULT_HOLD_TTL_MINUTES * 60_000 - 100);
    // Update foi chamado com slotHoldsJson preenchido.
    expect(dbMock.state.updateCalls).toHaveLength(1);
    const call = dbMock.state.updateCalls[0];
    expect(call.values.slotHoldsJson).toEqual(JSON.stringify([validSlot()]));
    expect(call.values.slotHoldsExpiresAt).toBeInstanceOf(Date);
  });

  it("respeita ttlMinutes customizado dentro do MAX", async () => {
    queueHappyPath();
    const result = await createOrRenewHolds(PLAN_ID, [validSlot()], 30);
    expect(result.ttlSecondsRemaining).toBe(30 * 60);
  });

  it("clampa ttl > MAX para 60min", async () => {
    queueHappyPath();
    const result = await createOrRenewHolds(PLAN_ID, [validSlot()], 9999);
    expect(result.ttlSecondsRemaining).toBe(60 * 60);
  });
});

describe("releaseHolds + getHolds + purgeExpiredHolds", () => {
  it("releaseHolds chama UPDATE com slotHoldsJson=null", async () => {
    await releaseHolds(PLAN_ID);
    expect(dbMock.state.updateCalls).toHaveLength(1);
    expect(dbMock.state.updateCalls[0].values).toEqual({
      slotHoldsJson: null,
      slotHoldsExpiresAt: null,
    });
  });

  it("getHolds devolve slots vazios para hold expirado", async () => {
    dbMock.state.selectQueue.push([
      {
        json: JSON.stringify([validSlot()]),
        expiresAt: new Date(Date.now() - 10 * 60_000),
      },
    ]);
    const status = await getHolds(PLAN_ID);
    expect(status.slots).toEqual([]);
    expect(status.expiresAt).toBeNull();
  });

  it("getHolds devolve slots e ttl positivo para hold ativo", async () => {
    const expiresAt = new Date(Date.now() + 5 * 60_000);
    dbMock.state.selectQueue.push([
      { json: JSON.stringify([validSlot()]), expiresAt },
    ]);
    const status = await getHolds(PLAN_ID);
    expect(status.slots).toHaveLength(1);
    expect(status.ttlSecondsRemaining).toBeGreaterThan(0);
    expect(status.expiresAt).toBe(expiresAt.toISOString());
  });

  it("getHolds 404 para plano inexistente", async () => {
    dbMock.state.selectQueue.push([]);
    await expect(getHolds(PLAN_ID)).rejects.toMatchObject({ status: 404 });
  });

  it("purgeExpiredHolds usa returning() para contar limpos", async () => {
    // Um hack: empurra returning para o último update.
    dbMock.update.mockImplementationOnce(() => {
      const chain: any = {
        set: () => chain,
        where: () => ({
          returning: () => Promise.resolve([{ id: 1 }, { id: 2 }, { id: 3 }]),
        }),
      };
      return chain;
    });
    const result = await purgeExpiredHolds();
    expect(result.cleared).toBe(3);
  });
});

describe("findConflictsForPlanMaterialization", () => {
  it("devolve lista vazia quando não há appointments enumerados", async () => {
    enumerateMock.mockResolvedValueOnce({ appointments: [] });
    const out = await findConflictsForPlanMaterialization(PLAN_ID);
    expect(out).toEqual([]);
  });

  it("detecta conflito com hold vivo de outro plano", async () => {
    enumerateMock.mockResolvedValueOnce({
      appointments: [
        { itemId: ITEM_ID, date: "2026-05-04", startTime: "08:00", endTime: "09:00" },
      ],
    });
    // 1) items (lookup de scheduleId)  2) outros planos com hold vivo
    dbMock.state.selectQueue.push(
      [{ id: ITEM_ID, scheduleId: SCHEDULE_ID, procedureId: PROCEDURE_ID }],
      [
        {
          planId: 99,
          json: JSON.stringify([
            { itemId: 1, date: "2026-05-04", startTime: "08:30", endTime: "09:30", scheduleId: SCHEDULE_ID, procedureId: 1 },
          ]),
          expiresAt: new Date(Date.now() + 5 * 60_000),
        },
      ],
    );
    const out = await findConflictsForPlanMaterialization(PLAN_ID);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ source: "hold", conflictingPlanId: 99 });
  });

  it("ignora itens sem scheduleId (mensalidades sem agenda configurada)", async () => {
    enumerateMock.mockResolvedValueOnce({
      appointments: [
        { itemId: ITEM_ID, date: "2026-05-04", startTime: "08:00", endTime: "09:00" },
      ],
    });
    dbMock.state.selectQueue.push(
      [{ id: ITEM_ID, scheduleId: null, procedureId: PROCEDURE_ID }],
      // não chega a buscar outros holds porque slots fica vazio
    );
    const out = await findConflictsForPlanMaterialization(PLAN_ID);
    expect(out).toEqual([]);
  });
});
