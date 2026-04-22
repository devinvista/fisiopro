import { Router } from "express";
import { db } from "@workspace/db";
import { packagesTable, proceduresTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../../../middleware/auth.js";
import { requirePermission } from "../../../middleware/rbac.js";
import { validateBody } from "../../../utils/validate.js";
import { z } from "zod/v4";

const packageTypeEnum = z.enum(["sessoes", "mensal", "faturaConsolidada"]);

const createPackageSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(200),
  description: z.string().max(1000).optional().nullable(),
  procedureId: z.union([z.number().int().positive(), z.string().transform(Number)]).refine(v => Number.isInteger(v) && v > 0, "procedureId deve ser um inteiro positivo"),
  packageType: packageTypeEnum.default("sessoes"),
  totalSessions: z.union([z.number().int().positive(), z.string().transform(Number)]).optional().nullable(),
  sessionsPerWeek: z.union([z.number().int().positive(), z.string().transform(Number)]).optional().default(1),
  validityDays: z.union([z.number().int().positive(), z.string().transform(Number)]).optional().nullable(),
  price: z.union([z.number(), z.string().transform(Number)]).refine(v => !isNaN(v) && v >= 0, "price deve ser um número não-negativo"),
  monthlyPrice: z.union([z.number(), z.string().transform(Number)]).optional().nullable(),
  billingDay: z.union([z.number().int().min(1).max(31), z.string().transform(Number)]).optional().nullable(),
  absenceCreditLimit: z.union([z.number().int().min(0), z.string().transform(Number)]).optional().default(0),
}).refine(d => d.packageType !== "sessoes" || (d.totalSessions != null && Number(d.totalSessions) > 0), {
  message: "totalSessions é obrigatório para pacotes por sessão",
}).refine(d => !["mensal", "faturaConsolidada"].includes(d.packageType) || (d.monthlyPrice != null && d.billingDay != null), {
  message: "monthlyPrice e billingDay são obrigatórios para mensalidade ou fatura consolidada",
});

const updatePackageSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  procedureId: z.union([z.number().int().positive(), z.string().transform(Number)]).optional(),
  packageType: packageTypeEnum.optional(),
  totalSessions: z.union([z.number().int().positive(), z.string().transform(Number)]).optional().nullable(),
  sessionsPerWeek: z.union([z.number().int().positive(), z.string().transform(Number)]).optional(),
  validityDays: z.union([z.number().int().positive(), z.string().transform(Number)]).optional().nullable(),
  price: z.union([z.number(), z.string().transform(Number)]).refine(v => !isNaN(v) && v >= 0).optional(),
  monthlyPrice: z.union([z.number(), z.string().transform(Number)]).optional().nullable(),
  billingDay: z.union([z.number().int().min(1).max(31), z.string().transform(Number)]).optional().nullable(),
  absenceCreditLimit: z.union([z.number().int().min(0), z.string().transform(Number)]).optional(),
  isActive: z.boolean().optional(),
});

const router = Router();
router.use(authMiddleware);

router.get("/", requirePermission("procedures.manage"), async (req: AuthRequest, res) => {
  try {
    const includeInactive = req.query.includeInactive === "true";
    const packageType = req.query.packageType as string | undefined;

    const conditions: any[] = [];
    if (!req.isSuperAdmin && req.clinicId) {
      conditions.push(eq(packagesTable.clinicId, req.clinicId));
    }
    if (!includeInactive) {
      conditions.push(eq(packagesTable.isActive, true));
    }
    if (packageType) {
      conditions.push(eq(packagesTable.packageType, packageType));
    }

    let query = db
      .select({
        id: packagesTable.id,
        name: packagesTable.name,
        description: packagesTable.description,
        procedureId: packagesTable.procedureId,
        procedureName: proceduresTable.name,
        procedureCategory: proceduresTable.category,
        procedureModalidade: proceduresTable.modalidade,
        procedureDurationMinutes: proceduresTable.durationMinutes,
        procedurePricePerSession: proceduresTable.price,
        packageType: packagesTable.packageType,
        totalSessions: packagesTable.totalSessions,
        sessionsPerWeek: packagesTable.sessionsPerWeek,
        validityDays: packagesTable.validityDays,
        price: packagesTable.price,
        monthlyPrice: packagesTable.monthlyPrice,
        billingDay: packagesTable.billingDay,
        absenceCreditLimit: packagesTable.absenceCreditLimit,
        isActive: packagesTable.isActive,
        clinicId: packagesTable.clinicId,
        createdAt: packagesTable.createdAt,
      })
      .from(packagesTable)
      .innerJoin(proceduresTable, eq(packagesTable.procedureId, proceduresTable.id)) as any;

    if (conditions.length === 1) {
      query = query.where(conditions[0]);
    } else if (conditions.length > 1) {
      query = query.where(and(...conditions));
    }

    const packages = await query.orderBy(packagesTable.name);
    res.json(packages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/:id", requirePermission("procedures.manage"), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const condition = req.isSuperAdmin || !req.clinicId
      ? eq(packagesTable.id, id)
      : and(eq(packagesTable.id, id), eq(packagesTable.clinicId, req.clinicId!));

    const [pkg] = await db
      .select()
      .from(packagesTable)
      .where(condition)
      .limit(1);

    if (!pkg) {
      res.status(404).json({ error: "Not Found" });
      return;
    }
    res.json(pkg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/", requirePermission("procedures.manage"), async (req: AuthRequest, res) => {
  try {
    const body = validateBody(createPackageSchema, req.body, res);
    if (!body) return;
    const { name, description, procedureId, packageType, totalSessions, sessionsPerWeek, validityDays, price, monthlyPrice, billingDay, absenceCreditLimit } = body;

    const [pkg] = await db
      .insert(packagesTable)
      .values({
        name,
        description: description || null,
        procedureId: Number(procedureId),
        packageType,
        totalSessions: totalSessions != null ? Number(totalSessions) : null,
        sessionsPerWeek: Number(sessionsPerWeek ?? 1),
        validityDays: validityDays != null ? Number(validityDays) : null,
        price: String(price),
        monthlyPrice: monthlyPrice != null ? String(monthlyPrice) : null,
        billingDay: billingDay != null ? Number(billingDay) : null,
        absenceCreditLimit: Number(absenceCreditLimit ?? 0),
        isActive: true,
        clinicId: req.clinicId ?? null,
      })
      .returning();

    res.status(201).json(pkg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/:id", requirePermission("procedures.manage"), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const body = validateBody(updatePackageSchema, req.body, res);
    if (!body) return;

    const condition = req.isSuperAdmin || !req.clinicId
      ? eq(packagesTable.id, id)
      : and(eq(packagesTable.id, id), eq(packagesTable.clinicId, req.clinicId!));

    const updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.procedureId !== undefined) updateData.procedureId = Number(body.procedureId);
    if (body.packageType !== undefined) updateData.packageType = body.packageType;
    if (body.totalSessions !== undefined) updateData.totalSessions = body.totalSessions != null ? Number(body.totalSessions) : null;
    if (body.sessionsPerWeek !== undefined) updateData.sessionsPerWeek = Number(body.sessionsPerWeek);
    if (body.validityDays !== undefined) updateData.validityDays = body.validityDays != null ? Number(body.validityDays) : null;
    if (body.price !== undefined) updateData.price = String(body.price);
    if (body.monthlyPrice !== undefined) updateData.monthlyPrice = body.monthlyPrice != null ? String(body.monthlyPrice) : null;
    if (body.billingDay !== undefined) updateData.billingDay = body.billingDay != null ? Number(body.billingDay) : null;
    if (body.absenceCreditLimit !== undefined) updateData.absenceCreditLimit = Number(body.absenceCreditLimit);
    if (body.isActive !== undefined) updateData.isActive = body.isActive;

    const [pkg] = await db
      .update(packagesTable)
      .set(updateData)
      .where(condition)
      .returning();

    if (!pkg) {
      res.status(404).json({ error: "Not Found" });
      return;
    }
    res.json(pkg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/:id", requirePermission("procedures.manage"), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const condition = req.isSuperAdmin || !req.clinicId
      ? eq(packagesTable.id, id)
      : and(eq(packagesTable.id, id), eq(packagesTable.clinicId, req.clinicId!));

    await db.delete(packagesTable).where(condition);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
