/**
 * Sprint Financeiro 11 (P5) — testes do service de cláusulas contratuais.
 * Foco: regras de validação puras (códigos, snapshot, obrigatórias).
 * O CRUD que envolve transações Drizzle (versionamento, seed) é coberto por
 * testes de integração — aqui validamos os invariantes que o aceite depende.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDbMock } from "../../shared/test-utils/db-mock.js";

const dbMock = createDbMock();

vi.mock("@workspace/db", async () => {
  const actual = await vi.importActual<any>("@workspace/db");
  return { ...actual, db: dbMock.db };
});

const { listClauses, createClause, buildAcceptedClausesSnapshot, seedDefaultClauses, DEFAULT_CLAUSES } =
  await import("./contract-clauses.service.js");

beforeEach(() => dbMock.reset());

function activeClause(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    clinicId: 1,
    code: "REAGENDAMENTO_INTRAMENSAL",
    title: "Reagendamento dentro do mês",
    body: "corpo",
    version: 1,
    isRequired: true,
    isActive: true,
    sortOrder: 10,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("contract-clauses.service — buildAcceptedClausesSnapshot", () => {
  it("clínica sem cláusulas configuradas → snapshot=null e nenhuma obrigatória pendente", async () => {
    dbMock.enqueue([]); // listClauses
    const result = await buildAcceptedClausesSnapshot(1, []);
    expect(result.snapshot).toBeNull();
    expect(result.missingRequired).toEqual([]);
  });

  it("obrigatória ausente → devolve missingRequired e snapshot=null", async () => {
    dbMock.enqueue([
      activeClause({ id: 1, code: "REAGENDAMENTO_INTRAMENSAL", isRequired: true }),
      activeClause({ id: 2, code: "TITULO_EXECUTIVO", isRequired: true, sortOrder: 30 }),
    ]);
    const result = await buildAcceptedClausesSnapshot(1, ["REAGENDAMENTO_INTRAMENSAL"]);
    expect(result.snapshot).toBeNull();
    expect(result.missingRequired).toEqual(["TITULO_EXECUTIVO"]);
  });

  it("código desconhecido lança 400", async () => {
    dbMock.enqueue([activeClause({ code: "REAGENDAMENTO_INTRAMENSAL" })]);
    await expect(buildAcceptedClausesSnapshot(1, ["NAO_EXISTE"])).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("desconhecida"),
    });
  });

  it("todas obrigatórias marcadas → snapshot com versão e título congelados", async () => {
    dbMock.enqueue([
      activeClause({ id: 1, code: "REAGENDAMENTO_INTRAMENSAL", version: 2, title: "Reag v2" }),
      activeClause({ id: 2, code: "TITULO_EXECUTIVO", version: 1, title: "Título Executivo" }),
    ]);
    const result = await buildAcceptedClausesSnapshot(1, [
      "REAGENDAMENTO_INTRAMENSAL",
      "TITULO_EXECUTIVO",
    ]);
    expect(result.missingRequired).toEqual([]);
    expect(result.snapshot).not.toBeNull();
    expect(result.snapshot!.items).toHaveLength(2);
    expect(result.snapshot!.items[0]).toMatchObject({
      code: "REAGENDAMENTO_INTRAMENSAL",
      version: 2,
      title: "Reag v2",
      isRequired: true,
    });
    expect(typeof result.snapshot!.capturedAt).toBe("string");
  });

  it("normaliza código (case-insensitive) e deduplica", async () => {
    dbMock.enqueue([
      activeClause({ code: "REAGENDAMENTO_INTRAMENSAL", isRequired: false }),
      activeClause({ id: 2, code: "PRECO_DIFERENCIADO", isRequired: false }),
    ]);
    const result = await buildAcceptedClausesSnapshot(1, [
      "reagendamento_intramensal",
      "REAGENDAMENTO_INTRAMENSAL",
      "preco_diferenciado",
    ]);
    expect(result.snapshot!.items.map((i) => i.code).sort()).toEqual([
      "PRECO_DIFERENCIADO",
      "REAGENDAMENTO_INTRAMENSAL",
    ]);
  });
});

describe("contract-clauses.service — createClause (validação)", () => {
  it("rejeita código fora do padrão A-Z/0-9/_", async () => {
    await expect(
      createClause(1, { code: "abc-123", title: "x", body: "y" }),
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining("Código inválido") });
  });

  it("rejeita título/corpo vazios", async () => {
    await expect(
      createClause(1, { code: "REAGENDAMENTO_INTRAMENSAL", title: "   ", body: "y" }),
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining("Título") });
    await expect(
      createClause(1, { code: "REAGENDAMENTO_INTRAMENSAL", title: "x", body: "   " }),
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining("Corpo") });
  });
});

describe("contract-clauses.service — seedDefaultClauses idempotente", () => {
  it("não recria quando a clínica já tem cláusulas", async () => {
    dbMock.enqueue([{ id: 99 }]); // select existing → algo presente
    const result = await seedDefaultClauses(1);
    expect(result).toEqual({ created: 0 });
  });

  it("DEFAULT_CLAUSES contém os 3 códigos canônicos", () => {
    expect(DEFAULT_CLAUSES.map((c) => c.code).sort()).toEqual([
      "PRECO_DIFERENCIADO",
      "REAGENDAMENTO_INTRAMENSAL",
      "TITULO_EXECUTIVO",
    ]);
    for (const c of DEFAULT_CLAUSES) {
      expect(c.isRequired).toBe(true);
      expect(c.body.length).toBeGreaterThan(50);
    }
  });
});

describe("contract-clauses.service — listClauses", () => {
  it("filtra por clinic e activeOnly por padrão", async () => {
    dbMock.enqueue([activeClause()]);
    const rows = await listClauses(1);
    expect(rows).toHaveLength(1);
    expect(dbMock.calls()).toEqual(["select"]);
  });

  it("includeInactive=true não filtra por isActive", async () => {
    dbMock.enqueue([activeClause(), activeClause({ id: 2, isActive: false })]);
    const rows = await listClauses(1, { activeOnly: false });
    expect(rows).toHaveLength(2);
  });
});
