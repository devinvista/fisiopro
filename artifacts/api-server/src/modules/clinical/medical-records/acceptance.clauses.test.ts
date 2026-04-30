/**
 * Sprint Financeiro 11 (P5) — integração entre o aceite do plano e o validador
 * de cláusulas. Garante que:
 *   • clínica sem cláusulas → aceite procede normalmente, sem snapshot;
 *   • clínica com cláusulas obrigatórias e paciente sem marcar → 400
 *     ("clause_required_missing"); aceite NÃO é persistido;
 *   • cláusulas marcadas corretamente → snapshot é serializado e passado para
 *     `repo.acceptTreatmentPlan` como 6º argumento.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const repoMock = vi.hoisted(() => ({
  getTreatmentPlan: vi.fn(),
  listTreatmentPlanProceduresWithCatalog: vi.fn(),
  acceptTreatmentPlan: vi.fn(),
  getPatientClinicId: vi.fn(),
}));

vi.mock("./medical-records.repository.js", () => repoMock);
vi.mock("../../../utils/auditLog.js", () => ({ logAudit: vi.fn() }));
vi.mock("../../../utils/cloudinary.js", () => ({
  deleteCloudinaryAsset: vi.fn(),
  extractPublicId: vi.fn(),
}));
vi.mock("./treatment-plans.acceptance.js", () => ({
  acceptPlanFinancials: vi.fn(async (planId: number) => ({
    planId,
    invoicesCreated: 0,
    creditsCreated: 0,
    totalImmediateCharge: "0.00",
  })),
}));

const clausesMock = vi.hoisted(() => ({
  buildAcceptedClausesSnapshot: vi.fn(),
}));
vi.mock("../contract-clauses/contract-clauses.service.js", () => clausesMock);

const { acceptPatientTreatmentPlan } = await import("./medical-records.service.js");

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

const oneItem = [
  {
    id: 1,
    procedureId: 100,
    packageId: null,
    procedureName: "Sessão",
    unitPrice: "80.00",
    discount: "0",
    totalSessions: 1,
    sessionsPerWeek: 1,
    tablePrice: "80.00",
  },
];

beforeEach(() => {
  repoMock.getTreatmentPlan.mockReset();
  repoMock.listTreatmentPlanProceduresWithCatalog.mockReset();
  repoMock.acceptTreatmentPlan.mockReset();
  repoMock.getPatientClinicId.mockReset();
  clausesMock.buildAcceptedClausesSnapshot.mockReset();
});

describe("acceptPatientTreatmentPlan + cláusulas (Sprint 11/P5)", () => {
  it("clínica sem cláusulas configuradas → aceita normalmente sem snapshot de cláusulas", async () => {
    repoMock.getTreatmentPlan.mockResolvedValue(planFixture());
    repoMock.listTreatmentPlanProceduresWithCatalog.mockResolvedValue(oneItem);
    repoMock.acceptTreatmentPlan.mockImplementation(
      async (...args: any[]) =>
        planFixture({ acceptedAt: new Date(), acceptedBy: 99, frozenPricesJson: args[3] }),
    );
    clausesMock.buildAcceptedClausesSnapshot.mockResolvedValue({
      snapshot: null,
      missingRequired: [],
    });

    const result = await acceptPatientTreatmentPlan(7, 10, ctx, {
      signature: "Paciente Teste",
      ip: "127.0.0.1",
      device: "ua",
      via: "presencial",
      acceptedClauseCodes: [],
    });

    expect(result.acceptedAt).toBeInstanceOf(Date);
    expect(repoMock.acceptTreatmentPlan).toHaveBeenCalledOnce();
    const call = repoMock.acceptTreatmentPlan.mock.calls[0];
    // 6º arg (índice 5) é acceptedClausesJson — null quando clínica sem cláusulas
    expect(call[5]).toBeNull();
  });

  it("cláusula obrigatória faltando → 400 com code=clause_required_missing e NÃO persiste", async () => {
    repoMock.getTreatmentPlan.mockResolvedValue(planFixture());
    repoMock.listTreatmentPlanProceduresWithCatalog.mockResolvedValue(oneItem);
    clausesMock.buildAcceptedClausesSnapshot.mockResolvedValue({
      snapshot: null,
      missingRequired: ["TITULO_EXECUTIVO"],
    });

    await expect(
      acceptPatientTreatmentPlan(7, 10, ctx, {
        signature: "Paciente Teste",
        ip: "127.0.0.1",
        device: "ua",
        via: "presencial",
        acceptedClauseCodes: ["REAGENDAMENTO_INTRAMENSAL"],
      }),
    ).rejects.toMatchObject({
      status: 400,
      issues: expect.objectContaining({
        code: "clause_required_missing",
        missing: ["TITULO_EXECUTIVO"],
      }),
    });

    expect(repoMock.acceptTreatmentPlan).not.toHaveBeenCalled();
  });

  it("cláusulas marcadas corretamente → snapshot serializado é passado ao repo", async () => {
    repoMock.getTreatmentPlan.mockResolvedValue(planFixture());
    repoMock.listTreatmentPlanProceduresWithCatalog.mockResolvedValue(oneItem);
    repoMock.acceptTreatmentPlan.mockImplementation(
      async (...args: any[]) =>
        planFixture({ acceptedAt: new Date(), acceptedBy: 99, frozenPricesJson: args[3] }),
    );
    const snapshot = {
      capturedAt: "2026-04-30T12:00:00.000Z",
      items: [
        { id: 1, code: "REAGENDAMENTO_INTRAMENSAL", version: 1, title: "T", body: "B", isRequired: true },
      ],
    };
    clausesMock.buildAcceptedClausesSnapshot.mockResolvedValue({
      snapshot,
      missingRequired: [],
    });

    await acceptPatientTreatmentPlan(7, 10, ctx, {
      signature: "Paciente Teste",
      ip: "127.0.0.1",
      device: "ua",
      via: "link",
      acceptedClauseCodes: ["REAGENDAMENTO_INTRAMENSAL"],
    });

    expect(repoMock.acceptTreatmentPlan).toHaveBeenCalledOnce();
    const call = repoMock.acceptTreatmentPlan.mock.calls[0];
    const persistedSnapshot = call[5];
    expect(typeof persistedSnapshot).toBe("string");
    expect(JSON.parse(persistedSnapshot)).toEqual(snapshot);
    // trail.via é repassado corretamente
    expect(call[4]).toMatchObject({ via: "link", signature: "Paciente Teste" });
  });

  it("usa repo.getPatientClinicId quando o plano não traz clinicId", async () => {
    repoMock.getTreatmentPlan.mockResolvedValue(planFixture({ clinicId: null }));
    repoMock.listTreatmentPlanProceduresWithCatalog.mockResolvedValue(oneItem);
    repoMock.getPatientClinicId.mockResolvedValue(42);
    repoMock.acceptTreatmentPlan.mockImplementation(
      async (...args: any[]) =>
        planFixture({ acceptedAt: new Date(), acceptedBy: 99, frozenPricesJson: args[3] }),
    );
    clausesMock.buildAcceptedClausesSnapshot.mockResolvedValue({
      snapshot: null,
      missingRequired: [],
    });

    await acceptPatientTreatmentPlan(7, 10, ctx, {
      signature: "Paciente Teste",
      via: "presencial",
      acceptedClauseCodes: [],
    });

    expect(repoMock.getPatientClinicId).toHaveBeenCalledWith(7);
    expect(clausesMock.buildAcceptedClausesSnapshot).toHaveBeenCalledWith(42, []);
  });
});
