import { HttpError } from "../../../utils/httpError.js";
import * as repo from "./procedures.repository.js";
import type {
  CreateProcedureInput,
  UpdateProcedureInput,
  UpdateProcedureCostsInput,
} from "./procedures.schemas.js";

interface ActorScope {
  clinicId: number | null;
  isSuperAdmin: boolean;
  isAdmin: boolean;
}

function requireClinicId(clinicId: number | null | undefined): number {
  if (!clinicId) throw HttpError.badRequest("Clínica não selecionada");
  return clinicId;
}

function decorateProcedure(p: any) {
  return {
    ...p,
    isGlobal: p.clinicId === null,
    clinicCost: null,
    effectivePrice: p.price,
    effectiveTotalCost: p.cost ?? "0",
  };
}

/** Mantido por compatibilidade — retorna o preço efetivo (override de clínica ou base). */
export async function getEffectiveProcedurePrice(
  procedureId: number,
  clinicId: number | null
): Promise<string> {
  if (!clinicId) return "";
  const row = await repo.findProcedureForPrice(procedureId, clinicId);
  if (!row) return "0";
  return row.priceOverride ?? row.basePrice;
}

// ── Listagem ────────────────────────────────────────────────────────────────

export async function listProcedures(
  scope: ActorScope,
  filters: { category?: string; includeInactive: boolean }
) {
  const rows = await repo.listProceduresWithCosts({
    clinicId: scope.clinicId,
    isSuperAdmin: scope.isSuperAdmin,
    isAdmin: scope.isAdmin,
    category: filters.category,
    includeInactive: filters.includeInactive,
  });

  return rows.map((r) => {
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
}

// ── Create ──────────────────────────────────────────────────────────────────

export async function createProcedure(scope: ActorScope, body: CreateProcedureInput) {
  const {
    name,
    category,
    modalidade,
    durationMinutes,
    price,
    cost,
    description,
    maxCapacity,
    onlineBookingEnabled,
    billingType,
    monthlyPrice,
    billingDay,
    accountingAccountId,
  } = body;

  const resolvedMaxCapacity =
    maxCapacity != null
      ? maxCapacity
      : modalidade === "individual"
      ? 1
      : modalidade === "dupla"
      ? 2
      : 10;

  const procedure = await repo.insertProcedure({
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
    accountingAccountId: accountingAccountId ?? null,
    isActive: true,
    clinicId: scope.clinicId ?? null,
  });

  return decorateProcedure(procedure);
}

// ── Update ──────────────────────────────────────────────────────────────────

export async function updateProcedure(
  scope: ActorScope,
  id: number,
  body: UpdateProcedureInput
) {
  const {
    name,
    category,
    modalidade,
    durationMinutes,
    price,
    cost,
    description,
    maxCapacity,
    onlineBookingEnabled,
    billingType,
    monthlyPrice,
    billingDay,
    accountingAccountId,
  } = body;

  const scoped = repo.tenantScopeCondition(scope.clinicId, scope.isSuperAdmin);
  const procedure = await repo.updateProcedureWhere(id, scoped, {
    name,
    category,
    modalidade: modalidade || undefined,
    durationMinutes: durationMinutes ?? undefined,
    price: price ? String(price) : undefined,
    cost: cost !== undefined ? String(cost) : undefined,
    description,
    maxCapacity: maxCapacity ?? undefined,
    onlineBookingEnabled:
      onlineBookingEnabled !== undefined ? Boolean(onlineBookingEnabled) : undefined,
    billingType: billingType || undefined,
    monthlyPrice:
      monthlyPrice !== undefined ? (monthlyPrice ? String(monthlyPrice) : null) : undefined,
    billingDay: billingDay !== undefined ? (billingDay ?? null) : undefined,
    accountingAccountId:
      accountingAccountId !== undefined ? (accountingAccountId ?? null) : undefined,
  });
  if (!procedure) throw HttpError.notFound();
  return decorateProcedure(procedure);
}

// ── Toggle active ───────────────────────────────────────────────────────────

export async function toggleProcedureActive(scope: ActorScope, id: number) {
  if (!scope.isAdmin) {
    throw HttpError.forbidden("Apenas administradores podem ativar/desativar procedimentos.");
  }
  const scoped = repo.tenantScopeCondition(scope.clinicId, scope.isSuperAdmin);
  const existing = await repo.findProcedureScoped(id, scoped);
  if (!existing) throw HttpError.notFound();
  const updated = await repo.setProcedureActive(id, !existing.isActive);
  return decorateProcedure(updated);
}

// ── Delete ──────────────────────────────────────────────────────────────────

export async function deleteProcedure(scope: ActorScope, id: number) {
  const scoped = repo.tenantScopeCondition(scope.clinicId, scope.isSuperAdmin);
  const total = await repo.countAppointmentsForProcedure(id);
  if (total > 0) {
    throw HttpError.conflict(
      `Este procedimento não pode ser removido pois está vinculado a ${total} consulta(s). Remova ou reatribua as consultas antes de excluí-lo.`
    );
  }
  await repo.deleteProcedureWhere(id, scoped);
}

// ── Costs (clinic overrides) ───────────────────────────────────────────────

export async function getProcedureCosts(scope: ActorScope, id: number) {
  const clinicId = requireClinicId(scope.clinicId);
  const costs = await repo.findCostsForClinic(id, clinicId);
  return costs ?? null;
}

export async function upsertProcedureCosts(
  scope: ActorScope,
  id: number,
  body: UpdateProcedureCostsInput
) {
  const clinicId = requireClinicId(scope.clinicId);
  if (!scope.isAdmin) {
    throw HttpError.forbidden("Apenas administradores podem configurar custos");
  }
  const { priceOverride, monthlyPriceOverride, fixedCost, variableCost, notes } = body;
  return repo.upsertCostsForClinic(id, clinicId, {
    priceOverride: priceOverride != null ? String(priceOverride) : null,
    monthlyPriceOverride: monthlyPriceOverride != null ? String(monthlyPriceOverride) : null,
    fixedCost: fixedCost != null ? String(fixedCost) : "0",
    variableCost: variableCost != null ? String(variableCost) : "0",
    notes: notes || null,
  });
}

export async function deleteProcedureCosts(scope: ActorScope, id: number) {
  const clinicId = requireClinicId(scope.clinicId);
  await repo.deleteCostsForClinic(id, clinicId);
}

// ── Overhead analysis ──────────────────────────────────────────────────────

interface OverheadQuery {
  month?: number;
  year?: number;
  procedureId?: number | null;
}

export async function overheadAnalysis(scope: ActorScope, query: OverheadQuery) {
  const clinicId = requireClinicId(scope.clinicId);

  const now = new Date();
  const month = query.month && query.month > 0 ? query.month : now.getMonth() + 1;
  const year = query.year && query.year > 0 ? query.year : now.getFullYear();
  const procedureId = query.procedureId ?? null;

  // 1. Total overhead (despesas no mês)
  const daysInMonth = new Date(year, month, 0).getDate();
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  const totalOverhead = await repo.sumMonthlyExpenses(clinicId, startDate, endDate);

  // 2. Horas disponíveis a partir de schedules ativos
  const schedules = await repo.activeClinicSchedules(clinicId);
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

  for (const sch of schedules) {
    const workingDayNums = sch.workingDays.split(",").map(Number);
    const [sh, sm] = sch.startTime.split(":").map(Number);
    const [eh, em] = sch.endTime.split(":").map(Number);
    const hoursPerDay = (eh * 60 + em - (sh * 60 + sm)) / 60;

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

  const costPerHour = totalAvailableHours > 0 ? totalOverhead / totalAvailableHours : 0;

  // 3. Stats por procedimento (opcional)
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
    const proc = await repo.findProcedureMeta(procedureId);
    if (proc) {
      const durationHours = proc.durationMinutes / 60;
      const isGroup = proc.modalidade !== "individual";
      const maxCap = Math.max(proc.maxCapacity ?? 1, 1);
      const estimatedCapacityDivisor = isGroup ? maxCap : 1;

      const usage = await repo.procedureUsageInPeriod({
        clinicId,
        procedureId,
        startDate,
        endDate,
      });

      const confirmedAppointments = usage.apptCount;
      const uniqueCompletedSessions = usage.uniqueSessions;

      const avgActualParticipants =
        isGroup && uniqueCompletedSessions > 0
          ? confirmedAppointments / uniqueCompletedSessions
          : estimatedCapacityDivisor;
      const realCapacityDivisor = Math.max(avgActualParticipants, 1);

      const fixedCostPerSession = (costPerHour * durationHours) / estimatedCapacityDivisor;
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
        fixedCostAllocatedMonthly:
          Math.round(confirmedAppointments * fixedCostPerSessionReal * 100) / 100,
      };
    }
  }

  return {
    month,
    year,
    totalOverhead,
    schedules: scheduleBreakdown,
    totalAvailableHours: Math.round(totalAvailableHours * 10) / 10,
    costPerHour: Math.round(costPerHour * 100) / 100,
    procedureStats,
  };
}
