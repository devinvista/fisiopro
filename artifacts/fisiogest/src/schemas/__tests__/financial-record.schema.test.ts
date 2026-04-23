import { describe, it, expect } from "vitest";
import {
  newFinancialRecordSchema,
  newFinancialRecordDefaults,
  buildNewFinancialRecordPayload,
  editFinancialRecordSchema,
  buildEditFinancialRecordPayload,
} from "../financial-record.schema";

const today = "2026-04-23";
const baseNew = {
  ...newFinancialRecordDefaults(today),
  description: "Aluguel da sala",
  amount: "1500",
};

describe("newFinancialRecordSchema", () => {
  it("aceita despesa geral válida", () => {
    expect(newFinancialRecordSchema.safeParse(baseNew).success).toBe(true);
  });

  it("rejeita amount zero ou negativo", () => {
    expect(
      newFinancialRecordSchema.safeParse({ ...baseNew, amount: "0" }).success,
    ).toBe(false);
    expect(
      newFinancialRecordSchema.safeParse({ ...baseNew, amount: "-1" }).success,
    ).toBe(false);
  });

  it("exige procedureId em despesa de procedimento", () => {
    const r = newFinancialRecordSchema.safeParse({
      ...baseNew,
      type: "despesa",
      expenseSubtype: "procedimento",
      procedureId: "",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].path).toEqual(["procedureId"]);
    }
  });

  it("aceita despesa de procedimento com procedureId", () => {
    expect(
      newFinancialRecordSchema.safeParse({
        ...baseNew,
        type: "despesa",
        expenseSubtype: "procedimento",
        procedureId: "12",
      }).success,
    ).toBe(true);
  });
});

describe("buildNewFinancialRecordPayload", () => {
  it("zera paymentDate quando status é pendente", () => {
    const parsed = newFinancialRecordSchema.parse({ ...baseNew, status: "pendente" });
    const payload = buildNewFinancialRecordPayload(parsed, today);
    expect(payload.paymentDate).toBeNull();
  });

  it("converte amount para number e procedureId quando informado", () => {
    const parsed = newFinancialRecordSchema.parse({
      ...baseNew,
      type: "despesa",
      expenseSubtype: "procedimento",
      procedureId: "7",
      amount: "250.50",
    });
    const payload = buildNewFinancialRecordPayload(parsed, today);
    expect(payload.amount).toBe(250.5);
    expect(payload.procedureId).toBe(7);
  });
});

describe("editFinancialRecordSchema + payload", () => {
  const editValid = {
    type: "receita" as const,
    description: "Sessão particular",
    amount: "180",
    category: "",
    status: "pago" as const,
    paymentDate: today,
    dueDate: today,
    paymentMethod: "",
  };

  it("aceita edição válida", () => {
    expect(editFinancialRecordSchema.safeParse(editValid).success).toBe(true);
  });

  it("zera paymentDate quando status pendente no edit", () => {
    const parsed = editFinancialRecordSchema.parse({ ...editValid, status: "pendente" });
    const payload = buildEditFinancialRecordPayload(parsed);
    expect(payload.paymentDate).toBeNull();
  });
});
