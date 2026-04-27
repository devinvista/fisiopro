import { describe, it, expect } from "vitest";
import {
  maskCpf,
  maskPhone,
  maskCnpj,
  toTitleCaseName,
  maskName,
} from "../masks";

describe("maskCpf", () => {
  it("formata 11 dígitos como CPF", () => {
    expect(maskCpf("12345678900")).toBe("123.456.789-00");
  });
  it("ignora caracteres não numéricos", () => {
    expect(maskCpf("abc123def456ghi789jkl00")).toBe("123.456.789-00");
  });
});

describe("maskPhone", () => {
  it("formata celular (11 dígitos)", () => {
    expect(maskPhone("11999998888")).toBe("(11) 99999-8888");
  });
  it("formata telefone fixo (10 dígitos)", () => {
    expect(maskPhone("1133334444")).toBe("(11) 3333-4444");
  });
});

describe("maskCnpj", () => {
  it("formata 14 dígitos como CNPJ", () => {
    expect(maskCnpj("12345678000199")).toBe("12.345.678/0001-99");
  });
});

describe("toTitleCaseName", () => {
  it("aplica Title Case em nome simples", () => {
    expect(toTitleCaseName("joão silva")).toBe("João Silva");
  });
  it("normaliza nome em CAIXA ALTA", () => {
    expect(toTitleCaseName("FABIANE SANTINON")).toBe("Fabiane Santinon");
  });
  it("mantém partículas em minúsculas no meio", () => {
    expect(toTitleCaseName("MARIA DOS SANTOS DA SILVA")).toBe(
      "Maria dos Santos da Silva",
    );
    expect(toTitleCaseName("jonas da silva mello")).toBe("Jonas da Silva Mello");
  });
  it("capitaliza partícula quando é a primeira palavra", () => {
    expect(toTitleCaseName("DA silva")).toBe("Da Silva");
  });
  it("preserva acentos", () => {
    expect(toTitleCaseName("ÂNGELA FAGUNDES")).toBe("Ângela Fagundes");
    expect(toTitleCaseName("MARIA APARECIDA DUARTE DE FREITAS")).toBe(
      "Maria Aparecida Duarte de Freitas",
    );
  });
  it("trata nomes com hífen", () => {
    expect(toTitleCaseName("ana-paula souza")).toBe("Ana-Paula Souza");
  });
  it("trata apóstrofo", () => {
    expect(toTitleCaseName("d'angelo")).toBe("D'Angelo");
  });
  it("colapsa múltiplos espaços", () => {
    expect(toTitleCaseName("maria   da    silva")).toBe("Maria da Silva");
  });
  it("retorna string vazia para entrada vazia", () => {
    expect(toTitleCaseName("")).toBe("");
    expect(toTitleCaseName("   ")).toBe("");
  });
});

describe("maskName", () => {
  it("remove dígitos e caracteres inválidos", () => {
    expect(maskName("Maria 123 @Silva")).toBe("Maria Silva");
  });
  it("mantém letras com acento, espaço, hífen e apóstrofo", () => {
    expect(maskName("ana-paula d'avila")).toBe("Ana-Paula D'Avila");
  });
  it("aplica Title Case em tempo real", () => {
    expect(maskName("MARIA DA SILVA")).toBe("Maria da Silva");
  });
  it("preserva espaço final durante a digitação", () => {
    expect(maskName("Maria ")).toBe("Maria ");
  });
  it("remove espaços iniciais", () => {
    expect(maskName("   Maria")).toBe("Maria");
  });
  it("colapsa espaços duplos", () => {
    expect(maskName("Maria  da  Silva")).toBe("Maria da Silva");
  });
});
