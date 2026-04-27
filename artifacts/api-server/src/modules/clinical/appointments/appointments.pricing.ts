import { db } from "@workspace/db";
import {
  proceduresTable,
  procedureCostsTable,
  treatmentPlansTable,
  treatmentPlanProceduresTable,
} from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";

export type PriceSource = "tabela" | "override_clinica" | "plano_tratamento";

export interface ResolvedPrice {
  /** Preço efetivo a ser cobrado (após descontos), em string com 2 casas. */
  effectivePrice: string;
  /** Origem do preço — usado para auditoria em `financial_records.price_source`. */
  priceSource: PriceSource;
  /** Preço base do procedimento (sem override nem desconto), em string. */
  originalUnitPrice: string;
  /** Id do plano de tratamento aplicado, quando houver. */
  treatmentPlanId: number | null;
  /** Desconto aplicado pelo plano (sempre ≥ 0), em string. */
  discountApplied: string;
}

function toMoney(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0.00";
  return value.toFixed(2);
}

/**
 * Resolve o preço efetivo de um procedimento para um paciente, aplicando a hierarquia:
 *
 *   1. **Plano de tratamento ativo** do paciente (`treatment_plan_procedures.unitPrice − discount`)
 *   2. **Override da clínica** (`procedure_costs.priceOverride`)
 *   3. **Preço de tabela** (`procedures.price`)
 *
 * Sempre devolve o preço base original (`originalUnitPrice`) para fins de auditoria.
 *
 * Convenções:
 * - `discount` no plano é tratado como **valor monetário absoluto** (R$). Não é percentual.
 * - Plano só conta se `status = 'ativo'`. Planos `concluido`, `inativo`, etc. são ignorados.
 * - Se houver mais de um plano ativo cobrindo o procedimento, o mais recente vence.
 * - Preço final é "clamped" a 0 — desconto maior que o preço resulta em 0.
 */
export async function resolveEffectivePrice(
  patientId: number | null | undefined,
  procedureId: number | null | undefined,
  clinicId: number | null | undefined,
): Promise<ResolvedPrice> {
  if (!procedureId) {
    return {
      effectivePrice: "0.00",
      priceSource: "tabela",
      originalUnitPrice: "0.00",
      treatmentPlanId: null,
      discountApplied: "0.00",
    };
  }

  // 1. Preço de tabela (base)
  const [procedure] = await db
    .select({ price: proceduresTable.price })
    .from(proceduresTable)
    .where(eq(proceduresTable.id, procedureId))
    .limit(1);

  const tablePrice = Number(procedure?.price ?? 0);
  const originalUnitPrice = toMoney(tablePrice);

  // 2. Plano de tratamento ativo (vence se existir)
  if (patientId) {
    const planConditions = [
      eq(treatmentPlansTable.patientId, patientId),
      eq(treatmentPlansTable.status, "ativo"),
      eq(treatmentPlanProceduresTable.procedureId, procedureId),
    ];
    if (clinicId) {
      planConditions.push(eq(treatmentPlansTable.clinicId, clinicId));
    }

    const [planRow] = await db
      .select({
        treatmentPlanId: treatmentPlansTable.id,
        unitPrice: treatmentPlanProceduresTable.unitPrice,
        discount: treatmentPlanProceduresTable.discount,
      })
      .from(treatmentPlanProceduresTable)
      .innerJoin(
        treatmentPlansTable,
        eq(treatmentPlanProceduresTable.treatmentPlanId, treatmentPlansTable.id),
      )
      .where(and(...planConditions))
      .orderBy(desc(treatmentPlansTable.createdAt))
      .limit(1);

    if (planRow && planRow.unitPrice != null) {
      const unit = Number(planRow.unitPrice);
      const discount = Math.max(0, Number(planRow.discount ?? 0));
      const effective = Math.max(0, unit - discount);
      return {
        effectivePrice: toMoney(effective),
        priceSource: "plano_tratamento",
        originalUnitPrice,
        treatmentPlanId: planRow.treatmentPlanId,
        discountApplied: toMoney(discount),
      };
    }
  }

  // 3. Override da clínica (procedure_costs)
  if (clinicId) {
    const [overrideRow] = await db
      .select({ priceOverride: procedureCostsTable.priceOverride })
      .from(procedureCostsTable)
      .where(
        and(
          eq(procedureCostsTable.procedureId, procedureId),
          eq(procedureCostsTable.clinicId, clinicId),
        ),
      )
      .limit(1);

    if (overrideRow?.priceOverride != null) {
      return {
        effectivePrice: toMoney(Number(overrideRow.priceOverride)),
        priceSource: "override_clinica",
        originalUnitPrice,
        treatmentPlanId: null,
        discountApplied: "0.00",
      };
    }
  }

  // 4. Fallback — tabela
  return {
    effectivePrice: originalUnitPrice,
    priceSource: "tabela",
    originalUnitPrice,
    treatmentPlanId: null,
    discountApplied: "0.00",
  };
}
