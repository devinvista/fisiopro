import { db } from "@workspace/db";
import {
  proceduresTable,
  procedureCostsTable,
  appointmentsTable,
  financialRecordsTable,
  schedulesTable,
} from "@workspace/db";
import { and, count, eq, gte, ilike, isNull, lte, or, sql } from "drizzle-orm";
import type { AppointmentStatus } from "@workspace/shared-constants";

/** Filtro de tenant: clinic-specific OR global (clinicId IS NULL). */
export function tenantScopeCondition(clinicId: number | null | undefined, isSuperAdmin: boolean) {
  if (isSuperAdmin || !clinicId) return undefined;
  return or(isNull(proceduresTable.clinicId), eq(proceduresTable.clinicId, clinicId));
}

/** SELECT base de procedure JOIN procedure_costs (override por clínica). */
export async function listProceduresWithCosts(opts: {
  clinicId: number | null;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  category?: string;
  includeInactive: boolean;
}) {
  const { clinicId, isSuperAdmin, isAdmin, category, includeInactive } = opts;

  const conditions: any[] = [];
  if (!isSuperAdmin && clinicId) {
    conditions.push(or(isNull(proceduresTable.clinicId), eq(proceduresTable.clinicId, clinicId)));
  }
  if (category) conditions.push(ilike(proceduresTable.category, category));
  if (!isAdmin || !includeInactive) conditions.push(eq(proceduresTable.isActive, true));

  const clinicIdForJoin = clinicId ?? -1;

  return db
    .select({
      id: proceduresTable.id,
      name: proceduresTable.name,
      category: proceduresTable.category,
      modalidade: proceduresTable.modalidade,
      durationMinutes: proceduresTable.durationMinutes,
      price: proceduresTable.price,
      cost: proceduresTable.cost,
      description: proceduresTable.description,
      maxCapacity: proceduresTable.maxCapacity,
      onlineBookingEnabled: proceduresTable.onlineBookingEnabled,
      billingType: proceduresTable.billingType,
      monthlyPrice: proceduresTable.monthlyPrice,
      billingDay: proceduresTable.billingDay,
      clinicId: proceduresTable.clinicId,
      isActive: proceduresTable.isActive,
      createdAt: proceduresTable.createdAt,
      cc_priceOverride: procedureCostsTable.priceOverride,
      cc_monthlyPriceOverride: procedureCostsTable.monthlyPriceOverride,
      cc_fixedCost: procedureCostsTable.fixedCost,
      cc_variableCost: procedureCostsTable.variableCost,
      cc_notes: procedureCostsTable.notes,
    })
    .from(proceduresTable)
    .leftJoin(
      procedureCostsTable,
      and(
        eq(procedureCostsTable.procedureId, proceduresTable.id),
        eq(procedureCostsTable.clinicId, clinicIdForJoin)
      )
    )
    .where(
      conditions.length === 0
        ? undefined
        : conditions.length === 1
        ? conditions[0]
        : and(...conditions)
    )
    .orderBy(proceduresTable.name);
}

export async function findProcedureForPrice(procedureId: number, clinicId: number) {
  const [row] = await db
    .select({
      basePrice: proceduresTable.price,
      priceOverride: procedureCostsTable.priceOverride,
    })
    .from(proceduresTable)
    .leftJoin(
      procedureCostsTable,
      and(
        eq(procedureCostsTable.procedureId, proceduresTable.id),
        eq(procedureCostsTable.clinicId, clinicId)
      )
    )
    .where(eq(proceduresTable.id, procedureId))
    .limit(1);
  return row;
}

export async function insertProcedure(values: typeof proceduresTable.$inferInsert) {
  const [row] = await db.insert(proceduresTable).values(values).returning();
  return row;
}

export async function updateProcedureWhere(
  id: number,
  scopedCondition: ReturnType<typeof tenantScopeCondition>,
  values: Partial<typeof proceduresTable.$inferInsert>
) {
  const condition = scopedCondition
    ? and(eq(proceduresTable.id, id), scopedCondition)
    : eq(proceduresTable.id, id);
  const [row] = await db.update(proceduresTable).set(values).where(condition).returning();
  return row;
}

export async function findProcedureScoped(
  id: number,
  scopedCondition: ReturnType<typeof tenantScopeCondition>
) {
  const condition = scopedCondition
    ? and(eq(proceduresTable.id, id), scopedCondition)
    : eq(proceduresTable.id, id);
  const [row] = await db.select().from(proceduresTable).where(condition).limit(1);
  return row;
}

export async function setProcedureActive(id: number, isActive: boolean) {
  const [row] = await db
    .update(proceduresTable)
    .set({ isActive })
    .where(eq(proceduresTable.id, id))
    .returning();
  return row;
}

export async function deleteProcedureWhere(
  id: number,
  scopedCondition: ReturnType<typeof tenantScopeCondition>
) {
  const condition = scopedCondition
    ? and(eq(proceduresTable.id, id), scopedCondition)
    : eq(proceduresTable.id, id);
  await db.delete(proceduresTable).where(condition);
}

export async function countAppointmentsForProcedure(procedureId: number) {
  const [{ total }] = await db
    .select({ total: count() })
    .from(appointmentsTable)
    .where(eq(appointmentsTable.procedureId, procedureId));
  return Number(total);
}

// ── procedure_costs ────────────────────────────────────────────────────────────

export async function findCostsForClinic(procedureId: number, clinicId: number) {
  const [row] = await db
    .select()
    .from(procedureCostsTable)
    .where(
      and(
        eq(procedureCostsTable.procedureId, procedureId),
        eq(procedureCostsTable.clinicId, clinicId)
      )
    )
    .limit(1);
  return row;
}

export async function upsertCostsForClinic(
  procedureId: number,
  clinicId: number,
  values: {
    priceOverride: string | null;
    monthlyPriceOverride: string | null;
    fixedCost: string;
    variableCost: string;
    notes: string | null;
  }
) {
  const existing = await db
    .select({ id: procedureCostsTable.id })
    .from(procedureCostsTable)
    .where(
      and(
        eq(procedureCostsTable.procedureId, procedureId),
        eq(procedureCostsTable.clinicId, clinicId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    const [row] = await db
      .update(procedureCostsTable)
      .set({ ...values, updatedAt: new Date() })
      .where(
        and(
          eq(procedureCostsTable.procedureId, procedureId),
          eq(procedureCostsTable.clinicId, clinicId)
        )
      )
      .returning();
    return row;
  }

  const [row] = await db
    .insert(procedureCostsTable)
    .values({ procedureId, clinicId, ...values })
    .returning();
  return row;
}

export async function deleteCostsForClinic(procedureId: number, clinicId: number) {
  await db
    .delete(procedureCostsTable)
    .where(
      and(
        eq(procedureCostsTable.procedureId, procedureId),
        eq(procedureCostsTable.clinicId, clinicId)
      )
    );
}

// ── overhead-analysis helpers ──────────────────────────────────────────────────

export async function sumMonthlyExpenses(clinicId: number, startDate: string, endDate: string) {
  const [row] = await db
    .select({ total: sql<string>`COALESCE(SUM(${financialRecordsTable.amount}), 0)` })
    .from(financialRecordsTable)
    .where(
      and(
        eq(financialRecordsTable.clinicId, clinicId),
        eq(financialRecordsTable.type, "despesa"),
        gte(financialRecordsTable.dueDate, startDate),
        lte(financialRecordsTable.dueDate, endDate)
      )
    );
  return Number(row?.total ?? 0);
}

export async function activeClinicSchedules(clinicId: number) {
  return db
    .select()
    .from(schedulesTable)
    .where(
      and(
        eq(schedulesTable.clinicId, clinicId),
        eq(schedulesTable.isActive, true),
        eq(schedulesTable.type, "clinic")
      )
    );
}

export async function findProcedureMeta(procedureId: number) {
  const [row] = await db
    .select({
      durationMinutes: proceduresTable.durationMinutes,
      modalidade: proceduresTable.modalidade,
      maxCapacity: proceduresTable.maxCapacity,
    })
    .from(proceduresTable)
    .where(eq(proceduresTable.id, procedureId))
    .limit(1);
  return row;
}

export async function procedureUsageInPeriod(opts: {
  clinicId: number;
  procedureId: number;
  startDate: string;
  endDate: string;
}) {
  const confirmedStatuses: string[] = ["compareceu", "concluido"] satisfies AppointmentStatus[];
  const [row] = await db
    .select({
      apptCount: count(),
      uniqueSessions: sql<number>`COUNT(DISTINCT CASE WHEN ${appointmentsTable.status} = ANY(ARRAY[${sql.join(
        confirmedStatuses.map((s) => sql`${s}`),
        sql`, `
      )}]) THEN (${appointmentsTable.date}::text || '_' || ${appointmentsTable.startTime}) END)`,
    })
    .from(appointmentsTable)
    .where(
      and(
        eq(appointmentsTable.clinicId, opts.clinicId),
        eq(appointmentsTable.procedureId, opts.procedureId),
        gte(appointmentsTable.date, opts.startDate),
        lte(appointmentsTable.date, opts.endDate)
      )
    );
  return {
    apptCount: Number(row?.apptCount ?? 0),
    uniqueSessions: Number(row?.uniqueSessions ?? 0),
  };
}
