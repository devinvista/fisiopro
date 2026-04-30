/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Sprint 15 (F4) — Testes do enumerador de preview de appointments.
 *
 * Cobertura:
 *  - Plano sem startDate → resultado vazio.
 *  - Item recorrenteMensal sem dias da semana / sem horário → reportado em
 *    `itemsWithoutSchedule`, sem appointments.
 *  - Item recorrenteMensal com dias + defaultStartTime → enumera todas as
 *    ocorrências dentro de cada mês de competência, agrupadas por monthRef.
 *  - Item pacoteSessoes sem scheduleId → reportado em `itemsWithoutSchedule`.
 *  - Item pacoteSessoes com schedule + cap → enumera só as N primeiras.
 *  - Saída ordenada por (data, horário).
 *
 * O DB é mockado (chains do drizzle resolvem para arrays controlados).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

type Row = Record<string, unknown>;

const dbState = vi.hoisted(() => ({
  selectQueue: [] as Row[][],
}));

vi.mock("@workspace/db", () => {
  function selectChain(rowsPromise: Promise<Row[]>): any {
    const chain: any = {
      from: () => chain,
      leftJoin: () => chain,
      innerJoin: () => chain,
      where: () => chain,
      limit: () => rowsPromise,
      then: (cb: any) => rowsPromise.then(cb),
    };
    return chain;
  }
  const db = {
    select: vi.fn(() => {
      const next = dbState.selectQueue.shift() ?? [];
      return selectChain(Promise.resolve(next));
    }) as any,
  };
  return {
    db,
    treatmentPlansTable: { id: "plan.id", startDate: "plan.start", durationMonths: "plan.dur" },
    treatmentPlanProceduresTable: {
      id: "tpp.id",
      kind: "tpp.kind",
      procedureId: "tpp.procedure_id",
      packageId: "tpp.package_id",
      totalSessions: "tpp.total",
      weekDays: "tpp.weekdays",
      defaultStartTime: "tpp.default_start",
      startTimesByDay: "tpp.start_by_day",
      defaultProfessionalId: "tpp.default_pro",
      scheduleId: "tpp.schedule_id",
      treatmentPlanId: "tpp.plan_id",
    },
    packagesTable: { id: "pkg.id", packageType: "pkg.type", procedureId: "pkg.procedure_id" },
    proceduresTable: { id: "proc.id", name: "proc.name", durationMinutes: "proc.dur" },
    usersTable: { id: "u.id", name: "u.name" },
  };
});

vi.mock("drizzle-orm", () => ({
  eq: (a: any, b: any) => ({ _op: "eq", a, b }),
}));

import { enumeratePlanAppointments } from "./treatment-plans.preview.js";

beforeEach(() => {
  dbState.selectQueue = [];
});

describe("enumeratePlanAppointments", () => {
  it("retorna vazio se o plano não tem startDate", async () => {
    dbState.selectQueue = [
      [{ id: 1, startDate: null, durationMonths: 3 }], // plan
    ];
    const r = await enumeratePlanAppointments(1);
    expect(r).toEqual({
      appointments: [],
      totalCount: 0,
      monthsCovered: 0,
      itemsWithoutSchedule: [],
    });
  });

  it("reporta itens recorrentes sem dias da semana em itemsWithoutSchedule", async () => {
    dbState.selectQueue = [
      [{ id: 10, startDate: "2026-05-04", durationMonths: 1 }], // plan
      [
        {
          id: 100,
          kind: "recorrenteMensal",
          procedureId: 5,
          packageId: 7,
          totalSessions: null,
          weekDays: null,
          defaultStartTime: null,
          startTimesByDay: null,
          defaultProfessionalId: null,
          scheduleId: null,
          packageType: "mensal",
          packageProcedureId: 5,
          procedureName: "Fisio",
          procedureDuration: 50,
          professionalName: null,
        },
      ],
    ];
    const r = await enumeratePlanAppointments(10);
    expect(r.appointments).toEqual([]);
    expect(r.itemsWithoutSchedule).toEqual([100]);
    expect(r.totalCount).toBe(0);
  });

  it("enumera ocorrências de item recorrenteMensal nos meses de competência", async () => {
    // Plano: 04/05/2026 (segunda), 2 meses → maio + junho.
    // Item: segundas e quartas, 09:00, 50min.
    dbState.selectQueue = [
      [{ id: 20, startDate: "2026-05-04", durationMonths: 2 }], // plan
      [
        {
          id: 200,
          kind: "recorrenteMensal",
          procedureId: 5,
          packageId: 7,
          totalSessions: null,
          weekDays: "monday,wednesday",
          defaultStartTime: "09:00",
          startTimesByDay: null,
          defaultProfessionalId: 11,
          scheduleId: null,
          packageType: "mensal",
          packageProcedureId: 5,
          procedureName: "Fisio adulto",
          procedureDuration: 50,
          professionalName: "Dra. Ana",
        },
      ],
    ];
    const r = await enumeratePlanAppointments(20);

    // Maio/2026: seg(4,11,18,25) + qua(6,13,20,27) = 8.
    // Junho/2026: seg(1,8,15,22,29) + qua(3,10,17,24) = 9.
    expect(r.appointments.length).toBe(17);
    expect(r.itemsWithoutSchedule).toEqual([]);
    expect(r.monthsCovered).toBe(2);

    // Saída ordenada por data:
    expect(r.appointments[0]).toMatchObject({
      date: "2026-05-04",
      startTime: "09:00",
      endTime: "09:50",
      procedureName: "Fisio adulto",
      professionalName: "Dra. Ana",
      monthRef: "2026-05-01",
      itemId: 200,
      itemKind: "recorrenteMensal",
    });
    expect(r.appointments.at(-1)?.date).toBe("2026-06-29");

    // monthRef agrupa em primeiros dias dos meses corretos.
    const refs = new Set(r.appointments.map((a) => a.monthRef));
    expect(refs).toEqual(new Set(["2026-05-01", "2026-06-01"]));
  });

  it("não inclui datas anteriores ao startDate dentro do primeiro mês", async () => {
    // startDate em 15/05 → consultas de seg/qua antes do dia 15 NÃO devem aparecer.
    dbState.selectQueue = [
      [{ id: 21, startDate: "2026-05-15", durationMonths: 1 }],
      [
        {
          id: 210,
          kind: "recorrenteMensal",
          procedureId: 5,
          packageId: null,
          totalSessions: null,
          weekDays: "monday,wednesday",
          defaultStartTime: "08:00",
          startTimesByDay: null,
          defaultProfessionalId: null,
          scheduleId: null,
          packageType: null,
          packageProcedureId: null,
          procedureName: "Fisio",
          procedureDuration: 30,
          professionalName: null,
        },
      ],
    ];
    const r = await enumeratePlanAppointments(21);
    // A partir do dia 15 (sex): seg 18, qua 20, seg 25, qua 27 = 4.
    expect(r.appointments.map((a) => a.date)).toEqual([
      "2026-05-18",
      "2026-05-20",
      "2026-05-25",
      "2026-05-27",
    ]);
  });

  it("pacoteSessoes sem scheduleId entra em itemsWithoutSchedule", async () => {
    dbState.selectQueue = [
      [{ id: 30, startDate: "2026-05-04", durationMonths: 3 }],
      [
        {
          id: 300,
          kind: "pacoteSessoes",
          procedureId: 5,
          packageId: 9,
          totalSessions: 10,
          weekDays: "tuesday,thursday",
          defaultStartTime: "10:00",
          startTimesByDay: null,
          defaultProfessionalId: null,
          scheduleId: null, // ← falta
          packageType: "sessoes",
          packageProcedureId: 5,
          procedureName: "RPG",
          procedureDuration: 60,
          professionalName: null,
        },
      ],
    ];
    const r = await enumeratePlanAppointments(30);
    expect(r.appointments).toEqual([]);
    expect(r.itemsWithoutSchedule).toEqual([300]);
  });

  it("pacoteSessoes com schedule enumera apenas as N primeiras sessões", async () => {
    // 10 sessões, ter+qui a partir de 04/05/2026 → ter 5, qui 7, ter 12, qui 14...
    dbState.selectQueue = [
      [{ id: 31, startDate: "2026-05-04", durationMonths: 6 }],
      [
        {
          id: 310,
          kind: "pacoteSessoes",
          procedureId: 5,
          packageId: 9,
          totalSessions: 4,
          weekDays: "tuesday,thursday",
          defaultStartTime: "10:00",
          startTimesByDay: null,
          defaultProfessionalId: null,
          scheduleId: 77,
          packageType: "sessoes",
          packageProcedureId: 5,
          procedureName: "RPG",
          procedureDuration: 60,
          professionalName: null,
        },
      ],
    ];
    const r = await enumeratePlanAppointments(31);
    expect(r.appointments.map((a) => a.date)).toEqual([
      "2026-05-05",
      "2026-05-07",
      "2026-05-12",
      "2026-05-14",
    ]);
    expect(r.appointments[0]).toMatchObject({
      startTime: "10:00",
      endTime: "11:00",
      itemKind: "pacoteSessoes",
      monthRef: "2026-05-01",
    });
  });

  it("ordena a saída final por (data, horário)", async () => {
    // 2 itens recorrentes em horários diferentes — saída deve intercalar
    // por data crescente, e dentro do mesmo dia por horário crescente.
    dbState.selectQueue = [
      [{ id: 40, startDate: "2026-05-04", durationMonths: 1 }],
      [
        {
          id: 401,
          kind: "recorrenteMensal",
          procedureId: 5,
          packageId: 7,
          totalSessions: null,
          weekDays: "monday",
          defaultStartTime: "14:00",
          startTimesByDay: null,
          defaultProfessionalId: null,
          scheduleId: null,
          packageType: "mensal",
          packageProcedureId: 5,
          procedureName: "Tarde",
          procedureDuration: 30,
          professionalName: null,
        },
        {
          id: 402,
          kind: "recorrenteMensal",
          procedureId: 5,
          packageId: 7,
          totalSessions: null,
          weekDays: "monday",
          defaultStartTime: "08:00",
          startTimesByDay: null,
          defaultProfessionalId: null,
          scheduleId: null,
          packageType: "mensal",
          packageProcedureId: 5,
          procedureName: "Manhã",
          procedureDuration: 30,
          professionalName: null,
        },
      ],
    ];
    const r = await enumeratePlanAppointments(40);
    // Segundas de maio: 4, 11, 18, 25 → 8 consultas no total (2 por dia).
    expect(r.appointments.length).toBe(8);
    // Para cada data, o item das 08:00 vem antes do das 14:00.
    for (let i = 0; i < r.appointments.length; i += 2) {
      expect(r.appointments[i].date).toBe(r.appointments[i + 1].date);
      expect(r.appointments[i].startTime).toBe("08:00");
      expect(r.appointments[i + 1].startTime).toBe("14:00");
    }
  });
});
