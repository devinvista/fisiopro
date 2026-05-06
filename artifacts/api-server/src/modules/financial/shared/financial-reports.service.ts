import { and, eq, gte, lte, isNull, isNotNull, or, sql } from "drizzle-orm";
import { financialRecordsTable } from "@workspace/db";
import { monthDateRangeBRT } from "../../../utils/dateUtils.js";

export const RECEIVABLE_TYPES = [
  "creditoAReceber",
  "cobrancaSessao",
  "cobrancaMensal",
  "faturaConsolidada",
  "faturaPlano",
  "faturaMensalAvulso",
  // debitoServico: dívida gerada quando sessão avulsa porSessao consome a carteira
  // (saldo negativo). Precisa estar aqui para que o fluxo de pagamento possa quitá-la.
  "debitoServico",
  // faturaPlanoAvulsoMensal: fatura mensal on-demand criada pelo modo mensalConsolidado.
  "faturaPlanoAvulsoMensal",
];

// Tipos que NÃO entram no sumário de receita por competência:
//  - depositoCarteira / pagamento: caixa, não receita
//  - vendaPacote: passivo (Adiantamentos), receita só na execução
//  - faturaConsolidada (descontinuado) e faturaMensalAvulso: são
//    "agrupadores"; a receita já foi reconhecida nos filhos individuais
//    e contar o parent provocaria dupla contagem.
const NON_COMPETENCY_REVENUE_TYPES = [
  "depositoCarteira",
  "vendaPacote",
  "pagamento",
  "faturaConsolidada",
  "faturaMensalAvulso",
];

export function isActiveFinancialRecord(status: string): boolean {
  return status !== "estornado" && status !== "cancelado";
}

export function isRevenueSummaryRecord(
  record: typeof financialRecordsTable.$inferSelect,
): boolean {
  return (
    record.type === "receita" &&
    isActiveFinancialRecord(record.status) &&
    !NON_COMPETENCY_REVENUE_TYPES.includes(record.transactionType ?? "")
  );
}

export function revenueSummarySql() {
  return and(
    eq(financialRecordsTable.type, "receita"),
    sql`${financialRecordsTable.status} NOT IN ('estornado', 'cancelado')`,
    sql`(${financialRecordsTable.transactionType} IS NULL OR ${financialRecordsTable.transactionType} NOT IN ('depositoCarteira', 'vendaPacote', 'pagamento', 'faturaConsolidada', 'faturaMensalAvulso'))`,
  )!;
}

export function monthDateRange(
  year: number,
  month: number,
): { startDate: string; endDate: string } {
  return monthDateRangeBRT(year, month);
}

/**
 * Filtra registros financeiros pela data de **competência** (princípio da
 * competência / régua contábil brasileira):
 *
 * — `faturaPlano` com `planMonthRef` preenchido → usa `planMonthRef` como
 *   competência (independente de `paymentDate`). Pagar em maio uma parcela
 *   de julho deve aparecer em julho, não em maio.
 * — Demais registros: paymentDate se pago, dueDate se pendente,
 *   DATE(createdAt) como fallback.
 */
export function recordDateFilter(startDate: string, endDate: string) {
  return sql`(CASE
    WHEN ${financialRecordsTable.transactionType} = 'faturaPlano'
      AND ${financialRecordsTable.planMonthRef} IS NOT NULL
    THEN ${financialRecordsTable.planMonthRef}::date
    ELSE COALESCE(
      ${financialRecordsTable.paymentDate}::date,
      ${financialRecordsTable.dueDate}::date,
      DATE(${financialRecordsTable.createdAt})
    )
  END) BETWEEN ${startDate}::date AND ${endDate}::date`;
}

export function monthlyCreditQuantity(sessionsPerWeek?: number | null): number {
  return Math.max(1, Math.round((sessionsPerWeek ?? 1) * 4));
}
