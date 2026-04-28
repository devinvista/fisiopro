/**
 * Sprint 2 — testes unitários do classificador `resolveItemKind`.
 *
 * O efeito financeiro completo (`acceptPlanFinancials`) toca várias tabelas
 * via Drizzle e é validado por integração no smoke da workflow. Aqui cobrimos
 * o branch de classificação que decide se um item gera fatura à vista
 * (pacoteSessoes), fatura mensal (recorrenteMensal) ou nada (avulso).
 */
import { describe, it, expect } from "vitest";
import { resolveItemKind } from "./treatment-plans.acceptance.js";

describe("resolveItemKind", () => {
  it("respeita o `kind` explícito quando preenchido", () => {
    expect(resolveItemKind({ kind: "pacoteSessoes", packageId: null, packageType: null }))
      .toBe("pacoteSessoes");
    expect(resolveItemKind({ kind: "recorrenteMensal", packageId: null, packageType: null }))
      .toBe("recorrenteMensal");
    expect(resolveItemKind({ kind: "avulso", packageId: 99, packageType: "mensal" }))
      .toBe("avulso");
  });

  it("deriva `recorrenteMensal` quando packageType=mensal e kind=null (legado)", () => {
    expect(resolveItemKind({ kind: null, packageId: 12, packageType: "mensal" }))
      .toBe("recorrenteMensal");
  });

  it("deriva `recorrenteMensal` quando packageType=faturaConsolidada (legado)", () => {
    expect(resolveItemKind({ kind: null, packageId: 12, packageType: "faturaConsolidada" }))
      .toBe("recorrenteMensal");
  });

  it("deriva `pacoteSessoes` quando packageType=sessoes e kind=null (legado)", () => {
    expect(resolveItemKind({ kind: null, packageId: 5, packageType: "sessoes" }))
      .toBe("pacoteSessoes");
  });

  it("deriva `avulso` quando não há packageId (item solto no plano)", () => {
    expect(resolveItemKind({ kind: null, packageId: null, packageType: null }))
      .toBe("avulso");
  });

  it("ignora `kind` desconhecido e cai no derivado", () => {
    expect(resolveItemKind({ kind: "lixo", packageId: 5, packageType: "mensal" }))
      .toBe("recorrenteMensal");
    expect(resolveItemKind({ kind: "outro", packageId: null, packageType: null }))
      .toBe("avulso");
  });
});
