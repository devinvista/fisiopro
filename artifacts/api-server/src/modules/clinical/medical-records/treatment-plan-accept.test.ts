import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Mock do repo (única dependência externa do service relevante para este fluxo) ───
const repoMock = vi.hoisted(() => {
  return {
    getTreatmentPlan: vi.fn(),
    listTreatmentPlanProceduresWithCatalog: vi.fn(),
    acceptTreatmentPlan: vi.fn(),
    updateTreatmentPlan: vi.fn(),
    createTreatmentPlan: vi.fn(),
    cloneTreatmentPlanProcedures: vi.fn(),
  };
});

vi.mock("./medical-records.repository.js", () => repoMock);

// Audit log e cloudinary não interessam aqui — silenciamos.
vi.mock("../../../utils/auditLog.js", () => ({ logAudit: vi.fn() }));
vi.mock("../../../utils/cloudinary.js", () => ({
  deleteCloudinaryAsset: vi.fn(),
  extractPublicId: vi.fn(),
}));

// Sprint 2: o aceite chama `acceptPlanFinancials` (faturas/créditos). Aqui o foco
// é o fluxo de snapshot/auditoria do service — silenciamos o efeito financeiro,
// que tem cobertura própria em `treatment-plans.acceptance.test.ts`.
vi.mock("./treatment-plans.acceptance.js", () => ({
  acceptPlanFinancials: vi.fn(async (planId: number) => ({
    planId,
    invoicesCreated: 0,
    creditsCreated: 0,
    totalImmediateCharge: "0.00",
  })),
}));

const {
  acceptPatientTreatmentPlan,
  updatePatientTreatmentPlanById,
  renegotiatePatientTreatmentPlan,
} = await import("./medical-records.service.js");

const ctx = { userId: 99 };

function planFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    patientId: 7,
    clinicId: 1,
    status: "ativo",
    acceptedAt: null,
    acceptedBy: null,
    frozenPricesJson: null,
    parentPlanId: null,
    objectives: "obj",
    techniques: null,
    frequency: null,
    estimatedSessions: null,
    startDate: null,
    responsibleProfessional: null,
    ...overrides,
  };
}

describe("acceptPatientTreatmentPlan", () => {
  beforeEach(() => {
    repoMock.getTreatmentPlan.mockReset();
    repoMock.listTreatmentPlanProceduresWithCatalog.mockReset();
    repoMock.acceptTreatmentPlan.mockReset();
    repoMock.updateTreatmentPlan.mockReset();
  });

  it("congela snapshot com effectivePrice = unitPrice − discount e total = effective × sessões", async () => {
    repoMock.getTreatmentPlan.mockResolvedValue(planFixture());
    repoMock.listTreatmentPlanProceduresWithCatalog.mockResolvedValue([
      {
        id: 1,
        procedureId: 100,
        packageId: null,
        procedureName: "Sessão fisio",
        unitPrice: "80.00",
        discount: "10",
        totalSessions: 10,
        sessionsPerWeek: 2,
        tablePrice: "80.00",
      },
      {
        id: 2,
        procedureId: 101,
        packageId: null,
        procedureName: "Pilates",
        unitPrice: "120.00", // negociado ACIMA da tabela
        discount: "0",
        totalSessions: 8,
        sessionsPerWeek: 1,
        tablePrice: "100.00",
      },
    ]);
    repoMock.acceptTreatmentPlan.mockImplementation(
      async (_planId, _patientId, _by, json) =>
        planFixture({ acceptedAt: new Date(), acceptedBy: 99, frozenPricesJson: json }),
    );

    const result = await acceptPatientTreatmentPlan(7, 10, ctx);

    expect(result.acceptedAt).toBeInstanceOf(Date);
    expect(repoMock.acceptTreatmentPlan).toHaveBeenCalledOnce();

    const [, , , json] = repoMock.acceptTreatmentPlan.mock.calls[0];
    const snapshot = JSON.parse(json);

    expect(snapshot.capturedBy).toBe(99);
    expect(snapshot.items).toHaveLength(2);

    // Item 1: 80 − 10 = 70, × 10 sessões = 700
    expect(snapshot.items[0].effectivePrice).toBe("70.00");
    expect(snapshot.items[0].estimatedTotalRevenue).toBe("700.00");
    expect(snapshot.items[0].tablePrice).toBe("80.00");

    // Item 2: 120 (acima da tabela), × 8 sessões = 960
    expect(snapshot.items[1].effectivePrice).toBe("120.00");
    expect(snapshot.items[1].estimatedTotalRevenue).toBe("960.00");
    expect(snapshot.items[1].tablePrice).toBe("100.00");

    // Total: 700 + 960 = 1660
    expect(snapshot.totalEstimatedRevenue).toBe("1660.00");
  });

  it("é idempotente: plano já aceito é devolvido sem novo snapshot", async () => {
    const accepted = planFixture({
      acceptedAt: new Date("2026-04-01T10:00:00Z"),
      acceptedBy: 50,
      frozenPricesJson: '{"items":[]}',
    });
    repoMock.getTreatmentPlan.mockResolvedValue(accepted);

    const result = await acceptPatientTreatmentPlan(7, 10, ctx);

    expect(result).toBe(accepted);
    expect(repoMock.listTreatmentPlanProceduresWithCatalog).not.toHaveBeenCalled();
    expect(repoMock.acceptTreatmentPlan).not.toHaveBeenCalled();
  });

  it("rejeita plano com status diferente de ativo", async () => {
    repoMock.getTreatmentPlan.mockResolvedValue(planFixture({ status: "concluido" }));

    await expect(acceptPatientTreatmentPlan(7, 10, ctx)).rejects.toMatchObject({
      status: 409,
    });
    expect(repoMock.acceptTreatmentPlan).not.toHaveBeenCalled();
  });

  it("rejeita plano sem procedimentos", async () => {
    repoMock.getTreatmentPlan.mockResolvedValue(planFixture());
    repoMock.listTreatmentPlanProceduresWithCatalog.mockResolvedValue([]);

    await expect(acceptPatientTreatmentPlan(7, 10, ctx)).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("procedimentos"),
    });
  });

  it("rejeita aceite sem usuário autenticado", async () => {
    await expect(acceptPatientTreatmentPlan(7, 10, {})).rejects.toMatchObject({
      status: 401,
    });
  });

  it("retorna 404 quando o plano não existe ou não pertence ao paciente", async () => {
    repoMock.getTreatmentPlan.mockResolvedValue(null);
    await expect(acceptPatientTreatmentPlan(7, 10, ctx)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("trata desconto > preço com clamp em 0 (sem receita negativa)", async () => {
    repoMock.getTreatmentPlan.mockResolvedValue(planFixture());
    repoMock.listTreatmentPlanProceduresWithCatalog.mockResolvedValue([
      {
        id: 1,
        procedureId: 100,
        packageId: null,
        procedureName: "Promoção",
        unitPrice: "20.00",
        discount: "50",
        totalSessions: 5,
        sessionsPerWeek: 1,
        tablePrice: "20.00",
      },
    ]);
    repoMock.acceptTreatmentPlan.mockImplementation(
      async (_p, _pa, _by, json) => planFixture({ acceptedAt: new Date(), frozenPricesJson: json }),
    );

    await acceptPatientTreatmentPlan(7, 10, ctx);

    const [, , , json] = repoMock.acceptTreatmentPlan.mock.calls[0];
    const snapshot = JSON.parse(json);
    expect(snapshot.items[0].effectivePrice).toBe("0.00");
    expect(snapshot.items[0].estimatedTotalRevenue).toBe("0.00");
    expect(snapshot.totalEstimatedRevenue).toBe("0.00");
  });
});

describe("updatePatientTreatmentPlanById com plano aceito (T4 - bloqueio)", () => {
  beforeEach(() => {
    repoMock.getTreatmentPlan.mockReset();
    repoMock.updateTreatmentPlan.mockReset();
  });

  it("permite alterar status, objetivos, técnicas e responsável após aceite", async () => {
    const accepted = planFixture({
      acceptedAt: new Date("2026-04-01T10:00:00Z"),
      acceptedBy: 50,
    });
    repoMock.getTreatmentPlan.mockResolvedValue(accepted);
    repoMock.updateTreatmentPlan.mockResolvedValue({ ...accepted, status: "concluido" });

    const result = await updatePatientTreatmentPlanById(
      7,
      10,
      { status: "concluido", objectives: "ajuste de objetivos" },
      ctx,
    );

    expect(result.status).toBe("concluido");
    expect(repoMock.updateTreatmentPlan).toHaveBeenCalledOnce();
    const [, , update] = repoMock.updateTreatmentPlan.mock.calls[0];
    expect(update).toEqual({ status: "concluido", objectives: "ajuste de objetivos" });
  });

  it("bloqueia alteração de frequency em plano aceito (exige renegociação)", async () => {
    const accepted = planFixture({ acceptedAt: new Date("2026-04-01T10:00:00Z") });
    repoMock.getTreatmentPlan.mockResolvedValue(accepted);

    await expect(
      updatePatientTreatmentPlanById(7, 10, { frequency: "3x/semana" }, ctx),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("renegociação"),
    });
    expect(repoMock.updateTreatmentPlan).not.toHaveBeenCalled();
  });

  it("bloqueia alteração de estimatedSessions em plano aceito", async () => {
    const accepted = planFixture({ acceptedAt: new Date("2026-04-01T10:00:00Z") });
    repoMock.getTreatmentPlan.mockResolvedValue(accepted);

    await expect(
      updatePatientTreatmentPlanById(7, 10, { estimatedSessions: 20 }, ctx),
    ).rejects.toMatchObject({ status: 409 });
    expect(repoMock.updateTreatmentPlan).not.toHaveBeenCalled();
  });

  it("bloqueia alteração de startDate em plano aceito", async () => {
    const accepted = planFixture({ acceptedAt: new Date("2026-04-01T10:00:00Z") });
    repoMock.getTreatmentPlan.mockResolvedValue(accepted);

    await expect(
      updatePatientTreatmentPlanById(7, 10, { startDate: "2026-05-01" }, ctx),
    ).rejects.toMatchObject({ status: 409 });
    expect(repoMock.updateTreatmentPlan).not.toHaveBeenCalled();
  });

  it("plano NÃO aceito permite alterar qualquer campo (comportamento legado)", async () => {
    const notAccepted = planFixture(); // acceptedAt: null
    repoMock.getTreatmentPlan.mockResolvedValue(notAccepted);
    repoMock.updateTreatmentPlan.mockResolvedValue({ ...notAccepted, frequency: "3x" });

    const result = await updatePatientTreatmentPlanById(
      7,
      10,
      { frequency: "3x", estimatedSessions: 20, startDate: "2026-05-01" },
      ctx,
    );
    expect(result).toBeDefined();
    expect(repoMock.updateTreatmentPlan).toHaveBeenCalledOnce();
  });
});

describe("renegotiatePatientTreatmentPlan (T4 - versionamento)", () => {
  beforeEach(() => {
    repoMock.getTreatmentPlan.mockReset();
    repoMock.createTreatmentPlan.mockReset();
    repoMock.cloneTreatmentPlanProcedures.mockReset();
    repoMock.updateTreatmentPlan.mockReset();
  });

  function acceptedPlan(overrides: Record<string, unknown> = {}) {
    return planFixture({
      id: 10,
      acceptedAt: new Date("2026-04-01T10:00:00Z"),
      acceptedBy: 50,
      frozenPricesJson: '{"items":[]}',
      frequency: "2x/semana",
      estimatedSessions: 10,
      startDate: "2026-04-15",
      objectives: "obj antigo",
      ...overrides,
    });
  }

  it("cria novo plano apontando parent_plan_id, clona procedimentos e encerra o anterior", async () => {
    const previous = acceptedPlan();
    repoMock.getTreatmentPlan.mockResolvedValue(previous);
    repoMock.createTreatmentPlan.mockImplementation(async (_pid, _cid, data) => ({
      id: 11,
      patientId: 7,
      clinicId: 1,
      ...data,
    }));
    repoMock.cloneTreatmentPlanProcedures.mockResolvedValue([{ id: 100 }, { id: 101 }]);
    repoMock.updateTreatmentPlan.mockResolvedValue({ ...previous, status: "concluido" });

    const result = await renegotiatePatientTreatmentPlan(7, 10, {}, ctx);

    // Novo plano criado com parentPlanId apontando pro anterior
    expect(repoMock.createTreatmentPlan).toHaveBeenCalledOnce();
    const [, , createPayload] = repoMock.createTreatmentPlan.mock.calls[0];
    expect(createPayload).toMatchObject({
      parentPlanId: 10,
      status: "ativo",
      frequency: "2x/semana", // herda do anterior quando sem override
      estimatedSessions: 10,
      startDate: "2026-04-15",
      objectives: "obj antigo",
    });
    // Não pode herdar acceptedAt — novo plano nasce sem aceite
    expect(createPayload).not.toHaveProperty("acceptedAt");
    expect(createPayload).not.toHaveProperty("frozenPricesJson");

    // Procedimentos clonados do antigo (10) para o novo (11)
    expect(repoMock.cloneTreatmentPlanProcedures).toHaveBeenCalledWith(10, 11);

    // Plano antigo marcado como concluído
    expect(repoMock.updateTreatmentPlan).toHaveBeenCalledWith(10, 7, { status: "concluido" });

    expect(result.next.id).toBe(11);
    expect(result.previous.status).toBe("concluido");
  });

  it("aplica overrides nos campos comerciais ao renegociar", async () => {
    repoMock.getTreatmentPlan.mockResolvedValue(acceptedPlan());
    repoMock.createTreatmentPlan.mockImplementation(async (_p, _c, data) => ({ id: 11, ...data }));
    repoMock.cloneTreatmentPlanProcedures.mockResolvedValue([]);
    repoMock.updateTreatmentPlan.mockResolvedValue({});

    await renegotiatePatientTreatmentPlan(
      7,
      10,
      { frequency: "3x/semana", estimatedSessions: 20, startDate: "2026-05-01" },
      ctx,
    );

    const [, , createPayload] = repoMock.createTreatmentPlan.mock.calls[0];
    expect(createPayload).toMatchObject({
      frequency: "3x/semana",
      estimatedSessions: 20,
      startDate: "2026-05-01",
      parentPlanId: 10,
    });
  });

  it("rejeita renegociação de plano NÃO aceito", async () => {
    repoMock.getTreatmentPlan.mockResolvedValue(planFixture()); // acceptedAt null

    await expect(renegotiatePatientTreatmentPlan(7, 10, {}, ctx)).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("ainda não foi aceito"),
    });
    expect(repoMock.createTreatmentPlan).not.toHaveBeenCalled();
  });

  it("rejeita renegociação de plano com status diferente de ativo", async () => {
    repoMock.getTreatmentPlan.mockResolvedValue(acceptedPlan({ status: "concluido" }));

    await expect(renegotiatePatientTreatmentPlan(7, 10, {}, ctx)).rejects.toMatchObject({
      status: 409,
    });
    expect(repoMock.createTreatmentPlan).not.toHaveBeenCalled();
  });

  it("rejeita renegociação sem usuário autenticado", async () => {
    await expect(renegotiatePatientTreatmentPlan(7, 10, {}, {})).rejects.toMatchObject({
      status: 401,
    });
    expect(repoMock.getTreatmentPlan).not.toHaveBeenCalled();
  });

  it("retorna 404 quando o plano não existe", async () => {
    repoMock.getTreatmentPlan.mockResolvedValue(null);

    await expect(renegotiatePatientTreatmentPlan(7, 10, {}, ctx)).rejects.toMatchObject({
      status: 404,
    });
  });
});
