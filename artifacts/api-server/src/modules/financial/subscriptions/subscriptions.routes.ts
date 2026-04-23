import { Router } from "express";
import { db } from "@workspace/db";
import {
  patientSubscriptionsTable,
  patientsTable,
  proceduresTable,
  sessionCreditsTable,
  billingRunLogsTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { PATIENT_SUBSCRIPTION_STATUSES } from "@workspace/shared-constants";
import { authMiddleware, AuthRequest } from "../../../middleware/auth.js";
import { requirePermission } from "../../../middleware/rbac.js";
import { requireFeature } from "../../../middleware/plan-features.js";
import { validateBody } from "../../../utils/validate.js";
import { runBilling } from "../billing/billing.service.js";

const createSubscriptionSchema = z.object({
  patientId: z.number().int().positive(),
  procedureId: z.number().int().positive(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD esperado"),
  billingDay: z.number().int().min(1).max(31).optional(),
  monthlyAmount: z.number().positive(),
  notes: z.string().optional().nullable(),
});

const updateSubscriptionSchema = z.object({
  status: z.enum([...PATIENT_SUBSCRIPTION_STATUSES, "pausada"] as const).optional(),
  billingDay: z.number().int().min(1).max(31).optional(),
  monthlyAmount: z.number().positive().optional(),
  notes: z.string().optional().nullable(),
});

const router = Router();
router.use(authMiddleware);
router.use(requireFeature("module.patient_subscriptions"));

function calcInitialNextBillingDate(startDate: string, billingDay: number): string {
  const start = new Date(startDate + "T12:00:00Z");
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth() + 1;
  const startDay = start.getUTCDate();
  const targetMonth = billingDay >= startDay ? month : month + 1;
  const targetYear = targetMonth > 12 ? year + 1 : year;
  const normalizedMonth = targetMonth > 12 ? 1 : targetMonth;
  const lastDay = new Date(targetYear, normalizedMonth, 0).getDate();
  const day = Math.min(billingDay, lastDay);
  return `${targetYear}-${String(normalizedMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

router.get("/", requirePermission("financial.read"), async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    const { patientId } = req.query;

    const conditions: any[] = [];
    if (!authReq.isSuperAdmin && authReq.clinicId) {
      conditions.push(eq(patientSubscriptionsTable.clinicId, authReq.clinicId));
    }
    if (patientId) {
      conditions.push(eq(patientSubscriptionsTable.patientId, parseInt(patientId as string)));
    }

    const results = await db
      .select({
        subscription: patientSubscriptionsTable,
        patient: patientsTable,
        procedure: proceduresTable,
      })
      .from(patientSubscriptionsTable)
      .leftJoin(patientsTable, eq(patientSubscriptionsTable.patientId, patientsTable.id))
      .leftJoin(proceduresTable, eq(patientSubscriptionsTable.procedureId, proceduresTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(patientSubscriptionsTable.createdAt);
    const subscriptions = results.map(({ subscription, patient, procedure }) => ({
      ...subscription,
      patient,
      procedure,
    }));

    res.json(subscriptions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/", requirePermission("financial.write"), async (req, res) => {
  const parsed = validateBody(createSubscriptionSchema, req, res);
  if (!parsed) return;

  try {
    const authReq = req as AuthRequest;
    const { patientId, procedureId, startDate, billingDay, monthlyAmount, notes } = parsed;

    const rawDay = billingDay ?? new Date(startDate + "T12:00:00Z").getUTCDate();
    const day = Math.max(1, Math.min(31, rawDay));

    const [subscription] = await db
      .insert(patientSubscriptionsTable)
      .values({
        patientId,
        procedureId,
        startDate,
        billingDay: day,
        monthlyAmount: String(monthlyAmount),
        status: "ativa",
        notes: notes ?? null,
        clinicId: authReq.clinicId ?? null,
        nextBillingDate: calcInitialNextBillingDate(startDate, day),
      })
      .returning();

    const result = await db
      .select({
        subscription: patientSubscriptionsTable,
        patient: patientsTable,
        procedure: proceduresTable,
      })
      .from(patientSubscriptionsTable)
      .leftJoin(patientsTable, eq(patientSubscriptionsTable.patientId, patientsTable.id))
      .leftJoin(proceduresTable, eq(patientSubscriptionsTable.procedureId, proceduresTable.id))
      .where(eq(patientSubscriptionsTable.id, subscription.id))
      .limit(1);

    const r = result[0];
    res.status(201).json(r ? { ...r.subscription, patient: r.patient, procedure: r.procedure } : subscription);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/:id", requirePermission("financial.write"), async (req, res) => {
  const parsed = validateBody(updateSubscriptionSchema, req, res);
  if (!parsed) return;

  try {
    const authReq = req as AuthRequest;
    const id = parseInt(req.params.id as string);
    const { status, billingDay, monthlyAmount, notes } = parsed;

    const isCancelling = status === "cancelada" || status === "inativa";
    const cancelledAt = isCancelling ? new Date() : undefined;

    const whereClause = (!authReq.isSuperAdmin && authReq.clinicId)
      ? and(eq(patientSubscriptionsTable.id, id), eq(patientSubscriptionsTable.clinicId, authReq.clinicId))
      : eq(patientSubscriptionsTable.id, id);

    const [subscription] = await db
      .update(patientSubscriptionsTable)
      .set({
        status: status ?? undefined,
        billingDay: billingDay ?? undefined,
        monthlyAmount: monthlyAmount !== undefined ? String(monthlyAmount) : undefined,
        notes: notes !== undefined ? notes : undefined,
        cancelledAt,
      })
      .where(whereClause)
      .returning();

    if (!subscription) {
      res.status(404).json({ error: "Not Found" });
      return;
    }

    res.json(subscription);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/:id", requirePermission("financial.write"), async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    const id = parseInt(req.params.id as string);
    const whereClause = (!authReq.isSuperAdmin && authReq.clinicId)
      ? and(eq(patientSubscriptionsTable.id, id), eq(patientSubscriptionsTable.clinicId, authReq.clinicId))
      : eq(patientSubscriptionsTable.id, id);
    await db
      .update(patientSubscriptionsTable)
      .set({ status: "cancelada", cancelledAt: new Date() })
      .where(whereClause);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/:id/credits", requirePermission("financial.read"), async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    const subscriptionId = parseInt(req.params.id as string);

    const clinicCondition = (!authReq.isSuperAdmin && authReq.clinicId)
      ? and(
          eq(patientSubscriptionsTable.id, subscriptionId),
          eq(patientSubscriptionsTable.clinicId, authReq.clinicId),
        )
      : eq(patientSubscriptionsTable.id, subscriptionId);

    const [subscription] = await db
      .select()
      .from(patientSubscriptionsTable)
      .where(clinicCondition);

    if (!subscription) {
      res.status(404).json({ error: "Not Found" });
      return;
    }

    const credits = await db
      .select()
      .from(sessionCreditsTable)
      .where(
        and(
          eq(sessionCreditsTable.patientId, subscription.patientId),
          eq(sessionCreditsTable.procedureId, subscription.procedureId)
        )
      );

    const available = credits.reduce((s, c) => s + (c.quantity - c.usedQuantity), 0);
    res.json({ credits, availableCount: available });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * GET /api/subscriptions/billing-status
 * Retorna:
 *  - lastRun: última execução registrada (scheduler ou manual)
 *  - upcoming: assinaturas ativas cujo próximo vencimento cai nos próximos 7 dias
 */
router.get("/billing-status", requirePermission("financial.read"), async (req: AuthRequest, res) => {
  try {
    const clinicConditions = !req.isSuperAdmin && req.clinicId
      ? [eq(billingRunLogsTable.clinicId, req.clinicId)]
      : [];

    // Último log de execução
    const [lastRun] = await db
      .select()
      .from(billingRunLogsTable)
      .where(clinicConditions.length > 0 ? and(...clinicConditions) : undefined)
      .orderBy(desc(billingRunLogsTable.ranAt))
      .limit(1);

    // Próximas cobranças nos próximos 7 dias usando nextBillingDate
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + 7);
    const futureDateStr = futureDate.toISOString().slice(0, 10);

    const subConditions: any[] = [eq(patientSubscriptionsTable.status, "ativa")];
    if (!req.isSuperAdmin && req.clinicId) {
      subConditions.push(eq(patientSubscriptionsTable.clinicId, req.clinicId));
    }

    const allActive = await db
      .select({
        id: patientSubscriptionsTable.id,
        billingDay: patientSubscriptionsTable.billingDay,
        monthlyAmount: patientSubscriptionsTable.monthlyAmount,
        nextBillingDate: patientSubscriptionsTable.nextBillingDate,
        patientName: patientsTable.name,
        procedureName: proceduresTable.name,
      })
      .from(patientSubscriptionsTable)
      .leftJoin(patientsTable, eq(patientSubscriptionsTable.patientId, patientsTable.id))
      .leftJoin(proceduresTable, eq(patientSubscriptionsTable.procedureId, proceduresTable.id))
      .where(and(...subConditions));

    // Filtra as que têm nextBillingDate nos próximos 7 dias
    const upcoming = allActive
      .filter(s => {
        if (!s.nextBillingDate) return false;
        return s.nextBillingDate >= todayStr && s.nextBillingDate <= futureDateStr;
      })
      .map(s => ({
        id: s.id,
        patientName: s.patientName ?? `Paciente #${s.id}`,
        procedureName: s.procedureName ?? `Procedimento`,
        amount: Number(s.monthlyAmount),
        nextBillingDate: s.nextBillingDate,
      }))
      .sort((a, b) => (a.nextBillingDate ?? "").localeCompare(b.nextBillingDate ?? ""));

    const upcomingTotal = upcoming.reduce((sum, s) => sum + s.amount, 0);

    res.json({
      lastRun: lastRun ?? null,
      upcoming,
      upcomingTotal,
      upcomingCount: upcoming.length,
    });
  } catch (err) {
    console.error("[billing-status]", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/run-billing", requirePermission("financial.write"), async (req: AuthRequest, res) => {
  try {
    const dryRun = req.query.dryRun === "true" || req.body?.dryRun === true;
    const toleranceDays = req.body?.toleranceDays !== undefined
      ? Math.max(0, Math.min(7, parseInt(req.body.toleranceDays)))
      : 3;

    // Clínicas isoladas: superadmin pode omitir clinicId para rodar em todas
    const clinicId = req.isSuperAdmin ? (req.body?.clinicId ?? undefined) : (req.clinicId ?? undefined);

    const result = await runBilling({ clinicId, toleranceDays, dryRun, triggeredBy: "manual" });

    res.json(result);
  } catch (err) {
    console.error("[run-billing]", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
