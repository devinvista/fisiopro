import { and, eq, gte, lte, isNull, isNotNull, or, sql } from "drizzle-orm";
import { financialRecordsTable } from "@workspace/db";
import { monthDateRangeBRT } from "../utils/dateUtils.js";

export const RECEIVABLE_TYPES = [
  "creditoAReceber",
  "cobrancaSessao",
  "cobrancaMensal",
  "faturaConsolidada",
];

const NON_COMPETENCY_REVENUE_TYPES = [
  "depositoCarteira",
  "vendaPacote",
  "pagamento",
  "faturaConsolidada",
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
    sql`(${financialRecordsTable.transactionType} IS NULL OR ${financialRecordsTable.transactionType} NOT IN ('depositoCarteira', 'vendaPacote', 'pagamento', 'faturaConsolidada'))`,
  )!;
}

export function monthDateRange(
  year: number,
  month: number,
): { startDate: string; endDate: string } {
  return monthDateRangeBRT(year, month);
}

export function recordDateFilter(startDate: string, endDate: string) {
  return or(
    and(
      isNotNull(financialRecordsTable.paymentDate),
      gte(financialRecordsTable.paymentDate, startDate),
      lte(financialRecordsTable.paymentDate, endDate),
    ),
    and(
      isNull(financialRecordsTable.paymentDate),
      isNotNull(financialRecordsTable.dueDate),
      gte(financialRecordsTable.dueDate, startDate),
      lte(financialRecordsTable.dueDate, endDate),
    ),
    and(
      isNull(financialRecordsTable.paymentDate),
      isNull(financialRecordsTable.dueDate),
      gte(sql`DATE(${financialRecordsTable.createdAt})`, startDate),
      lte(sql`DATE(${financialRecordsTable.createdAt})`, endDate),
    ),
  )!;
}

export function monthlyCreditQuantity(sessionsPerWeek?: number | null): number {
  return Math.max(1, Math.round((sessionsPerWeek ?? 1) * 4));
}
