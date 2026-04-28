import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks da camada de banco ─────────────────────────────────────────────────
// Cada chamada a `db.select()` é representada por uma resposta enfileirada em `selectQueue`.
// A ordem precisa bater com a ordem do helper:
//   1ª: SELECT em proceduresTable          (preço de tabela)
//   2ª: SELECT em treatmentPlanProceduresTable  (plano)
//   3ª: SELECT em procedureCostsTable      (override)

const dbMock = vi.hoisted(() => {
  const selectQueue: any[][] = [];
  const makeChain = (rows: any[]) => {
    const chain: any = {
      from: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
      leftJoin: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn(() => Promise.resolve(rows)),
    };
    return chain;
  };
  return {
    selectQueue,
    select: vi.fn(() => {
      const next = selectQueue.shift() ?? [];
      return makeChain(next);
    }),
    enqueueSelect: (rows: any[]) => selectQueue.push(rows),
    reset: () => {
      selectQueue.length = 0;
    },
  };
});

vi.mock("@workspace/db", () => ({
  db: { select: dbMock.select },
  proceduresTable: { id: "id", price: "price" },
  procedureCostsTable: { procedureId: "procedureId", clinicId: "clinicId", priceOverride: "priceOverride" },
  treatmentPlansTable: {
    id: "id",
    patientId: "patientId",
    clinicId: "clinicId",
    status: "status",
    createdAt: "createdAt",
  },
  treatmentPlanProceduresTable: {
    treatmentPlanId: "treatmentPlanId",
    procedureId: "procedureId",
    unitPrice: "unitPrice",
    unitMonthlyPrice: "unitMonthlyPrice",
    discount: "discount",
    packageId: "packageId",
  },
  // `packagesTable` é referenciada no JOIN do plano (procedure direto OU
  // procedure herdado do package). Mock só precisa expor as colunas usadas.
  packagesTable: {
    id: "id",
    procedureId: "procedureId",
    packageType: "packageType",
    billingDay: "billingDay",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: any[]) => args),
  eq: vi.fn((a: any, b: any) => ["eq", a, b]),
  desc: vi.fn((x: any) => ["desc", x]),
  // `sql` é usado pelo helper para escrever um OR no WHERE do plano
  // (treatment_plan_procedures.procedureId OU patient_packages.procedureId).
  // Para o teste basta retornar um marker — o select é mockado de qualquer jeito.
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: any[]) => ({ __sql: true, strings, values }),
    {
      raw: (s: string) => ({ __sql: true, raw: s }),
    },
  ),
}));

const { resolveEffectivePrice } = await import("./appointments.pricing.js");

// Helper para preparar respostas na ordem em que o helper consome a fila.
//
// O helper consulta condicionalmente:
//   - procedure (sempre, quando procedureId existe)
//   - plano (somente se patientId)
//   - override (somente se clinicId E plano não venceu)
//
// `withPatient`/`withClinic` ditam quais slots são realmente enfileirados,
// porque slots não consumidos quebram a ordem da fila.
function prime(opts: {
  procedure?: any;
  plan?: any;
  override?: any;
  withPatient?: boolean;
  withClinic?: boolean;
}) {
  const { procedure, plan, override, withPatient = true, withClinic = true } = opts;
  dbMock.enqueueSelect(procedure ? [procedure] : []);
  if (withPatient) {
    dbMock.enqueueSelect(plan ? [plan] : []);
  }
  // Override só é consultado se não houve plano vencedor.
  if (withClinic && !plan) {
    dbMock.enqueueSelect(override ? [override] : []);
  }
}

describe("resolveEffectivePrice", () => {
  beforeEach(() => {
    dbMock.reset();
    vi.clearAllMocks();
  });

  it("retorna 0 quando procedureId não é informado", async () => {
    const r = await resolveEffectivePrice(1, null, 10);
    expect(r.effectivePrice).toBe("0.00");
    expect(r.priceSource).toBe("tabela");
    expect(r.treatmentPlanId).toBeNull();
  });

  it("usa preço de tabela quando não há plano nem override", async () => {
    prime({ procedure: { price: "80.00" } });
    const r = await resolveEffectivePrice(7, 100, 10);
    expect(r.effectivePrice).toBe("80.00");
    expect(r.priceSource).toBe("tabela");
    expect(r.originalUnitPrice).toBe("80.00");
    expect(r.treatmentPlanId).toBeNull();
    expect(r.discountApplied).toBe("0.00");
  });

  it("usa override da clínica quando há override e não há plano", async () => {
    prime({
      procedure: { price: "80.00" },
      override: { priceOverride: "75.00" },
    });
    const r = await resolveEffectivePrice(7, 100, 10);
    expect(r.effectivePrice).toBe("75.00");
    expect(r.priceSource).toBe("override_clinica");
    expect(r.originalUnitPrice).toBe("80.00");
    expect(r.treatmentPlanId).toBeNull();
  });

  it("usa unitPrice do plano de tratamento sem desconto", async () => {
    prime({
      procedure: { price: "80.00" },
      plan: { treatmentPlanId: 42, unitPrice: "70.00", discount: "0" },
      override: { priceOverride: "75.00" },
    });
    const r = await resolveEffectivePrice(7, 100, 10);
    expect(r.effectivePrice).toBe("70.00");
    expect(r.priceSource).toBe("plano_tratamento");
    expect(r.originalUnitPrice).toBe("80.00");
    expect(r.treatmentPlanId).toBe(42);
    expect(r.discountApplied).toBe("0.00");
  });

  it("aplica desconto do plano (BUG ORIGINAL: 80 − 10 = 70)", async () => {
    prime({
      procedure: { price: "80.00" },
      plan: { treatmentPlanId: 42, unitPrice: "80.00", discount: "10" },
    });
    const r = await resolveEffectivePrice(7, 100, 10);
    expect(r.effectivePrice).toBe("70.00");
    expect(r.priceSource).toBe("plano_tratamento");
    expect(r.discountApplied).toBe("10.00");
  });

  it("preço negociado ACIMA da tabela é respeitado (sem desconto)", async () => {
    // Cenário: tabela R$80, mas plano vendeu por R$100 (premium / particular).
    // Plano deve cobrar R$100 e originalUnitPrice mostra R$80 para auditoria.
    prime({
      procedure: { price: "80.00" },
      plan: { treatmentPlanId: 7, unitPrice: "100.00", discount: "0" },
    });
    const r = await resolveEffectivePrice(7, 100, 10);
    expect(r.effectivePrice).toBe("100.00");
    expect(r.priceSource).toBe("plano_tratamento");
    expect(r.originalUnitPrice).toBe("80.00");
    expect(r.treatmentPlanId).toBe(7);
    expect(r.discountApplied).toBe("0.00");
  });

  it("preço negociado acima da tabela com desconto, mas ainda > tabela", async () => {
    // Tabela R$80, preço negociado R$120, desconto R$10 → cobra R$110 (acima da tabela).
    prime({
      procedure: { price: "80.00" },
      plan: { treatmentPlanId: 8, unitPrice: "120.00", discount: "10" },
    });
    const r = await resolveEffectivePrice(7, 100, 10);
    expect(r.effectivePrice).toBe("110.00");
    expect(r.priceSource).toBe("plano_tratamento");
    expect(r.originalUnitPrice).toBe("80.00");
    expect(r.discountApplied).toBe("10.00");
  });

  it("plano vence sobre override da clínica", async () => {
    prime({
      procedure: { price: "80.00" },
      plan: { treatmentPlanId: 1, unitPrice: "60.00", discount: "0" },
      override: { priceOverride: "50.00" }, // este NÃO deve ser usado
    });
    const r = await resolveEffectivePrice(7, 100, 10);
    expect(r.effectivePrice).toBe("60.00");
    expect(r.priceSource).toBe("plano_tratamento");
  });

  it("clamp em 0 quando desconto > preço (não permite negativo)", async () => {
    prime({
      procedure: { price: "80.00" },
      plan: { treatmentPlanId: 42, unitPrice: "20.00", discount: "50" },
    });
    const r = await resolveEffectivePrice(7, 100, 10);
    expect(r.effectivePrice).toBe("0.00");
  });

  it("ignora desconto negativo (defesa contra dado corrompido)", async () => {
    prime({
      procedure: { price: "80.00" },
      plan: { treatmentPlanId: 42, unitPrice: "70.00", discount: "-5" },
    });
    const r = await resolveEffectivePrice(7, 100, 10);
    expect(r.effectivePrice).toBe("70.00");
    expect(r.discountApplied).toBe("0.00");
  });

  it("sem patientId, plano é ignorado mesmo se existir override", async () => {
    prime({
      procedure: { price: "80.00" },
      override: { priceOverride: "75.00" },
      withPatient: false,
    });
    const r = await resolveEffectivePrice(null, 100, 10);
    expect(r.effectivePrice).toBe("75.00");
    expect(r.priceSource).toBe("override_clinica");
  });

  it("sem clinicId, ignora override (usa só tabela)", async () => {
    prime({ procedure: { price: "80.00" }, withClinic: false });
    const r = await resolveEffectivePrice(7, 100, null);
    expect(r.effectivePrice).toBe("80.00");
    expect(r.priceSource).toBe("tabela");
  });
});
