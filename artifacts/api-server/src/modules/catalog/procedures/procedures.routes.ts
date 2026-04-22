import { Router } from "express";
import { db } from "@workspace/db";
import { proceduresTable, procedureCostsTable, appointmentsTable, financialRecordsTable, schedulesTable } from "@workspace/db";
import { eq, and, count, ilike, isNull, or, sql, gte, lte } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../../../middleware/auth.js";
import { requirePermission } from "../../../middleware/rbac.js";
import type { Role } from "@workspace/db";
import { validateBody, optionalPositiveNumber } from "../../../utils/validate.js";
import { z } from "zod/v4";

const procedureCategoryEnum = z.enum(["Reabilitação", "Estética", "Pilates", "Outro"]);
const procedureModalidadeEnum = z.enum(["individual", "dupla", "grupo"]);
const procedureBillingTypeEnum = z.enum(["porSessao", "mensal"]);

const createProcedureSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(200),
  category: procedureCategoryEnum,
  modalidade: procedureModalidadeEnum.default("individual"),
  durationMinutes: z.union([z.number(), z.string()]).transform(Number).refine(v => Number.isInteger(v) && v > 0, "Duração deve ser um inteiro positivo"),
  price: z.union([z.number(), z.string()]).transform(Number).refine(v => !isNaN(v) && v >= 0, "Preço deve ser não-negativo"),
  cost: z.union([z.number(), z.string()]).transform(Number).refine(v => !isNaN(v) && v >= 0).optional(),
  description: z.string().max(1000).optional().nullable(),
  maxCapacity: z.union([z.number(), z.string()]).transform(Number).refine(v => Number.isInteger(v) && v > 0).optional().nullable(),
  onlineBookingEnabled: z.boolean().optional().default(false),
  billingType: procedureBillingTypeEnum.default("porSessao"),
  monthlyPrice: z.union([z.number(), z.string()]).transform(Number).refine(v => !isNaN(v) && v > 0).optional().nullable(),
  billingDay: z.union([z.number(), z.string()]).transform(Number).refine(v => Number.isInteger(v) && v >= 1 && v <= 31, "billingDay deve ser entre 1 e 31").optional().nullable(),
}).refine(d => d.billingType !== "mensal" || (d.monthlyPrice && d.billingDay), {
  message: "Para cobrança mensal, monthlyPrice e billingDay são obrigatórios",
});

const updateProcedureSchema = createProcedureSchema.partial();

const updateProcedureCostsSchema = z.object({
  priceOverride: optionalPositiveNumber,
  monthlyPriceOverride: optionalPositiveNumber,
  fixedCost: optionalPositiveNumber,
  variableCost: optionalPositiveNumber,
  notes: z.string().max(500).optional().nullable(),
});

const router = Router();
router.use(authMiddleware);

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Returns the effective price for a procedure in a specific clinic.
 *  Falls back to the procedure's own price when no clinic override exists. */
export async function getEffectiveProcedurePrice(
  procedureId: number,
  clinicId: number | null
): Promise<string> {
  if (!clinicId) return "";
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

  if (!row) return "0";
  return row.priceOverride ?? row.basePrice;
}

// ─── GET /  (list) ────────────────────────────────────────────────────────────

router.get("/", requirePermission("procedures.manage"), async (req: AuthRequest, res) => {
  try {
    const category = req.query.category as string | undefined;
    const includeInactive = req.query.includeInactive === "true";

    const isAdmin = req.isSuperAdmin || (req.userRoles ?? []).includes("admin" as Role);

    const conditions: any[] = [];
    if (!req.isSuperAdmin && req.clinicId) {
      conditions.push(or(isNull(proceduresTable.clinicId), eq(proceduresTable.clinicId, req.clinicId)));
    }
    if (category) conditions.push(ilike(proceduresTable.category, category));
    if (!isAdmin || !includeInactive) conditions.push(eq(proceduresTable.isActive, true));

    // JOIN with procedure_costs for the current clinic (-1 never matches → null clinicCost)
    const clinicIdForJoin = req.clinicId ?? -1;

    const rows = await db
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
        // Clinic-specific cost override (null when no row in procedure_costs)
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
      .where(conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(proceduresTable.name);

    const procedures = rows.map((r) => {
      const hasClinicCost = r.cc_fixedCost !== null;
      const fixedCost = r.cc_fixedCost ?? "0";
      const variableCost = r.cc_variableCost ?? "0";
      const effectiveTotalCost = hasClinicCost
        ? String(Number(fixedCost) + Number(variableCost))
        : String(r.cost ?? "0");

      return {
        id: r.id,
        name: r.name,
        category: r.category,
        modalidade: r.modalidade,
        durationMinutes: r.durationMinutes,
        price: r.price,
        cost: r.cost,
        description: r.description,
        maxCapacity: r.maxCapacity,
        onlineBookingEnabled: r.onlineBookingEnabled,
        billingType: r.billingType,
        monthlyPrice: r.monthlyPrice,
        billingDay: r.billingDay,
        clinicId: r.clinicId,
        isActive: r.isActive,
        createdAt: r.createdAt,
        isGlobal: r.clinicId === null,
        effectivePrice: r.cc_priceOverride ?? r.price,
        effectiveMonthlyPrice: r.cc_monthlyPriceOverride ?? r.monthlyPrice ?? null,
        effectiveTotalCost,
        clinicCost: hasClinicCost
          ? {
              priceOverride: r.cc_priceOverride,
              monthlyPriceOverride: r.cc_monthlyPriceOverride,
              fixedCost,
              variableCost,
              notes: r.cc_notes,
            }
          : null,
      };
    });

    res.json(procedures);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── POST / (create) ──────────────────────────────────────────────────────────

router.post("/", requirePermission("procedures.manage"), async (req: AuthRequest, res) => {
  try {
    const body = validateBody(createProcedureSchema, req.body, res);
    if (!body) return;
    const { name, category, modalidade, durationMinutes, price, cost, description, maxCapacity, onlineBookingEnabled, billingType, monthlyPrice, billingDay } = body;

    const resolvedMaxCapacity = maxCapacity != null
      ? maxCapacity
      : modalidade === "individual" ? 1 : modalidade === "dupla" ? 2 : 10;

    const [procedure] = await db
      .insert(proceduresTable)
      .values({
        name,
        category,
        modalidade,
        durationMinutes,
        price: String(price),
        cost: cost != null ? String(cost) : "0",
        description: description ?? null,
        maxCapacity: resolvedMaxCapacity,
        onlineBookingEnabled: onlineBookingEnabled ?? false,
        billingType,
        monthlyPrice: monthlyPrice != null ? String(monthlyPrice) : null,
        billingDay: billingDay ?? null,
        isActive: true,
        clinicId: req.clinicId ?? null,
      })
      .returning();

    res.status(201).json({ ...procedure, isGlobal: procedure.clinicId === null, clinicCost: null, effectivePrice: procedure.price, effectiveTotalCost: procedure.cost ?? "0" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── GET /overhead-analysis ───────────────────────────────────────────────────
// Computes: totalOverhead (expenses) / totalAvailableHours → costPerHour
// Optionally enriched with per-procedure usage stats when ?procedureId= is given
// MUST be registered before any /:id route to avoid "overhead-analysis" being
// matched as an id parameter.

router.get("/overhead-analysis", requirePermission("procedures.manage"), async (req: AuthRequest, res) => {
  try {
    const clinicId = req.clinicId;
    if (!clinicId) {
      res.status(400).json({ error: "Bad Request", message: "Clínica não selecionada" });
      return;
    }

    const now = new Date();
    const month = parseInt(req.query.month as string) || (now.getMonth() + 1);
    const year  = parseInt(req.query.year  as string) || now.getFullYear();
    const procedureId = req.query.procedureId ? parseInt(req.query.procedureId as string) : null;

    // ── 1. Total overhead expenses for the month ──────────────────────────────
    const daysInMonth = new Date(year, month, 0).getDate();
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate   = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

    const [expenseRow] = await db
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

    const totalOverhead = Number(expenseRow?.total ?? 0);

    // ── 2. Available clinic hours from active schedules ────────────────────────
    // workingDays uses JS getDay() convention: 0=Sun, 1=Mon … 6=Sat
    const activeSchedules = await db
      .select()
      .from(schedulesTable)
      .where(
        and(
          eq(schedulesTable.clinicId, clinicId),
          eq(schedulesTable.isActive, true),
          eq(schedulesTable.type, "clinic")
        )
      );

    let totalAvailableHours = 0;
    const scheduleBreakdown: Array<{
      name: string;
      startTime: string;
      endTime: string;
      workingDays: string;
      hoursPerDay: number;
      workingDaysInMonth: number;
      hoursInMonth: number;
    }> = [];

    for (const sch of activeSchedules) {
      const workingDayNums = sch.workingDays.split(",").map(Number);
      const [sh, sm] = sch.startTime.split(":").map(Number);
      const [eh, em] = sch.endTime.split(":").map(Number);
      const hoursPerDay = ((eh * 60 + em) - (sh * 60 + sm)) / 60;

      let workingDaysInMonth = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const dow = new Date(year, month - 1, d).getDay();
        if (workingDayNums.includes(dow)) workingDaysInMonth++;
      }

      const hoursInMonth = hoursPerDay * workingDaysInMonth;
      totalAvailableHours += hoursInMonth;

      scheduleBreakdown.push({
        name: sch.name,
        startTime: sch.startTime,
        endTime: sch.endTime,
        workingDays: sch.workingDays,
        hoursPerDay: Math.round(hoursPerDay * 10) / 10,
        workingDaysInMonth,
        hoursInMonth: Math.round(hoursInMonth * 10) / 10,
      });
    }

    const costPerHour = totalAvailableHours > 0
      ? totalOverhead / totalAvailableHours
      : 0;

    // ── 3. Per-procedure usage stats (optional) ────────────────────────────────
    let procedureStats: {
      procedureId: number;
      durationMinutes: number;
      estimatedCapacityDivisor: number;
      realCapacityDivisor: number;
      avgActualParticipants: number | null;
      fixedCostPerSession: number;
      fixedCostPerSessionReal: number;
      confirmedAppointments: number;
      uniqueCompletedSessions: number;
      totalHoursUsed: number;
      fixedCostAllocatedMonthly: number;
    } | null = null;

    if (procedureId) {
      const [proc] = await db
        .select({
          durationMinutes: proceduresTable.durationMinutes,
          modalidade: proceduresTable.modalidade,
          maxCapacity: proceduresTable.maxCapacity,
        })
        .from(proceduresTable)
        .where(eq(proceduresTable.id, procedureId))
        .limit(1);

      if (proc) {
        const durationHours = proc.durationMinutes / 60;
        const isGroup = proc.modalidade !== "individual";
        const maxCap = Math.max(proc.maxCapacity ?? 1, 1);

        // Estimated: assume full session capacity (for pricing decisions).
        const estimatedCapacityDivisor = isGroup ? maxCap : 1;

        const confirmedStatuses = ["compareceu", "concluido"];
        const [usageRow] = await db
          .select({
            apptCount: count(),
            uniqueSessions: sql<number>`COUNT(DISTINCT CASE WHEN ${appointmentsTable.status} = ANY(ARRAY[${sql.join(confirmedStatuses.map(s => sql`${s}`), sql`, `)}]) THEN (${appointmentsTable.date}::text || '_' || ${appointmentsTable.startTime}) END)`,
          })
          .from(appointmentsTable)
          .where(
            and(
              eq(appointmentsTable.clinicId, clinicId),
              eq(appointmentsTable.procedureId, procedureId),
              gte(appointmentsTable.date, startDate),
              lte(appointmentsTable.date, endDate)
            )
          );

        const confirmedAppointments = Number(usageRow?.apptCount ?? 0);
        const uniqueCompletedSessions = Number(usageRow?.uniqueSessions ?? 0);

        // Real divisor: actual average participants per completed session.
        // Falls back to maxCapacity when no sessions have been completed yet.
        const avgActualParticipants = (isGroup && uniqueCompletedSessions > 0)
          ? confirmedAppointments / uniqueCompletedSessions
          : estimatedCapacityDivisor;
        const realCapacityDivisor = Math.max(avgActualParticipants, 1);

        const fixedCostPerSession     = (costPerHour * durationHours) / estimatedCapacityDivisor;
        const fixedCostPerSessionReal = (costPerHour * durationHours) / realCapacityDivisor;
        const totalHoursUsed = confirmedAppointments * durationHours;

        procedureStats = {
          procedureId,
          durationMinutes: proc.durationMinutes,
          estimatedCapacityDivisor,
          realCapacityDivisor: Math.round(realCapacityDivisor * 100) / 100,
          avgActualParticipants: isGroup ? Math.round(avgActualParticipants * 10) / 10 : null,
          fixedCostPerSession: Math.round(fixedCostPerSession * 100) / 100,
          fixedCostPerSessionReal: Math.round(fixedCostPerSessionReal * 100) / 100,
          confirmedAppointments,
          uniqueCompletedSessions,
          totalHoursUsed: Math.round(totalHoursUsed * 100) / 100,
          fixedCostAllocatedMonthly: Math.round(confirmedAppointments * fixedCostPerSessionReal * 100) / 100,
        };
      }
    }

    res.json({
      month,
      year,
      totalOverhead,
      schedules: scheduleBreakdown,
      totalAvailableHours: Math.round(totalAvailableHours * 10) / 10,
      costPerHour: Math.round(costPerHour * 100) / 100,
      procedureStats,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── PUT /:id (update base data) ──────────────────────────────────────────────

router.put("/:id", requirePermission("procedures.manage"), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const body = validateBody(updateProcedureSchema, req.body, res);
    if (!body) return;
    const { name, category, modalidade, durationMinutes, price, cost, description, maxCapacity, onlineBookingEnabled, billingType, monthlyPrice, billingDay } = body;

    const condition = req.isSuperAdmin || !req.clinicId
      ? eq(proceduresTable.id, id)
      : and(
          eq(proceduresTable.id, id),
          or(isNull(proceduresTable.clinicId), eq(proceduresTable.clinicId, req.clinicId!))
        );

    const [procedure] = await db
      .update(proceduresTable)
      .set({
        name,
        category,
        modalidade: modalidade || undefined,
        durationMinutes: durationMinutes ?? undefined,
        price: price ? String(price) : undefined,
        cost: cost !== undefined ? String(cost) : undefined,
        description,
        maxCapacity: maxCapacity ?? undefined,
        onlineBookingEnabled: onlineBookingEnabled !== undefined ? Boolean(onlineBookingEnabled) : undefined,
        billingType: billingType || undefined,
        monthlyPrice: monthlyPrice !== undefined ? (monthlyPrice ? String(monthlyPrice) : null) : undefined,
        billingDay: billingDay !== undefined ? (billingDay ?? null) : undefined,
      })
      .where(condition)
      .returning();

    if (!procedure) {
      res.status(404).json({ error: "Not Found" });
      return;
    }
    res.json({ ...procedure, isGlobal: procedure.clinicId === null, clinicCost: null, effectivePrice: procedure.price, effectiveTotalCost: procedure.cost ?? "0" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── GET /:id/costs  (clinic-specific cost config) ───────────────────────────

router.get("/:id/costs", requirePermission("procedures.manage"), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const clinicId = req.clinicId;

    if (!clinicId) {
      res.status(400).json({ error: "Bad Request", message: "Clínica não selecionada" });
      return;
    }

    const [costs] = await db
      .select()
      .from(procedureCostsTable)
      .where(
        and(
          eq(procedureCostsTable.procedureId, id),
          eq(procedureCostsTable.clinicId, clinicId)
        )
      )
      .limit(1);

    res.json(costs ?? null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── PUT /:id/costs  (upsert clinic-specific costs) ──────────────────────────

router.put("/:id/costs", requirePermission("procedures.manage"), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const clinicId = req.clinicId;

    if (!clinicId) {
      res.status(400).json({ error: "Bad Request", message: "Clínica não selecionada" });
      return;
    }

    const isAdmin = req.isSuperAdmin || (req.userRoles ?? []).includes("admin" as Role);
    if (!isAdmin) {
      res.status(403).json({ error: "Forbidden", message: "Apenas administradores podem configurar custos" });
      return;
    }

    const costsBody = validateBody(updateProcedureCostsSchema, req.body, res);
    if (!costsBody) return;
    const { priceOverride, monthlyPriceOverride, fixedCost, variableCost, notes } = costsBody;

    const fixedCostVal = fixedCost != null ? String(fixedCost) : "0";
    const variableCostVal = variableCost != null ? String(variableCost) : "0";
    const priceOverrideVal = priceOverride != null ? String(priceOverride) : null;
    const monthlyPriceOverrideVal = monthlyPriceOverride != null ? String(monthlyPriceOverride) : null;

    const existing = await db
      .select({ id: procedureCostsTable.id })
      .from(procedureCostsTable)
      .where(
        and(
          eq(procedureCostsTable.procedureId, id),
          eq(procedureCostsTable.clinicId, clinicId)
        )
      )
      .limit(1);

    let result;
    if (existing.length > 0) {
      [result] = await db
        .update(procedureCostsTable)
        .set({
          priceOverride: priceOverrideVal,
          monthlyPriceOverride: monthlyPriceOverrideVal,
          fixedCost: fixedCostVal,
          variableCost: variableCostVal,
          notes: notes || null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(procedureCostsTable.procedureId, id),
            eq(procedureCostsTable.clinicId, clinicId)
          )
        )
        .returning();
    } else {
      [result] = await db
        .insert(procedureCostsTable)
        .values({
          procedureId: id,
          clinicId,
          priceOverride: priceOverrideVal,
          monthlyPriceOverride: monthlyPriceOverrideVal,
          fixedCost: fixedCostVal,
          variableCost: variableCostVal,
          notes: notes || null,
        })
        .returning();
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── DELETE /:id/costs  (remove clinic cost override) ────────────────────────

router.delete("/:id/costs", requirePermission("procedures.manage"), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const clinicId = req.clinicId;

    if (!clinicId) {
      res.status(400).json({ error: "Bad Request", message: "Clínica não selecionada" });
      return;
    }

    await db
      .delete(procedureCostsTable)
      .where(
        and(
          eq(procedureCostsTable.procedureId, id),
          eq(procedureCostsTable.clinicId, clinicId)
        )
      );

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── PATCH /:id/toggle-active ─────────────────────────────────────────────────

router.patch("/:id/toggle-active", requirePermission("procedures.manage"), async (req: AuthRequest, res) => {
  try {
    const isAdmin = req.isSuperAdmin || (req.userRoles ?? []).includes("admin" as Role);
    if (!isAdmin) {
      res.status(403).json({ error: "Forbidden", message: "Apenas administradores podem ativar/desativar procedimentos." });
      return;
    }

    const id = parseInt(req.params.id as string);
    const condition = req.isSuperAdmin || !req.clinicId
      ? eq(proceduresTable.id, id)
      : and(
          eq(proceduresTable.id, id),
          or(isNull(proceduresTable.clinicId), eq(proceduresTable.clinicId, req.clinicId!))
        );

    const existing = await db.select().from(proceduresTable).where(condition).limit(1);
    if (!existing[0]) {
      res.status(404).json({ error: "Not Found" });
      return;
    }

    const [updated] = await db
      .update(proceduresTable)
      .set({ isActive: !existing[0].isActive })
      .where(eq(proceduresTable.id, id))
      .returning();

    res.json({ ...updated, isGlobal: updated.clinicId === null, clinicCost: null, effectivePrice: updated.price, effectiveTotalCost: updated.cost ?? "0" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── DELETE /:id ─────────────────────────────────────────────────────────────

router.delete("/:id", requirePermission("procedures.manage"), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);

    const deleteCondition = req.isSuperAdmin || !req.clinicId
      ? eq(proceduresTable.id, id)
      : and(
          eq(proceduresTable.id, id),
          or(isNull(proceduresTable.clinicId), eq(proceduresTable.clinicId, req.clinicId!))
        );

    const [{ total }] = await db
      .select({ total: count() })
      .from(appointmentsTable)
      .where(eq(appointmentsTable.procedureId, id));

    if (total > 0) {
      res.status(409).json({
        error: "Conflict",
        message: `Este procedimento não pode ser removido pois está vinculado a ${total} consulta(s). Remova ou reatribua as consultas antes de excluí-lo.`,
      });
      return;
    }

    // procedure_costs rows are deleted automatically by CASCADE
    await db.delete(proceduresTable).where(deleteCondition);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
