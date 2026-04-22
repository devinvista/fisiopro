import { db } from "@workspace/db";
import { subscriptionPlansTable, clinicSubscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { todayBRT, addDays } from "../../../utils/dateUtils.js";
import { DEFAULT_PLANS } from "./saas-plans.constants.js";

// ─── Seed default plans ────────────────────────────────────────────────────────

export async function seedDefaultPlans() {
  const results: { name: string; action: string }[] = [];

  for (const plan of DEFAULT_PLANS) {
    const existing = await db.select().from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.name, plan.name)).limit(1);

    if (existing.length > 0) {
      results.push({ name: plan.name, action: "skipped" });
    } else {
      await db.insert(subscriptionPlansTable).values(plan as any);
      results.push({ name: plan.name, action: "created" });
    }
  }

  return results;
}

// ─── Calculate trial end date ──────────────────────────────────────────────────

export function calculateTrialEnd(trialDays: number, baseDate?: string): string {
  const base = baseDate ? new Date(baseDate) : new Date(todayBRT());
  const end = addDays(base.toISOString().split("T")[0], trialDays);
  return typeof end === "string" ? end : (end as Date).toISOString().split("T")[0];
}

// ─── Apply payment to subscription ────────────────────────────────────────────

export async function applyPaymentToSubscription(
  subscriptionId: number,
  paidAt: Date,
) {
  const currentSub = await getSubscriptionById(subscriptionId);
  if (!currentSub) return;

  const subUpdate: Partial<typeof clinicSubscriptionsTable.$inferInsert> = {
    paymentStatus: "paid",
    paidAt,
    status: "active",
    updatedAt: new Date(),
  };

  const periodBase = currentSub.currentPeriodEnd ?? currentSub.trialEndDate ?? todayBRT();
  const nextPeriodEnd = addDays(periodBase, 30);
  subUpdate.currentPeriodStart = periodBase;
  subUpdate.currentPeriodEnd = nextPeriodEnd;

  await db.update(clinicSubscriptionsTable)
    .set(subUpdate)
    .where(eq(clinicSubscriptionsTable.id, subscriptionId));
}

async function getSubscriptionById(id: number) {
  const [sub] = await db.select().from(clinicSubscriptionsTable).where(eq(clinicSubscriptionsTable.id, id)).limit(1);
  return sub ?? null;
}
