import { Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { clinicSubscriptionsTable, subscriptionPlansTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { AuthRequest } from "./auth.js";

const BLOCKED_STATUSES = new Set(["suspended", "cancelled"]);

export interface SubscriptionInfo {
  subId: number;
  status: string;
  paymentStatus: string;
  planId: number;
  planName: string;
  maxProfessionals: number | null;
  maxPatients: number | null;
  maxSchedules: number | null;
  maxUsers: number | null;
  trialEndDate: string | null;
  currentPeriodEnd: string | null;
}

declare module "./auth.js" {
  interface AuthRequest {
    subscriptionInfo?: SubscriptionInfo | null;
  }
}

export function requireActiveSubscription() {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.isSuperAdmin) return next();
    const clinicId = req.clinicId;
    if (!clinicId) return next();

    try {
      const [row] = await db
        .select({
          sub: clinicSubscriptionsTable,
          plan: subscriptionPlansTable,
        })
        .from(clinicSubscriptionsTable)
        .leftJoin(subscriptionPlansTable, eq(clinicSubscriptionsTable.planId, subscriptionPlansTable.id))
        .where(eq(clinicSubscriptionsTable.clinicId, clinicId))
        .limit(1);

      if (!row) return next();

      if (BLOCKED_STATUSES.has(row.sub.status)) {
        res.status(403).json({
          error: "Subscription Blocked",
          subscriptionBlocked: true,
          status: row.sub.status,
          message:
            row.sub.status === "suspended"
              ? "Sua assinatura está suspensa. Entre em contato com o suporte para regularizar."
              : "Sua assinatura foi cancelada. Entre em contato com o suporte para reativar.",
        });
        return;
      }

      (req as any).subscriptionInfo = row.plan
        ? {
            subId: row.sub.id,
            status: row.sub.status,
            paymentStatus: row.sub.paymentStatus,
            planId: row.plan.id,
            planName: row.plan.name,
            maxProfessionals: row.plan.maxProfessionals,
            maxPatients: row.plan.maxPatients,
            maxSchedules: row.plan.maxSchedules,
            maxUsers: row.plan.maxUsers,
            trialEndDate: row.sub.trialEndDate,
            currentPeriodEnd: row.sub.currentPeriodEnd,
          }
        : null;

      next();
    } catch (err) {
      console.error("[subscription] Error checking subscription:", err);
      next();
    }
  };
}

export async function getPlanLimits(clinicId: number): Promise<SubscriptionInfo | null> {
  try {
    const [row] = await db
      .select({ sub: clinicSubscriptionsTable, plan: subscriptionPlansTable })
      .from(clinicSubscriptionsTable)
      .leftJoin(subscriptionPlansTable, eq(clinicSubscriptionsTable.planId, subscriptionPlansTable.id))
      .where(eq(clinicSubscriptionsTable.clinicId, clinicId))
      .limit(1);

    if (!row?.plan) return null;

    return {
      subId: row.sub.id,
      status: row.sub.status,
      paymentStatus: row.sub.paymentStatus,
      planId: row.plan.id,
      planName: row.plan.name,
      maxProfessionals: row.plan.maxProfessionals,
      maxPatients: row.plan.maxPatients,
      maxSchedules: row.plan.maxSchedules,
      maxUsers: row.plan.maxUsers,
      trialEndDate: row.sub.trialEndDate,
      currentPeriodEnd: row.sub.currentPeriodEnd,
    };
  } catch {
    return null;
  }
}
