import { Response, NextFunction } from "express";
import { db } from "@workspace/db";
import {
  clinicSubscriptionsTable,
  subscriptionPlansTable,
  patientsTable,
  schedulesTable,
  userRolesTable,
} from "@workspace/db";
import { and, asc, count, eq, gt, isNull, or } from "drizzle-orm";
import { resolvePlanFeatures, type Feature } from "@workspace/shared-constants";
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
  /**
   * Features efetivas resolvidas via `resolvePlanFeatures`:
   * usa a coluna jsonb se ela tiver chaves canônicas,
   * senão cai no PLAN_FEATURES hardcoded do tier.
   */
  features: Feature[];
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
            features: resolvePlanFeatures(row.plan.name, row.plan.features),
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
      features: resolvePlanFeatures(row.plan.name, row.plan.features),
    };
  } catch {
    return null;
  }
}

// ─── enforceLimit ─────────────────────────────────────────────────────────────
//
// Middleware factory que bloqueia POSTs quando o consumo do recurso atingiu o
// limite quantitativo (`maxPatients`, `maxUsers`, `maxProfessionals`,
// `maxSchedules`) do plano vigente. Retorna `402 Payment Required` com payload
// estruturado para o frontend abrir o diálogo de upgrade contextual.

export type LimitedResource = "patients" | "users" | "professionals" | "schedules";

const LIMIT_FIELD: Record<LimitedResource, "maxPatients" | "maxUsers" | "maxProfessionals" | "maxSchedules"> = {
  patients: "maxPatients",
  users: "maxUsers",
  professionals: "maxProfessionals",
  schedules: "maxSchedules",
};

const RESOURCE_LABEL: Record<LimitedResource, { singular: string; plural: string }> = {
  patients: { singular: "paciente", plural: "pacientes" },
  users: { singular: "usuário", plural: "usuários" },
  professionals: { singular: "profissional", plural: "profissionais" },
  schedules: { singular: "agenda", plural: "agendas" },
};

async function countResource(resource: LimitedResource, clinicId: number): Promise<number> {
  if (resource === "patients") {
    const [{ total }] = await db
      .select({ total: count() })
      .from(patientsTable)
      .where(and(eq(patientsTable.clinicId, clinicId), isNull(patientsTable.deletedAt)));
    return Number(total);
  }
  if (resource === "schedules") {
    const [{ total }] = await db
      .select({ total: count() })
      .from(schedulesTable)
      .where(and(eq(schedulesTable.clinicId, clinicId), eq(schedulesTable.isActive, true)));
    return Number(total);
  }
  if (resource === "professionals") {
    const [{ total }] = await db
      .select({ total: count() })
      .from(userRolesTable)
      .where(and(eq(userRolesTable.clinicId, clinicId), eq(userRolesTable.role, "profissional")));
    return Number(total);
  }
  // users
  const [{ total }] = await db
    .select({ total: count() })
    .from(userRolesTable)
    .where(eq(userRolesTable.clinicId, clinicId));
  return Number(total);
}

/**
 * Encontra o plano mínimo necessário para acomodar `requiredCount` no recurso
 * informado. Retorna o plano ativo mais barato cujo limite seja `null`
 * (ilimitado) ou estritamente maior que o consumo atual.
 */
async function findRequiredPlan(resource: LimitedResource, requiredCount: number, currentPriceCents: number) {
  const field = LIMIT_FIELD[resource];
  const col = subscriptionPlansTable[field];
  const candidates = await db
    .select()
    .from(subscriptionPlansTable)
    .where(
      and(
        eq(subscriptionPlansTable.isActive, true),
        or(isNull(col), gt(col, requiredCount)),
      ),
    )
    .orderBy(asc(subscriptionPlansTable.price), asc(subscriptionPlansTable.sortOrder));

  // Filtra fora planos cujo preço seja menor ou igual ao atual (downgrade não resolve).
  for (const c of candidates) {
    const cents = Math.round(Number(c.price) * 100);
    if (cents > currentPriceCents) return c;
  }
  return null;
}

export interface EnforceLimitOptions {
  /** Só conta/bloqueia quando este predicado for verdadeiro (ex.: criar usuário com role=profissional). */
  when?: (req: AuthRequest) => boolean;
}

export function enforceLimit(resource: LimitedResource, options: EnforceLimitOptions = {}) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (req.isSuperAdmin) return next();
    const clinicId = req.clinicId;
    if (!clinicId) return next();
    if (options.when && !options.when(req)) return next();

    try {
      const sub = req.subscriptionInfo ?? (await getPlanLimits(clinicId));
      if (!sub) return next();

      const limit = sub[LIMIT_FIELD[resource]];
      if (limit == null) return next(); // null = ilimitado

      const current = await countResource(resource, clinicId);
      if (current < limit) return next();

      // Limite atingido — calcula plano necessário (próximo tier capaz de
      // acomodar o próximo registro).
      const [currentPlanRow] = await db
        .select({ price: subscriptionPlansTable.price, displayName: subscriptionPlansTable.displayName })
        .from(subscriptionPlansTable)
        .where(eq(subscriptionPlansTable.id, sub.planId))
        .limit(1);

      const currentPriceCents = currentPlanRow ? Math.round(Number(currentPlanRow.price) * 100) : 0;
      const required = await findRequiredPlan(resource, current, currentPriceCents);

      const label = RESOURCE_LABEL[resource];
      const noun = limit === 1 ? label.singular : label.plural;

      res.status(402).json({
        error: "Plan Limit Reached",
        limitReached: true,
        resource,
        limit,
        current,
        planName: sub.planName,
        planDisplayName: currentPlanRow?.displayName ?? sub.planName,
        requiredPlan: required
          ? {
              name: required.name,
              displayName: required.displayName,
              price: required.price,
              limit: required[LIMIT_FIELD[resource]],
            }
          : null,
        message: `Você atingiu o limite de ${limit} ${noun} do plano ${currentPlanRow?.displayName ?? sub.planName}. ${
          required
            ? `Faça upgrade para o plano ${required.displayName} para continuar.`
            : "Entre em contato com o suporte para liberar mais capacidade."
        }`,
      });
    } catch (err) {
      console.error(`[enforceLimit:${resource}] Error:`, err);
      // Em caso de falha na verificação, não bloqueia o usuário.
      next();
    }
  };
}
