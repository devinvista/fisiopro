import { db } from "@workspace/db";
import {
  subscriptionPlansTable,
  clinicSubscriptionsTable,
  clinicsTable,
  patientsTable,
  usersTable,
  userRolesTable,
  schedulesTable,
  clinicPaymentHistoryTable,
} from "@workspace/db";
import { eq, desc, asc, count, and, sql, gte, lte } from "drizzle-orm";

// ─── Plans ────────────────────────────────────────────────────────────────────

export async function listPlans() {
  return db.select().from(subscriptionPlansTable).orderBy(asc(subscriptionPlansTable.sortOrder));
}

export async function listActivePlans() {
  return db.select().from(subscriptionPlansTable)
    .where(eq(subscriptionPlansTable.isActive, true))
    .orderBy(asc(subscriptionPlansTable.sortOrder));
}

export async function getPlanById(id: number) {
  const [plan] = await db.select().from(subscriptionPlansTable).where(eq(subscriptionPlansTable.id, id)).limit(1);
  return plan ?? null;
}

export async function createPlan(data: typeof subscriptionPlansTable.$inferInsert) {
  const [plan] = await db.insert(subscriptionPlansTable).values(data).returning();
  return plan;
}

export async function updatePlan(id: number, data: Partial<typeof subscriptionPlansTable.$inferInsert>) {
  const [plan] = await db.update(subscriptionPlansTable).set({ ...data, updatedAt: new Date() })
    .where(eq(subscriptionPlansTable.id, id)).returning();
  return plan ?? null;
}

export async function deletePlan(id: number) {
  await db.delete(subscriptionPlansTable).where(eq(subscriptionPlansTable.id, id));
}

export async function getPlanStats() {
  const plans = await db.select().from(subscriptionPlansTable).orderBy(asc(subscriptionPlansTable.sortOrder));
  const subs = await db.select({ sub: clinicSubscriptionsTable }).from(clinicSubscriptionsTable);

  return plans.map((plan) => {
    const planSubs = subs.filter((s) => s.sub.planId === plan.id);
    const active = planSubs.filter((s) => s.sub.status === "active").length;
    const trial = planSubs.filter((s) => s.sub.status === "trial").length;
    const suspended = planSubs.filter((s) => s.sub.status === "suspended").length;
    const cancelled = planSubs.filter((s) => s.sub.status === "cancelled").length;
    const mrr = planSubs
      .filter((s) => s.sub.status === "active" && s.sub.paymentStatus === "paid")
      .reduce((acc, s) => acc + Number(s.sub.amount ?? 0), 0);

    return {
      planId: plan.id,
      planName: plan.name,
      planDisplayName: plan.displayName,
      price: plan.price,
      total: planSubs.length,
      active,
      trial,
      suspended,
      cancelled,
      mrr,
    };
  });
}

// ─── Clinic Subscriptions ─────────────────────────────────────────────────────

export async function listSubscriptions() {
  return db
    .select({
      sub: clinicSubscriptionsTable,
      clinic: {
        id: clinicsTable.id,
        name: clinicsTable.name,
        email: clinicsTable.email,
        isActive: clinicsTable.isActive,
        createdAt: clinicsTable.createdAt,
      },
      plan: subscriptionPlansTable,
    })
    .from(clinicSubscriptionsTable)
    .leftJoin(clinicsTable, eq(clinicSubscriptionsTable.clinicId, clinicsTable.id))
    .leftJoin(subscriptionPlansTable, eq(clinicSubscriptionsTable.planId, subscriptionPlansTable.id))
    .orderBy(desc(clinicSubscriptionsTable.createdAt));
}

export async function getSubscriptionById(id: number) {
  const [sub] = await db.select().from(clinicSubscriptionsTable).where(eq(clinicSubscriptionsTable.id, id)).limit(1);
  return sub ?? null;
}

export async function getClinicSubscription(clinicId: number) {
  const [sub] = await db
    .select({ sub: clinicSubscriptionsTable, plan: subscriptionPlansTable })
    .from(clinicSubscriptionsTable)
    .leftJoin(subscriptionPlansTable, eq(clinicSubscriptionsTable.planId, subscriptionPlansTable.id))
    .where(eq(clinicSubscriptionsTable.clinicId, clinicId))
    .orderBy(desc(clinicSubscriptionsTable.createdAt))
    .limit(1);
  return sub ?? null;
}

export async function createSubscription(data: typeof clinicSubscriptionsTable.$inferInsert) {
  const [sub] = await db.insert(clinicSubscriptionsTable).values(data).returning();
  return sub;
}

export async function updateSubscription(id: number, data: Partial<typeof clinicSubscriptionsTable.$inferInsert>) {
  const [sub] = await db.update(clinicSubscriptionsTable).set({ ...data, updatedAt: new Date() })
    .where(eq(clinicSubscriptionsTable.id, id)).returning();
  return sub ?? null;
}

// ─── Clinic limits/usage ──────────────────────────────────────────────────────

export async function getClinicUsage(clinicId: number) {
  const [professionalsCount] = await db
    .select({ total: count() })
    .from(userRolesTable)
    .where(and(eq(userRolesTable.clinicId, clinicId), eq(userRolesTable.role, "profissional")));

  const [patientsCount] = await db
    .select({ total: count() })
    .from(patientsTable)
    .where(eq(patientsTable.clinicId, clinicId));

  const [schedulesCount] = await db
    .select({ total: count() })
    .from(schedulesTable)
    .where(and(eq(schedulesTable.clinicId, clinicId), eq(schedulesTable.isActive, true)));

  const [usersCount] = await db
    .select({ total: count() })
    .from(userRolesTable)
    .where(eq(userRolesTable.clinicId, clinicId));

  return {
    professionals: professionalsCount?.total ?? 0,
    patients: patientsCount?.total ?? 0,
    schedules: schedulesCount?.total ?? 0,
    users: usersCount?.total ?? 0,
  };
}

// ─── Admin clinics ─────────────────────────────────────────────────────────────

export async function listAdminClinics() {
  return db
    .select({
      clinic: clinicsTable,
      subscription: {
        status: clinicSubscriptionsTable.status,
        planId: clinicSubscriptionsTable.planId,
        paymentStatus: clinicSubscriptionsTable.paymentStatus,
        trialEndDate: clinicSubscriptionsTable.trialEndDate,
      },
      plan: {
        name: subscriptionPlansTable.name,
        displayName: subscriptionPlansTable.displayName,
      },
    })
    .from(clinicsTable)
    .leftJoin(clinicSubscriptionsTable, eq(clinicSubscriptionsTable.clinicId, clinicsTable.id))
    .leftJoin(subscriptionPlansTable, eq(clinicSubscriptionsTable.planId, subscriptionPlansTable.id))
    .orderBy(desc(clinicsTable.createdAt));
}

// ─── Payment History ──────────────────────────────────────────────────────────

export async function listPaymentHistory() {
  return db
    .select({
      payment: clinicPaymentHistoryTable,
      clinic: { id: clinicsTable.id, name: clinicsTable.name, email: clinicsTable.email },
      recorder: { id: usersTable.id, name: usersTable.name },
      plan: { id: subscriptionPlansTable.id, displayName: subscriptionPlansTable.displayName },
    })
    .from(clinicPaymentHistoryTable)
    .leftJoin(clinicsTable, eq(clinicPaymentHistoryTable.clinicId, clinicsTable.id))
    .leftJoin(usersTable, eq(clinicPaymentHistoryTable.recordedBy, usersTable.id))
    .leftJoin(clinicSubscriptionsTable, eq(clinicPaymentHistoryTable.subscriptionId, clinicSubscriptionsTable.id))
    .leftJoin(subscriptionPlansTable, eq(clinicSubscriptionsTable.planId, subscriptionPlansTable.id))
    .orderBy(desc(clinicPaymentHistoryTable.paidAt));
}

export async function listPaymentHistoryByClinic(clinicId: number) {
  return db
    .select({
      payment: clinicPaymentHistoryTable,
      recorder: { id: usersTable.id, name: usersTable.name },
      plan: { displayName: subscriptionPlansTable.displayName },
    })
    .from(clinicPaymentHistoryTable)
    .leftJoin(usersTable, eq(clinicPaymentHistoryTable.recordedBy, usersTable.id))
    .leftJoin(clinicSubscriptionsTable, eq(clinicPaymentHistoryTable.subscriptionId, clinicSubscriptionsTable.id))
    .leftJoin(subscriptionPlansTable, eq(clinicSubscriptionsTable.planId, subscriptionPlansTable.id))
    .where(eq(clinicPaymentHistoryTable.clinicId, clinicId))
    .orderBy(desc(clinicPaymentHistoryTable.paidAt));
}

export async function createPaymentRecord(data: typeof clinicPaymentHistoryTable.$inferInsert) {
  const [payment] = await db.insert(clinicPaymentHistoryTable).values(data).returning();
  return payment;
}

export async function deletePaymentRecord(id: number) {
  await db.delete(clinicPaymentHistoryTable).where(eq(clinicPaymentHistoryTable.id, id));
}

export async function getPaymentStats() {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const [totalRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${clinicPaymentHistoryTable.amount}), 0)` })
    .from(clinicPaymentHistoryTable);

  const [monthRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${clinicPaymentHistoryTable.amount}), 0)` })
    .from(clinicPaymentHistoryTable)
    .where(and(gte(clinicPaymentHistoryTable.paidAt, firstOfMonth), lte(clinicPaymentHistoryTable.paidAt, lastOfMonth)));

  const [countRow] = await db.select({ total: count() }).from(clinicPaymentHistoryTable);

  return {
    totalAllTime: Number(totalRow?.total ?? 0),
    totalThisMonth: Number(monthRow?.total ?? 0),
    totalPayments: countRow?.total ?? 0,
    referenceMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  };
}
