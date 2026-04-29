import { db } from "@workspace/db";
import {
  proceduresTable,
  procedureCostsTable,
  treatmentPlansTable,
  treatmentPlanProceduresTable,
  packagesTable,
  appointmentsTable,
} from "@workspace/db";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { monthRangeFromDate } from "./appointments.helpers.js";

export type PriceSource =
  | "tabela"
  | "override_clinica"
  | "plano_tratamento"
  | "plano_mensal_proporcional";

/**
 * Quando a origem do preço é `plano_mensal_proporcional`, este bloco descreve
 * o contrato mensal que rege o billing consolidado.
 */
export interface MonthlyPlanInfo {
  /** Valor mensal contratual (`unit_monthly_price - discount`), em string com 2 casas. */
  monthlyAmount: string;
  /** Pacote vinculado ao item do plano (sempre presente neste modo). */
  packageId: number;
  /** Procedimento associado ao pacote. */
  procedureId: number;
  /** Dia de faturamento configurado no pacote. */
  billingDay: number;
  /**
   * Quantidade de sessões agendadas (qualquer status ≠ cancelado) no mês
   * da consulta — base do rateio proporcional.
   */
  plannedSessionsInMonth: number;
  /** Mês contábil da apuração (`YYYY-MM-01`). */
  monthStartDate: string;
  /** Último dia do mês contábil. */
  monthEndDate: string;
}

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
  /** Metadados do contrato mensal (apenas para `plano_mensal_proporcional`). */
  monthlyPlan?: MonthlyPlanInfo;
}

function toMoney(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0.00";
  return value.toFixed(2);
}

/**
 * Conta sessões agendadas no mês para o paciente/procedimento.
 * Considera todos os status exceto `cancelado` (faltas/no-shows também
 * "consomem" parcela mensal, pois o contrato é fixo).
 */
async function countPlannedSessionsInMonth(
  patientId: number,
  procedureId: number,
  startDate: string,
  endDate: string,
  clinicId: number | null | undefined,
): Promise<number> {
  const conditions: any[] = [
    eq(appointmentsTable.patientId, patientId),
    eq(appointmentsTable.procedureId, procedureId),
    sql`${appointmentsTable.date} >= ${startDate}::date`,
    sql`${appointmentsTable.date} <= ${endDate}::date`,
    ne(appointmentsTable.status, "cancelado"),
  ];
  if (clinicId) {
    conditions.push(eq(appointmentsTable.clinicId, clinicId));
  }
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(appointmentsTable)
    .where(and(...conditions));
  return Number(count ?? 0);
}

/**
 * Resolve o preço efetivo de um procedimento para um paciente, aplicando a hierarquia:
 *
 *   1. **Plano de tratamento ativo** (match por `procedure_id` direto OU
 *      via `package_id` cujo `packages.procedure_id` é o do agendamento):
 *      a. Se o item é pacote `mensal` com `unit_monthly_price > 0` →
 *         **rateio proporcional**: `(unit_monthly_price - discount) / N`,
 *         onde N = sessões planejadas no mês corrente.
 *         Origem: `plano_mensal_proporcional`.
 *      b. Caso contrário → `unit_price - discount` por sessão.
 *         Origem: `plano_tratamento`.
 *   2. **Override da clínica** (`procedure_costs.priceOverride`).
 *   3. **Preço de tabela** (`procedures.price`).
 *
 * Sempre devolve o preço base original (`originalUnitPrice`) para fins de auditoria.
 *
 * Convenções:
 * - `discount` no plano é tratado como **valor monetário absoluto** (R$).
 * - Plano só conta se `status = 'ativo'`. Planos `concluido`, `inativo`, etc. são ignorados.
 * - Se houver mais de um plano ativo cobrindo o procedimento, o mais recente vence.
 * - Preço final é "clamped" a 0 — desconto maior que o preço resulta em 0.
 *
 * @param appointmentDate Data da consulta (necessária para apurar o mês contábil
 *   no rateio proporcional). Default = hoje (BRT) se omitido.
 */
export async function resolveEffectivePrice(
  patientId: number | null | undefined,
  procedureId: number | null | undefined,
  clinicId: number | null | undefined,
  appointmentDate?: string,
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

  // 2. Plano de tratamento ativo — busca itens que casem por
  //    procedure_id direto OU por package_id cujo procedimento alvo é o mesmo.
  if (patientId) {
    const planConditions = [
      eq(treatmentPlansTable.patientId, patientId),
      eq(treatmentPlansTable.status, "ativo"),
      sql`(
        ${treatmentPlanProceduresTable.procedureId} = ${procedureId}
        OR ${packagesTable.procedureId} = ${procedureId}
      )`,
    ];
    if (clinicId) {
      planConditions.push(eq(treatmentPlansTable.clinicId, clinicId));
    }

    const [planRow] = await db
      .select({
        treatmentPlanId: treatmentPlansTable.id,
        unitPrice: treatmentPlanProceduresTable.unitPrice,
        unitMonthlyPrice: treatmentPlanProceduresTable.unitMonthlyPrice,
        discount: treatmentPlanProceduresTable.discount,
        packageId: treatmentPlanProceduresTable.packageId,
        packageType: packagesTable.packageType,
        packageBillingDay: packagesTable.billingDay,
        packageProcedureId: packagesTable.procedureId,
        // Pacote mensalidade: valor mensal vive no pacote.
        packageMonthlyPrice: packagesTable.monthlyPrice,
      })
      .from(treatmentPlanProceduresTable)
      .innerJoin(
        treatmentPlansTable,
        eq(treatmentPlanProceduresTable.treatmentPlanId, treatmentPlansTable.id),
      )
      .leftJoin(
        packagesTable,
        eq(treatmentPlanProceduresTable.packageId, packagesTable.id),
      )
      .where(and(...planConditions))
      .orderBy(desc(treatmentPlansTable.createdAt))
      .limit(1);

    if (planRow) {
      const discount = Math.max(0, Number(planRow.discount ?? 0));

      // 1a. Plano mensal fixo com rateio proporcional.
      // Pacote mensalidade: o valor mensal pode estar somente no pacote
      // (`packages.monthly_price`) — o item do plano herda esse valor.
      const monthlyUnit = Number(
        planRow.unitMonthlyPrice ?? planRow.packageMonthlyPrice ?? 0,
      );
      const isMonthlyPackage =
        planRow.packageId != null &&
        planRow.packageType === "mensal" &&
        monthlyUnit > 0;

      if (isMonthlyPackage) {
        const monthlyAmount = Math.max(0, monthlyUnit - discount);
        const refDate = appointmentDate ?? new Date().toISOString().slice(0, 10);
        const { startDate, endDate } = monthRangeFromDate(refDate);
        const planned = await countPlannedSessionsInMonth(
          patientId,
          procedureId,
          startDate,
          endDate,
          clinicId,
        );
        const safePlanned = Math.max(1, planned);
        const perSession = monthlyAmount / safePlanned;
        return {
          effectivePrice: toMoney(perSession),
          priceSource: "plano_mensal_proporcional",
          originalUnitPrice,
          treatmentPlanId: planRow.treatmentPlanId,
          discountApplied: toMoney(discount),
          monthlyPlan: {
            monthlyAmount: toMoney(monthlyAmount),
            packageId: planRow.packageId!,
            procedureId: planRow.packageProcedureId ?? procedureId,
            billingDay: Number(planRow.packageBillingDay ?? 10),
            plannedSessionsInMonth: safePlanned,
            monthStartDate: startDate,
            monthEndDate: endDate,
          },
        };
      }

      // 1b. Plano por sessão tradicional
      if (planRow.unitPrice != null) {
        const unit = Number(planRow.unitPrice);
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
