import { Router } from "express";
import { db } from "@workspace/db";
import { subscriptionPlansTable, clinicSubscriptionsTable, clinicsTable, patientsTable, usersTable, userRolesTable, schedulesTable, clinicPaymentHistoryTable } from "@workspace/db";
import { eq, desc, asc, count, and, sql, gte, lte } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../../../middleware/auth.js";
import { requireSuperAdmin } from "../../../middleware/rbac.js";
import { validateBody } from "../../../utils/validate.js";
import { todayBRT, addDays } from "../../../utils/dateUtils.js";
import { runSubscriptionCheck } from "../subscriptions/subscription.service.js";
import { planSchema, subscriptionSchema, updateSubscriptionSchema, paymentSchema } from "./saas-plans.schemas.js";
import { DEFAULT_PLANS } from "./saas-plans.constants.js";
import {
  listPlans, listActivePlans, getPlanById, createPlan, updatePlan, deletePlan, getPlanStats,
  listSubscriptions, getClinicSubscription, createSubscription, updateSubscription,
  listAdminClinics, listPaymentHistory, listPaymentHistoryByClinic, createPaymentRecord,
  deletePaymentRecord, getPaymentStats, getClinicUsage,
} from "./saas-plans.repository.js";
import { seedDefaultPlans, applyPaymentToSubscription } from "./saas-plans.service.js";

const router = Router();
router.use(authMiddleware);

// ─── Plans CRUD (superadmin only) ────────────────────────────────────────────

router.get("/plans", requireSuperAdmin(), async (_req, res) => {
  try {
    const plans = await db
      .select()
      .from(subscriptionPlansTable)
      .orderBy(asc(subscriptionPlansTable.sortOrder));
    res.json(plans);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Seed default plans if they don't exist
router.post("/plans/seed-defaults", requireSuperAdmin(), async (_req, res) => {
  try {
    const results: { name: string; action: string }[] = [];

    for (const plan of DEFAULT_PLANS) {
      const existing = await db
        .select()
        .from(subscriptionPlansTable)
        .where(eq(subscriptionPlansTable.name, plan.name))
        .limit(1);

      if (existing.length > 0) {
        results.push({ name: plan.name, action: "skipped" });
      } else {
        await db.insert(subscriptionPlansTable).values(plan);
        results.push({ name: plan.name, action: "created" });
      }
    }

    res.json({ ok: true, results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Per-plan stats for dashboard
router.get("/plans/stats", requireSuperAdmin(), async (_req, res) => {
  try {
    const plans = await db
      .select()
      .from(subscriptionPlansTable)
      .orderBy(asc(subscriptionPlansTable.sortOrder));

    const subs = await db
      .select({
        sub: clinicSubscriptionsTable,
      })
      .from(clinicSubscriptionsTable);

    const stats = plans.map((plan) => {
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

    res.json(stats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/plans/public", async (_req, res) => {
  try {
    const plans = await db
      .select()
      .from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.isActive, true))
      .orderBy(asc(subscriptionPlansTable.sortOrder));
    res.json(plans);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/plans", requireSuperAdmin(), async (req, res) => {
  try {
    const body = validateBody(planSchema, req.body, res);
    if (!body) return;

    const [plan] = await db
      .insert(subscriptionPlansTable)
      .values({
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
      })
      .returning();

    res.status(201).json(plan);
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(400).json({ error: "Bad Request", message: "Já existe um plano com esse identificador." });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/plans/:id", requireSuperAdmin(), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = validateBody(planSchema.partial(), req.body, res);
    if (!body) return;

    const updateData: Partial<typeof subscriptionPlansTable.$inferInsert> = {
      updatedAt: new Date(),
    };
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

    const [plan] = await db
      .update(subscriptionPlansTable)
      .set(updateData)
      .where(eq(subscriptionPlansTable.id, id))
      .returning();

    if (!plan) {
      res.status(404).json({ error: "Not Found", message: "Plano não encontrado" });
      return;
    }
    res.json(plan);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/plans/:id", requireSuperAdmin(), async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(subscriptionPlansTable).where(eq(subscriptionPlansTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Clinic Subscriptions (superadmin only) ───────────────────────────────────

router.get("/clinic-subscriptions", requireSuperAdmin(), async (_req, res) => {
  try {
    const rows = await db
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

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/clinic-subscriptions", requireSuperAdmin(), async (req, res) => {
  try {
    const body = validateBody(subscriptionSchema, req.body, res);
    if (!body) return;

    const plan = await db
      .select()
      .from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.id, body.planId))
      .limit(1);

    if (!plan[0]) {
      res.status(404).json({ error: "Not Found", message: "Plano não encontrado" });
      return;
    }

    const today = todayBRT();
    const trialEnd = new Date(today);
    trialEnd.setDate(trialEnd.getDate() + (plan[0].trialDays ?? 30));

    const [sub] = await db
      .insert(clinicSubscriptionsTable)
      .values({
        clinicId: body.clinicId,
        planId: body.planId,
        status: body.status ?? "trial",
        trialStartDate: body.trialStartDate ?? today,
        trialEndDate: body.trialEndDate ?? trialEnd.toISOString().split("T")[0],
        currentPeriodStart: body.currentPeriodStart ?? null,
        currentPeriodEnd: body.currentPeriodEnd ?? null,
        amount: body.amount != null ? String(body.amount) : String(plan[0].price),
        paymentStatus: body.paymentStatus ?? "pending",
        notes: body.notes ?? null,
      })
      .returning();

    res.status(201).json(sub);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/clinic-subscriptions/:id", requireSuperAdmin(), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = validateBody(updateSubscriptionSchema, req.body, res);
    if (!body) return;

    const updateData: Partial<typeof clinicSubscriptionsTable.$inferInsert> = {
      updatedAt: new Date(),
    };

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

    const [sub] = await db
      .update(clinicSubscriptionsTable)
      .set(updateData)
      .where(eq(clinicSubscriptionsTable.id, id))
      .returning();

    if (!sub) {
      res.status(404).json({ error: "Not Found", message: "Assinatura não encontrada" });
      return;
    }
    res.json(sub);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Current clinic subscription (any authenticated user) ─────────────────────

router.get("/clinic-subscriptions/mine", async (req: AuthRequest, res) => {
  try {
    const clinicId = req.clinicId;
    if (!clinicId) {
      res.json(null);
      return;
    }

    const [row] = await db
      .select({
        sub: clinicSubscriptionsTable,
        plan: subscriptionPlansTable,
      })
      .from(clinicSubscriptionsTable)
      .leftJoin(subscriptionPlansTable, eq(clinicSubscriptionsTable.planId, subscriptionPlansTable.id))
      .where(eq(clinicSubscriptionsTable.clinicId, clinicId))
      .limit(1);

    res.json(row ?? null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Current clinic subscription limits & usage ─────────────────────────────

router.get("/clinic-subscriptions/mine/limits", async (req: AuthRequest, res) => {
  try {
    const clinicId = req.clinicId;
    if (!clinicId) {
      res.json(null);
      return;
    }

    const [row] = await db
      .select({ sub: clinicSubscriptionsTable, plan: subscriptionPlansTable })
      .from(clinicSubscriptionsTable)
      .leftJoin(subscriptionPlansTable, eq(clinicSubscriptionsTable.planId, subscriptionPlansTable.id))
      .where(eq(clinicSubscriptionsTable.clinicId, clinicId))
      .limit(1);

    if (!row) {
      res.json({ plan: null, limits: null, usage: null });
      return;
    }

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

    res.json({
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
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Manual subscription check (superadmin) ──────────────────────────────────

router.post("/clinic-subscriptions/run-check", requireSuperAdmin(), async (_req, res) => {
  try {
    const result = await runSubscriptionCheck();
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── All clinics (superadmin) — para aba Clínicas ────────────────────────────

router.get("/admin/clinics", requireSuperAdmin(), async (_req, res) => {
  try {
    const clinics = await db
      .select({
        clinic: clinicsTable,
        sub: clinicSubscriptionsTable,
        plan: subscriptionPlansTable,
      })
      .from(clinicsTable)
      .leftJoin(clinicSubscriptionsTable, eq(clinicSubscriptionsTable.clinicId, clinicsTable.id))
      .leftJoin(subscriptionPlansTable, eq(clinicSubscriptionsTable.planId, subscriptionPlansTable.id))
      .orderBy(asc(clinicsTable.name));

    res.json(clinics);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Payment History (superadmin) ─────────────────────────────────────────────

router.get("/payment-history", requireSuperAdmin(), async (_req, res) => {
  try {
    const rows = await db
      .select({
        payment: clinicPaymentHistoryTable,
        clinic: {
          id: clinicsTable.id,
          name: clinicsTable.name,
          email: clinicsTable.email,
        },
        recorder: {
          id: usersTable.id,
          name: usersTable.name,
        },
        plan: {
          id: subscriptionPlansTable.id,
          displayName: subscriptionPlansTable.displayName,
        },
      })
      .from(clinicPaymentHistoryTable)
      .leftJoin(clinicsTable, eq(clinicPaymentHistoryTable.clinicId, clinicsTable.id))
      .leftJoin(usersTable, eq(clinicPaymentHistoryTable.recordedBy, usersTable.id))
      .leftJoin(
        clinicSubscriptionsTable,
        eq(clinicPaymentHistoryTable.subscriptionId, clinicSubscriptionsTable.id)
      )
      .leftJoin(
        subscriptionPlansTable,
        eq(clinicSubscriptionsTable.planId, subscriptionPlansTable.id)
      )
      .orderBy(desc(clinicPaymentHistoryTable.paidAt));

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/payment-history/clinic/:clinicId", requireSuperAdmin(), async (req, res) => {
  try {
    const clinicId = Number(req.params.clinicId);
    const rows = await db
      .select({
        payment: clinicPaymentHistoryTable,
        recorder: {
          id: usersTable.id,
          name: usersTable.name,
        },
        plan: {
          displayName: subscriptionPlansTable.displayName,
        },
      })
      .from(clinicPaymentHistoryTable)
      .leftJoin(usersTable, eq(clinicPaymentHistoryTable.recordedBy, usersTable.id))
      .leftJoin(
        clinicSubscriptionsTable,
        eq(clinicPaymentHistoryTable.subscriptionId, clinicSubscriptionsTable.id)
      )
      .leftJoin(
        subscriptionPlansTable,
        eq(clinicSubscriptionsTable.planId, subscriptionPlansTable.id)
      )
      .where(eq(clinicPaymentHistoryTable.clinicId, clinicId))
      .orderBy(desc(clinicPaymentHistoryTable.paidAt));

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/payment-history", requireSuperAdmin(), async (req: AuthRequest, res) => {
  try {
    const body = validateBody(paymentSchema, req.body, res);
    if (!body) return;

    const paidAt = body.paidAt ? new Date(body.paidAt) : new Date();

    const [payment] = await db
      .insert(clinicPaymentHistoryTable)
      .values({
        clinicId: body.clinicId,
        subscriptionId: body.subscriptionId ?? null,
        amount: String(body.amount),
        method: body.method,
        referenceMonth: body.referenceMonth ?? null,
        paidAt,
        notes: body.notes ?? null,
        recordedBy: req.userId ?? null,
      })
      .returning();

    if (body.updateSubscriptionStatus !== false && body.subscriptionId) {
      // Buscar assinatura atual para calcular próximo período
      const [currentSub] = await db
        .select()
        .from(clinicSubscriptionsTable)
        .where(eq(clinicSubscriptionsTable.id, body.subscriptionId))
        .limit(1);

      const subUpdate: Partial<typeof clinicSubscriptionsTable.$inferInsert> = {
        paymentStatus: "paid",
        paidAt,
        status: "active",
        updatedAt: new Date(),
      };

      if (currentSub) {
        // Referência para início do próximo período:
        // usa currentPeriodEnd existente se disponível; senão usa trialEndDate; senão hoje.
        const periodBase =
          currentSub.currentPeriodEnd ??
          currentSub.trialEndDate ??
          todayBRT();

        // Avançar o período 30 dias a partir da base calculada
        const nextPeriodEnd = addDays(periodBase, 30);

        subUpdate.currentPeriodStart = periodBase;
        subUpdate.currentPeriodEnd = nextPeriodEnd;
      }

      await db
        .update(clinicSubscriptionsTable)
        .set(subUpdate)
        .where(eq(clinicSubscriptionsTable.id, body.subscriptionId));
    }

    res.status(201).json(payment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/payment-history/:id", requireSuperAdmin(), async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(clinicPaymentHistoryTable).where(eq(clinicPaymentHistoryTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Payment history summary stats ────────────────────────────────────────────

router.get("/payment-history/stats", requireSuperAdmin(), async (_req, res) => {
  try {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const [totalRow] = await db
      .select({ total: sql<string>`COALESCE(SUM(${clinicPaymentHistoryTable.amount}), 0)` })
      .from(clinicPaymentHistoryTable);

    const [monthRow] = await db
      .select({ total: sql<string>`COALESCE(SUM(${clinicPaymentHistoryTable.amount}), 0)` })
      .from(clinicPaymentHistoryTable)
      .where(
        and(
          gte(clinicPaymentHistoryTable.paidAt, firstOfMonth),
          lte(clinicPaymentHistoryTable.paidAt, lastOfMonth)
        )
      );

    const [countRow] = await db
      .select({ total: count() })
      .from(clinicPaymentHistoryTable);

    res.json({
      totalAllTime: Number(totalRow?.total ?? 0),
      totalThisMonth: Number(monthRow?.total ?? 0),
      totalPayments: countRow?.total ?? 0,
      referenceMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
