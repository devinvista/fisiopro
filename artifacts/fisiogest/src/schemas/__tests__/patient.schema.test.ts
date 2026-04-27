import { describe, it, expect } from "vitest";
import {
  patientFormSchema,
  buildPatientPayload,
} from "../patient.schema";

const valid = {
  name: "João Silva",
  cpf: "123.456.789-00",
  phone: "(11) 91234-5678",
  email: undefined,
  birthDate: undefined,
  profession: undefined,
  address: undefined,
  emergencyContact: undefined,
  notes: undefined,
};

describe("patientFormSchema", () => {
  it("aceita paciente válido (com máscara em CPF/telefone)", () => {
    expect(patientFormSchema.safeParse(valid).success).toBe(true);
  });

  it("rejeita CPF com menos de 11 dígitos", () => {
    expect(patientFormSchema.safeParse({ ...valid, cpf: "123" }).success).toBe(false);
  });

  it("aceita telefone fixo (10 dígitos) e celular (11 dígitos)", () => {
    expect(
      patientFormSchema.safeParse({ ...valid, phone: "(11) 3333-4444" }).success,
    ).toBe(true);
    expect(
      patientFormSchema.safeParse({ ...valid, phone: "11999998888" }).success,
    ).toBe(true);
  });

  it("rejeita telefone com 9 dígitos", () => {
    expect(
      patientFormSchema.safeParse({ ...valid, phone: "123456789" }).success,
    ).toBe(false);
  });

  it("aceita e-mail vazio mas rejeita inválido", () => {
    expect(
      patientFormSchema.safeParse({ ...valid, email: "" }).success,
    ).toBe(true);
    expect(
      patientFormSchema.safeParse({ ...valid, email: "not-an-email" }).success,
    ).toBe(false);
    expect(
      patientFormSchema.safeParse({ ...valid, email: "a@b.co" }).success,
    ).toBe(true);
  });

  it("rejeita data de nascimento com formato inválido", () => {
    expect(
      patientFormSchema.safeParse({ ...valid, birthDate: "2020/01/01" }).success,
    ).toBe(false);
    expect(
      patientFormSchema.safeParse({ ...valid, birthDate: "2020-01-01" }).success,
    ).toBe(true);
  });
});

describe("buildPatientPayload", () => {
  it("retorna campos opcionais como undefined quando não informados", () => {
    const parsed = patientFormSchema.parse(valid);
    const payload = buildPatientPayload(parsed);
    expect(payload.name).toBe("João Silva");
    expect(payload.email).toBeUndefined();
    expect(payload.notes).toBeUndefined();
  });
});

describe("patientFormSchema — normalização de nome", () => {
  it("aplica Title Case no nome ao validar", () => {
    const parsed = patientFormSchema.parse({ ...valid, name: "joão silva" });
    expect(parsed.name).toBe("João Silva");
  });

  it("mantém partículas em minúsculas (de, da, dos, etc.)", () => {
    const parsed = patientFormSchema.parse({
      ...valid,
      name: "MARIA DOS SANTOS DA SILVA",
    });
    expect(parsed.name).toBe("Maria dos Santos da Silva");
  });

  it("preserva acentos ao normalizar", () => {
    const parsed = patientFormSchema.parse({
      ...valid,
      name: "ÂNGELA FAGUNDES",
    });
    expect(parsed.name).toBe("Ângela Fagundes");
  });

  it("trata nomes compostos por hífen", () => {
    const parsed = patientFormSchema.parse({
      ...valid,
      name: "ana-paula souza",
    });
    expect(parsed.name).toBe("Ana-Paula Souza");
  });

  it("rejeita nomes com dígitos ou caracteres inválidos", () => {
    expect(
      patientFormSchema.safeParse({ ...valid, name: "João 123" }).success,
    ).toBe(false);
    expect(
      patientFormSchema.safeParse({ ...valid, name: "Maria@Silva" }).success,
    ).toBe(false);
  });
});
