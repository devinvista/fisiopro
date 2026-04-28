/**
 * session-credits service — Sprint 3
 *
 * Funções de negócio sobre `session_credits`:
 *
 *  - `expireSessionCredits()`: marca como `expirado` créditos cuja
 *    `valid_until` já passou e que ainda têm saldo (`quantity - usedQuantity > 0`).
 *    Apenas linhas em `disponivel` ou `pendentePagamento` são afetadas.
 *    Idempotente; chamado pelo job `endOfDay`.
 *
 *  - `getPatientCreditsStatement(patientId)`: retorna o extrato detalhado
 *    de créditos do paciente, agrupável no client por origem/mês/status.
 */
import { db } from "@workspace/db";
import {
  sessionCreditsTable,
  proceduresTable,
  appointmentsTable,
  financialRecordsTable,
} from "@workspace/db";
import { and, eq, sql, desc } from "drizzle-orm";
import { todayBRT } from "../../../utils/dateUtils.js";

export interface ExpireResult {
  expired: number;
  ids: number[];
}

/**
 * Expira créditos vencidos (valid_until < hoje) com saldo remanescente.
 * Não toca em `consumido`, `estornado` ou `expirado`.
 */
export async function expireSessionCredits(): Promise<ExpireResult> {
  const today = todayBRT();
  const result = await db
    .update(sessionCreditsTable)
    .set({
      status: "expirado",
      expiredAt: new Date(),
      notes: sql`COALESCE(${sessionCreditsTable.notes}, '') || E'\n[expirado em ' || ${today}::text || ']'`,
    })
    .where(
      and(
        sql`${sessionCreditsTable.status} IN ('disponivel','pendentePagamento')`,
        sql`${sessionCreditsTable.validUntil} IS NOT NULL`,
        sql`${sessionCreditsTable.validUntil} < ${today}::date`,
        sql`(${sessionCreditsTable.quantity} - ${sessionCreditsTable.usedQuantity}) > 0`,
      ),
    )
    .returning({ id: sessionCreditsTable.id });
  return { expired: result.length, ids: result.map((r) => r.id) };
}

export interface CreditStatementRow {
  id: number;
  procedureId: number | null;
  procedureName: string | null;
  quantity: number;
  usedQuantity: number;
  remaining: number;
  status: string;
  origin: string;
  monthRef: string | null;
  validUntil: string | null;
  expiredAt: Date | null;
  financialRecordId: number | null;
  invoiceDescription: string | null;
  invoiceStatus: string | null;
  sourceAppointmentId: number | null;
  sourceAppointmentDate: string | null;
  consumedByAppointmentId: number | null;
  consumedAppointmentDate: string | null;
  notes: string | null;
  createdAt: Date;
}

/**
 * Retorna o extrato completo de créditos do paciente, com nomes de
 * procedimento e datas de appointments resolvidos para exibição.
 */
export async function getPatientCreditsStatement(
  patientId: number,
): Promise<CreditStatementRow[]> {
  // Aliases para os 2 joins distintos com appointments (origem vs. consumo).
  const sourceAppt = sql<string>`(
    SELECT ${appointmentsTable.date} FROM ${appointmentsTable}
    WHERE ${appointmentsTable.id} = ${sessionCreditsTable.sourceAppointmentId}
  )`;
  const consumedAppt = sql<string>`(
    SELECT ${appointmentsTable.date} FROM ${appointmentsTable}
    WHERE ${appointmentsTable.id} = ${sessionCreditsTable.consumedByAppointmentId}
  )`;
  const invoiceDesc = sql<string>`(
    SELECT ${financialRecordsTable.description} FROM ${financialRecordsTable}
    WHERE ${financialRecordsTable.id} = ${sessionCreditsTable.financialRecordId}
  )`;
  const invoiceSt = sql<string>`(
    SELECT ${financialRecordsTable.status} FROM ${financialRecordsTable}
    WHERE ${financialRecordsTable.id} = ${sessionCreditsTable.financialRecordId}
  )`;

  const rows = await db
    .select({
      id: sessionCreditsTable.id,
      procedureId: sessionCreditsTable.procedureId,
      procedureName: proceduresTable.name,
      quantity: sessionCreditsTable.quantity,
      usedQuantity: sessionCreditsTable.usedQuantity,
      status: sessionCreditsTable.status,
      origin: sessionCreditsTable.origin,
      monthRef: sessionCreditsTable.monthRef,
      validUntil: sessionCreditsTable.validUntil,
      expiredAt: sessionCreditsTable.expiredAt,
      financialRecordId: sessionCreditsTable.financialRecordId,
      sourceAppointmentId: sessionCreditsTable.sourceAppointmentId,
      consumedByAppointmentId: sessionCreditsTable.consumedByAppointmentId,
      notes: sessionCreditsTable.notes,
      createdAt: sessionCreditsTable.createdAt,
      sourceAppointmentDate: sourceAppt,
      consumedAppointmentDate: consumedAppt,
      invoiceDescription: invoiceDesc,
      invoiceStatus: invoiceSt,
    })
    .from(sessionCreditsTable)
    .leftJoin(proceduresTable, eq(proceduresTable.id, sessionCreditsTable.procedureId))
    .where(eq(sessionCreditsTable.patientId, patientId))
    .orderBy(desc(sessionCreditsTable.createdAt));

  return rows.map((r) => ({
    id: r.id,
    procedureId: r.procedureId,
    procedureName: r.procedureName,
    quantity: r.quantity,
    usedQuantity: r.usedQuantity,
    remaining: Math.max(0, r.quantity - r.usedQuantity),
    status: r.status,
    origin: r.origin,
    monthRef: r.monthRef,
    validUntil: r.validUntil,
    expiredAt: r.expiredAt,
    financialRecordId: r.financialRecordId,
    invoiceDescription: r.invoiceDescription,
    invoiceStatus: r.invoiceStatus,
    sourceAppointmentId: r.sourceAppointmentId,
    sourceAppointmentDate: r.sourceAppointmentDate,
    consumedByAppointmentId: r.consumedByAppointmentId,
    consumedAppointmentDate: r.consumedAppointmentDate,
    notes: r.notes,
    createdAt: r.createdAt,
  }));
}
