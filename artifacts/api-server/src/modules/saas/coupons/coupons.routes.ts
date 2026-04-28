import { Router } from "express";
import { db } from "@workspace/db";
import { couponsTable, couponUsesTable, clinicSubscriptionsTable, subscriptionPlansTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../../../middleware/auth.js";
import { validateBody } from "../../../utils/validate.js";
import { todayBRT } from "../../../utils/dateUtils.js";
import { z } from "zod/v4";

const router = Router();

function requireSuperAdmin() {
  return (req: AuthRequest, res: any, next: any) => {
    if (!req.isSuperAdmin) {
      res.status(403).json({ error: "Forbidden", message: "Somente superadmin pode acessar este recurso" });
      return;
    }
    next();
  };
}

const createCouponSchema = z.object({
  code: z.string().min(3).max(50).toUpperCase(),
  description: z.string().default(""),
  type: z.enum(["discount", "referral"]).default("discount"),
  discountType: z.enum(["percent", "fixed"]).default("percent"),
  discountValue: z.number().min(0.01),
  maxUses: z.number().int().positive().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
  minPlanAmount: z.number().min(0).nullable().optional(),
  applicablePlanNames: z.array(z.string()).nullable().optional(),
  referrerClinicId: z.number().int().positive().nullable().optional(),
  referrerBenefitType: z.enum(["percent", "fixed"]).nullable().optional(),
  referrerBenefitValue: z.number().min(0).nullable().optional(),
  notes: z.string().nullable().optional(),
});

// ─── Validate coupon (public — called before/during registration) ────────────

router.post("/coupon-codes/validate", async (req, res) => {
  try {
    const { code, planName } = req.body as { code: string; planName?: string };
    if (!code || typeof code !== "string") {
      res.status(400).json({ error: "Código inválido" });
      return;
    }

    const [coupon] = await db
      .select()
      .from(couponsTable)
      .where(eq(couponsTable.code, code.toUpperCase().trim()))
      .limit(1);

    if (!coupon || !coupon.isActive) {
      res.status(404).json({ error: "Cupom não encontrado ou inativo" });
      return;
    }

    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
      res.status(400).json({ error: "Cupom expirado" });
      return;
    }

    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      res.status(400).json({ error: "Cupom esgotado" });
      return;
    }

    if (planName && coupon.applicablePlanNames) {
      const plans = coupon.applicablePlanNames as string[];
      if (plans.length > 0 && !plans.includes(planName)) {
        res.status(400).json({ error: `Cupom válido apenas para os planos: ${plans.join(", ")}` });
        return;
      }
    }

    let discountLabel = "";
    if (coupon.discountType === "percent") {
      discountLabel = `${coupon.discountValue}% de desconto`;
    } else {
      discountLabel = `R$ ${Number(coupon.discountValue).toFixed(2).replace(".", ",")} de desconto`;
    }

    res.json({
      valid: true,
      code: coupon.code,
      description: coupon.description,
      discountType: coupon.discountType,
      discountValue: Number(coupon.discountValue),
      discountLabel,
      type: coupon.type,
      referrerClinicId: coupon.referrerClinicId,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao validar cupom" });
  }
});

// ─── Superadmin CRUD ─────────────────────────────────────────────────────────
// IMPORTANTE: aplicamos os middlewares com path "/coupon-codes" para que outros
// roteadores SaaS montados em "/" depois deste (ex.: saasPlanRouter) não sejam
// interceptados pelo guard de superadmin quando a request não bate em nenhuma
// rota daqui (Express continua a cadeia, mas `requireSuperAdmin` já enviou 403).

router.use("/coupon-codes", authMiddleware as any);
router.use("/coupon-codes", requireSuperAdmin() as any);

router.get("/coupon-codes", async (_req, res) => {
  try {
    const coupons = await db
      .select()
      .from(couponsTable)
      .orderBy(desc(couponsTable.createdAt));

    const uses = await db
      .select({
        couponId: couponUsesTable.couponId,
        count: sql<number>`count(*)::int`,
      })
      .from(couponUsesTable)
      .groupBy(couponUsesTable.couponId);

    const useMap = new Map(uses.map((u) => [u.couponId, u.count]));

    res.json(
      coupons.map((c) => ({
        ...c,
        usedCount: useMap.get(c.id) ?? c.usedCount,
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao listar cupons" });
  }
});

router.get("/coupon-codes/stats", async (_req, res) => {
  try {
    const [totals] = await db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where is_active = true)::int`,
        totalUses: sql<number>`sum(used_count)::int`,
      })
      .from(couponsTable);

    res.json({
      total: totals?.total ?? 0,
      active: totals?.active ?? 0,
      totalUses: totals?.totalUses ?? 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar stats" });
  }
});

router.get("/coupon-codes/:id", async (req, res) => {
  try {
    const [coupon] = await db
      .select()
      .from(couponsTable)
      .where(eq(couponsTable.id, Number(req.params.id)))
      .limit(1);
    if (!coupon) {
      res.status(404).json({ error: "Cupom não encontrado" });
      return;
    }
    const uses = await db
      .select()
      .from(couponUsesTable)
      .where(eq(couponUsesTable.couponId, coupon.id))
      .orderBy(desc(couponUsesTable.usedAt));
    res.json({ coupon, uses });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar cupom" });
  }
});

router.post("/coupon-codes", async (req: AuthRequest, res) => {
  try {
    const body = validateBody(createCouponSchema, req.body, res);
    if (!body) return;

    const existing = await db
      .select({ id: couponsTable.id })
      .from(couponsTable)
      .where(eq(couponsTable.code, body.code))
      .limit(1);

    if (existing.length > 0) {
      res.status(400).json({ error: "Já existe um cupom com este código" });
      return;
    }

    const [coupon] = await db
      .insert(couponsTable)
      .values({
        code: body.code,
        description: body.description,
        type: body.type,
        discountType: body.discountType,
        discountValue: String(body.discountValue),
        maxUses: body.maxUses ?? null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        isActive: body.isActive,
        minPlanAmount: body.minPlanAmount != null ? String(body.minPlanAmount) : null,
        applicablePlanNames: body.applicablePlanNames ?? null,
        referrerClinicId: body.referrerClinicId ?? null,
        referrerBenefitType: body.referrerBenefitType ?? null,
        referrerBenefitValue: body.referrerBenefitValue != null ? String(body.referrerBenefitValue) : null,
        createdBy: req.userId ?? null,
        notes: body.notes ?? null,
      })
      .returning();

    res.status(201).json(coupon);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao criar cupom" });
  }
});

router.put("/coupon-codes/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = validateBody(createCouponSchema.partial(), req.body, res);
    if (!body) return;

    if (body.code) {
      const existing = await db
        .select({ id: couponsTable.id })
        .from(couponsTable)
        .where(eq(couponsTable.code, body.code))
        .limit(1);
      if (existing.length > 0 && existing[0].id !== id) {
        res.status(400).json({ error: "Já existe outro cupom com este código" });
        return;
      }
    }

    const [updated] = await db
      .update(couponsTable)
      .set({
        ...(body.code && { code: body.code }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.type && { type: body.type }),
        ...(body.discountType && { discountType: body.discountType }),
        ...(body.discountValue !== undefined && { discountValue: String(body.discountValue) }),
        ...(body.maxUses !== undefined && { maxUses: body.maxUses }),
        ...(body.expiresAt !== undefined && { expiresAt: body.expiresAt ? new Date(body.expiresAt) : null }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.minPlanAmount !== undefined && { minPlanAmount: body.minPlanAmount != null ? String(body.minPlanAmount) : null }),
        ...(body.applicablePlanNames !== undefined && { applicablePlanNames: body.applicablePlanNames }),
        ...(body.referrerClinicId !== undefined && { referrerClinicId: body.referrerClinicId }),
        ...(body.referrerBenefitType !== undefined && { referrerBenefitType: body.referrerBenefitType }),
        ...(body.referrerBenefitValue !== undefined && { referrerBenefitValue: body.referrerBenefitValue != null ? String(body.referrerBenefitValue) : null }),
        ...(body.notes !== undefined && { notes: body.notes }),
        updatedAt: new Date(),
      })
      .where(eq(couponsTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Cupom não encontrado" });
      return;
    }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao atualizar cupom" });
  }
});

router.delete("/coupon-codes/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const uses = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(couponUsesTable)
      .where(eq(couponUsesTable.couponId, id));

    if ((uses[0]?.count ?? 0) > 0) {
      await db
        .update(couponsTable)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(couponsTable.id, id));
      res.json({ message: "Cupom desativado (possui usos registrados)" });
      return;
    }

    await db.delete(couponsTable).where(eq(couponsTable.id, id));
    res.json({ message: "Cupom excluído" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao excluir cupom" });
  }
});

export default router;
