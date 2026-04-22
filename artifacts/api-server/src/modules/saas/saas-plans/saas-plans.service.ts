import { db } from "@workspace/db";
import {
  subscriptionPlansTable,
  clinicSubscriptionsTable,
  patientsTable,
  userRolesTable,
  schedulesTable,
} from "@workspace/db";
import { eq, count, and } from "drizzle-orm";
import { todayBRT, addDays } from "../../../utils/dateUtils.js";
import { HttpError } from "../../../utils/httpError.js";
import { DEFAULT_PLANS } from "./saas-plans.constants.js";
import * as repo from "./saas-plans.repository.js";
import type { z } from "zod/v4";
import type { planSchema, subscriptionSchema, updateSubscriptionSchema, paymentSchema } from "./saas-plans.schemas.js";

type PlanInput = z.infer<typeof planSchema>;
type SubscriptionInput = z.infer<typeof subscriptionSchema>;
type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;
type PaymentInput = z.infer<typeof paymentSchema>;

// ─── Plans ────────────────────────────────────────────────────────────────────

export function listAllPlans() {
  return repo.listPlans();
}

export function listPublicPlans() {
  return repo.listActivePlans();
}

export function getPlanStats() {
  return repo.getPlanStats();
}

export async function seedDefaultPlans() {
  const results: { name: string; action: string }[] = [];
  for (const plan of DEFAULT_PLANS) {
    const [existing] = await db
      .select({ id: subscriptionPlansTable.id })
      .from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.name, plan.name))
      .limit(1);

    if (existing) {
      results.push({ name: plan.name, action: "skipped" });
    } else {
      await db.insert(subscriptionPlansTable).values(plan as typeof subscriptionPlansTable.$inferInsert);
      results.push({ name: plan.name, action: "created" });
    }
  }
  return results;
}

export async function createSaasPlan(body: PlanInput) {
  try {
    return await repo.createPlan({
      name: body.name,
      displayName: body.displayName,
      description: body.description ?? "",
      price: String(body.price),
      maxProfessionals: body.maxProfessionals ?? null,
      maxPatients: body.maxPatients ?? null,
      maxSchedules: body.maxSchedules ?? null,
      maxUsers: body.maxUsers ?? null,
      trialDays: body.trialDays ?? 30,
      features: body.features ?? [],
      isActive: body.isActive ?? true,
      sortOrder: body.sortOrder ?? 0,
    });
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === "23505") {
      throw HttpError.badRequest("Já existe um plano com esse identificador.");
    }
    throw err;
  }
}

export async function updateSaasPlan(id: number, body: Partial<PlanInput>) {
  const updateData: Partial<typeof subscriptionPlansTable.$inferInsert> = {};
  if (body.displayName !== undefined) updateData.displayName = body.displayName;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.price !== undefined) updateData.price = String(body.price);
  if (body.maxProfessionals !== undefined) updateData.maxProfessionals = body.maxProfessionals ?? null;
  if (body.maxPatients !== undefined) updateData.maxPatients = body.maxPatients ?? null;
  if (body.maxSchedules !== undefined) updateData.maxSchedules = body.maxSchedules ?? null;
  if (body.maxUsers !== undefined) updateData.maxUsers = body.maxUsers ?? null;
  if (body.trialDays !== undefined) updateData.trialDays = body.trialDays;
  if (body.features !== undefined) updateData.features = body.features;
  if (body.isActive !== undefined) updateData.isActive = body.isActive;
  if (body.sortOrder !== undefined) updateData.sortOrder = body.sortOrder;

  const plan = await repo.updatePlan(id, updateData);
  if (!plan) throw HttpError.notFound("Plano não encontrado");
  return plan;
}

export async function deleteSaasPlan(id: number) {
  await repo.deletePlan(id);
}

// ─── Clinic Subscriptions ─────────────────────────────────────────────────────

export function listAllSubscriptions() {
  return repo.listSubscriptions();
}

export async function createClinicSubscription(body: SubscriptionInput) {
  const plan = await repo.getPlanById(body.planId);
  if (!plan) throw HttpError.notFound("Plano não encontrado");

  const today = todayBRT();
  const trialEnd = new Date(today);
  trialEnd.setDate(trialEnd.getDate() + (plan.trialDays ?? 30));

  return repo.createSubscription({
    clinicId: body.clinicId,
    planId: body.planId,
    status: body.status ?? "trial",
    trialStartDate: body.trialStartDate ?? today,
    trialEndDate: body.trialEndDate ?? trialEnd.toISOString().split("T")[0],
    currentPeriodStart: body.currentPeriodStart ?? null,
    currentPeriodEnd: body.currentPeriodEnd ?? null,
    amount: body.amount != null ? String(body.amount) : String(plan.price),
    paymentStatus: body.paymentStatus ?? "pending",
    notes: body.notes ?? null,
  });
}

export async function updateClinicSubscription(id: number, body: UpdateSubscriptionInput) {
  const updateData: Partial<typeof clinicSubscriptionsTable.$inferInsert> = {};
  if (body.planId !== undefined) updateData.planId = body.planId;
  if (body.status !== undefined) {
    updateData.status = body.status;
    if (body.status === "cancelled") updateData.cancelledAt = new Date();
  }
  if (body.trialStartDate !== undefined) updateData.trialStartDate = body.trialStartDate ?? null;
  if (body.trialEndDate !== undefined) updateData.trialEndDate = body.trialEndDate ?? null;
  if (body.currentPeriodStart !== undefined) updateData.currentPeriodStart = body.currentPeriodStart ?? null;
  if (body.currentPeriodEnd !== undefined) updateData.currentPeriodEnd = body.currentPeriodEnd ?? null;
  if (body.amount !== undefined) updateData.amount = body.amount != null ? String(body.amount) : null;
  if (body.paymentStatus !== undefined) {
    updateData.paymentStatus = body.paymentStatus;
    if (body.paymentStatus === "paid") updateData.paidAt = new Date();
  }
  if (body.paidAt !== undefined) updateData.paidAt = body.paidAt ? new Date(body.paidAt) : null;
  if (body.notes !== undefined) updateData.notes = body.notes ?? null;

  const sub = await repo.updateSubscription(id, updateData);
  if (!sub) throw HttpError.notFound("Assinatura não encontrada");
  return sub;
}

// ─── Mine: current clinic subscription ────────────────────────────────────────

export async function getMineSubscription(clinicId: number | null) {
  if (!clinicId) return null;
  return repo.getClinicSubscription(clinicId);
}

export async function getMineLimits(clinicId: number | null) {
  if (!clinicId) return null;
  const row = await repo.getClinicSubscription(clinicId);
  if (!row) return { plan: null, limits: null, usage: null };

  const [patientsCount] = await db
    .select({ total: count() })
    .from(patientsTable)
    .where(eq(patientsTable.clinicId, clinicId));

  const [usersCount] = await db
    .select({ total: count() })
    .from(userRolesTable)
    .where(eq(userRolesTable.clinicId, clinicId));

  const [schedulesCount] = await db
    .select({ total: count() })
    .from(schedulesTable)
    .where(and(eq(schedulesTable.clinicId, clinicId), eq(schedulesTable.isActive, true)));

  return {
    sub: {
      id: row.sub.id,
      status: row.sub.status,
      paymentStatus: row.sub.paymentStatus,
      trialEndDate: row.sub.trialEndDate,
      currentPeriodEnd: row.sub.currentPeriodEnd,
    },
    plan: row.plan
      ? {
          id: row.plan.id,
          name: row.plan.name,
          displayName: row.plan.displayName,
          price: row.plan.price,
          features: row.plan.features,
        }
      : null,
    limits: row.plan
      ? {
          maxProfessionals: row.plan.maxProfessionals,
          maxPatients: row.plan.maxPatients,
          maxSchedules: row.plan.maxSchedules,
          maxUsers: row.plan.maxUsers,
        }
      : null,
    usage: {
      patients: patientsCount?.total ?? 0,
      users: usersCount?.total ?? 0,
      schedules: schedulesCount?.total ?? 0,
    },
  };
}

// ─── Admin clinics ────────────────────────────────────────────────────────────

export function listAdminClinics() {
  return repo.listAdminClinics();
}

// ─── Payment history ──────────────────────────────────────────────────────────

export function listAllPaymentHistory() {
  return repo.listPaymentHistory();
}

export function listClinicPaymentHistory(clinicId: number) {
  return repo.listPaymentHistoryByClinic(clinicId);
}

export function getPaymentHistoryStats() {
  return repo.getPaymentStats();
}

export async function createPayment(body: PaymentInput, recordedBy: number | null) {
  const paidAt = body.paidAt ? new Date(body.paidAt) : new Date();

  const payment = await repo.createPaymentRecord({
    clinicId: body.clinicId,
    subscriptionId: body.subscriptionId ?? null,
    amount: String(body.amount),
    method: body.method,
    referenceMonth: body.referenceMonth ?? null,
    paidAt,
    notes: body.notes ?? null,
    recordedBy,
  });

  if (body.updateSubscriptionStatus !== false && body.subscriptionId) {
    await applyPaymentToSubscription(body.subscriptionId, paidAt);
  }

  return payment;
}

export async function deletePayment(id: number) {
  await repo.deletePaymentRecord(id);
}

// ─── Apply payment to subscription (período rolante de 30 dias) ──────────────

export async function applyPaymentToSubscription(subscriptionId: number, paidAt: Date) {
  const currentSub = await repo.getSubscriptionById(subscriptionId);
  if (!currentSub) return;

  const subUpdate: Partial<typeof clinicSubscriptionsTable.$inferInsert> = {
    paymentStatus: "paid",
    paidAt,
    status: "active",
  };

  // Referência para início do próximo período: usa currentPeriodEnd existente
  // se disponível; senão usa trialEndDate; senão hoje.
  const periodBase = currentSub.currentPeriodEnd ?? currentSub.trialEndDate ?? todayBRT();
  const nextPeriodEnd = addDays(periodBase, 30);
  subUpdate.currentPeriodStart = periodBase;
  subUpdate.currentPeriodEnd = nextPeriodEnd;

  await repo.updateSubscription(subscriptionId, subUpdate);
}

// ─── Compat: trial end calculator (mantido) ───────────────────────────────────

export function calculateTrialEnd(trialDays: number, baseDate?: string): string {
  const base = baseDate ? new Date(baseDate) : new Date(todayBRT());
  const end = addDays(base.toISOString().split("T")[0], trialDays);
  return typeof end === "string" ? end : (end as Date).toISOString().split("T")[0];
}
