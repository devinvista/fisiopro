import { Router } from "express";
import { db } from "@workspace/db";
import { patientPackagesTable, packagesTable, proceduresTable, patientsTable, patientSubscriptionsTable, sessionCreditsTable, financialRecordsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../../../middleware/auth.js";
import { requirePermission } from "../../../middleware/rbac.js";
import { requireFeature } from "../../../middleware/plan-features.js";
import { validateBody } from "../../../utils/validate.js";
import { postPackageSale } from "../../shared/accounting/accounting.service.js";
import { z } from "zod/v4";

const paymentStatusEnum = z.enum(["pendente", "pago", "cancelado"]);

const createPatientPackageSchema = z.object({
  patientId: z.union([z.number().int().positive(), z.string().transform(Number)]).optional(),
  packageId: z.union([z.number().int().positive(), z.string().transform(Number)]).optional().nullable(),
  procedureId: z.union([z.number().int().positive(), z.string().transform(Number)], { error: "procedureId é obrigatório e deve ser um número positivo" }),
  name: z.string().min(1, "name é obrigatório").max(200),
  totalSessions: z.union([z.number().int().positive(), z.string().transform(Number)]).refine(v => Number.isInteger(v) && v > 0, "totalSessions deve ser um inteiro positivo"),
  sessionsPerWeek: z.union([z.number().int().positive(), z.string().transform(Number)]).optional().default(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate deve estar no formato YYYY-MM-DD"),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expiryDate deve estar no formato YYYY-MM-DD").optional().nullable(),
  price: z.union([z.number(), z.string().transform(Number)]).refine(v => !isNaN(v) && v >= 0, "price deve ser um número não-negativo"),
  paymentStatus: paymentStatusEnum.default("pendente"),
  notes: z.string().max(2000).optional().nullable(),
  unitMonthlyPrice: z.union([z.number(), z.string().transform(Number)]).optional().nullable(),
  billingDay: z.union([z.number().int().min(1).max(31), z.string().transform(Number)]).optional().nullable(),
});

const updatePatientPackageSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  sessionsPerWeek: z.union([z.number().int().positive(), z.string().transform(Number)]).optional(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expiryDate deve estar no formato YYYY-MM-DD").optional().nullable(),
  paymentStatus: paymentStatusEnum.optional(),
  notes: z.string().max(2000).optional().nullable(),
});

const router = Router({ mergeParams: true });
router.use(authMiddleware);
router.use(requireFeature("module.patient_packages"));

function calcNextBillingDate(startDate: string, billingDay: number): string {
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

router.get("/", requirePermission("patients.read"), async (req: AuthRequest, res) => {
  try {
    const patientId = req.params.patientId ? parseInt(req.params.patientId as string) : undefined;

    const conditions: any[] = [];
    if (patientId) conditions.push(eq(patientPackagesTable.patientId, patientId));
    if (!req.isSuperAdmin && req.clinicId) {
      conditions.push(eq(patientPackagesTable.clinicId, req.clinicId));
    }

    let query = db
      .select({
        id: patientPackagesTable.id,
        patientId: patientPackagesTable.patientId,
        packageId: patientPackagesTable.packageId,
        procedureId: patientPackagesTable.procedureId,
        procedureName: proceduresTable.name,
        procedureCategory: proceduresTable.category,
        procedureModalidade: proceduresTable.modalidade,
        name: patientPackagesTable.name,
        totalSessions: patientPackagesTable.totalSessions,
        usedSessions: patientPackagesTable.usedSessions,
        sessionsPerWeek: patientPackagesTable.sessionsPerWeek,
        startDate: patientPackagesTable.startDate,
        expiryDate: patientPackagesTable.expiryDate,
        price: patientPackagesTable.price,
        paymentStatus: patientPackagesTable.paymentStatus,
        notes: patientPackagesTable.notes,
        clinicId: patientPackagesTable.clinicId,
        createdAt: patientPackagesTable.createdAt,
      })
      .from(patientPackagesTable)
      .innerJoin(proceduresTable, eq(patientPackagesTable.procedureId, proceduresTable.id)) as any;

    if (conditions.length === 1) {
      query = query.where(conditions[0]);
    } else if (conditions.length > 1) {
      query = query.where(and(...conditions));
    }

    const result = await query.orderBy(patientPackagesTable.createdAt);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/", requirePermission("patients.create"), async (req: AuthRequest, res) => {
  try {
    const patientId = req.params.patientId
      ? parseInt(req.params.patientId as string)
      : undefined;

    const body = validateBody(createPatientPackageSchema, req.body, res);
    if (!body) return;

    const resolvedPatientId = patientId ?? (body.patientId ? Number(body.patientId) : undefined);
    if (!resolvedPatientId) {
      res.status(400).json({ error: "Bad Request", message: "patientId é obrigatório" });
      return;
    }

    const { packageId, procedureId, name, totalSessions, sessionsPerWeek, startDate, expiryDate, price, paymentStatus, notes, unitMonthlyPrice, billingDay } = body;

    // Resolve expiryDate: usa o fornecido, ou calcula de validityDays do template
    let resolvedExpiryDate: string | null = expiryDate || null;

    let pkg: typeof packagesTable.$inferSelect | undefined;
    if (packageId) {
      const [found] = await db
        .select()
        .from(packagesTable)
        .where(eq(packagesTable.id, Number(packageId)))
        .limit(1);
      pkg = found;
    }

    if (!resolvedExpiryDate && pkg?.validityDays) {
      const start = new Date(startDate + "T12:00:00Z");
      start.setUTCDate(start.getUTCDate() + pkg.validityDays);
      resolvedExpiryDate = start.toISOString().slice(0, 10);
    }

    const [pp] = await db
      .insert(patientPackagesTable)
      .values({
        patientId: resolvedPatientId,
        packageId: packageId ? Number(packageId) : null,
        procedureId: Number(procedureId),
        name,
        totalSessions: Number(totalSessions),
        usedSessions: 0,
        sessionsPerWeek: Number(sessionsPerWeek ?? 1),
        startDate,
        expiryDate: resolvedExpiryDate,
        price: String(price),
        paymentStatus: paymentStatus ?? "pendente",
        notes: notes || null,
        clinicId: req.clinicId ?? null,
      })
      .returning();

    if (!pkg || pkg.packageType === "sessoes") {
      await db.insert(sessionCreditsTable).values({
        patientId: resolvedPatientId,
        procedureId: Number(procedureId),
        quantity: Number(totalSessions),
        usedQuantity: 0,
        patientPackageId: pp.id,
        clinicId: req.clinicId ?? null,
        notes: `Créditos gerados a partir do pacote: ${name}`,
      });
    }

    if (Number(price) > 0) {
      const [financialRecord] = await db.insert(financialRecordsTable).values({
        type: "receita",
        amount: String(price),
        description: `Venda de pacote — ${name}`,
        category: "Pacote",
        patientId: resolvedPatientId,
        procedureId: Number(procedureId),
        clinicId: req.clinicId ?? null,
        transactionType: "vendaPacote",
        status: paymentStatus === "pago" ? "pago" : "pendente",
        paymentDate: paymentStatus === "pago" ? startDate : null,
        dueDate: startDate,
      }).returning();

      const entry = await postPackageSale({
        clinicId: req.clinicId ?? null,
        entryDate: startDate,
        amount: Number(price),
        paid: paymentStatus === "pago",
        description: `Venda de pacote — ${name}`,
        sourceType: "patient_package",
        sourceId: pp.id,
        patientId: resolvedPatientId,
        procedureId: Number(procedureId),
        patientPackageId: pp.id,
        financialRecordId: financialRecord.id,
      });

      await db
        .update(financialRecordsTable)
        .set({ accountingEntryId: entry.id, settlementEntryId: paymentStatus === "pago" ? entry.id : null })
        .where(eq(financialRecordsTable.id, financialRecord.id));
    }

    // Auto-create subscription for mensal and faturaConsolidada packages
    let subscription: typeof patientSubscriptionsTable.$inferSelect | null = null;

    if (pkg && (pkg.packageType === "mensal" || pkg.packageType === "faturaConsolidada")) {
      const monthlyAmount = unitMonthlyPrice ?? pkg.monthlyPrice ?? price;
      const rawDay = billingDay ?? pkg.billingDay ?? new Date(startDate + "T12:00:00Z").getUTCDate();
      const day = Math.max(1, Math.min(31, parseInt(String(rawDay))));
      const subscriptionType = pkg.packageType === "faturaConsolidada" ? "faturaConsolidada" : "mensal";

      const [sub] = await db
        .insert(patientSubscriptionsTable)
        .values({
          patientId: resolvedPatientId,
          procedureId: Number(procedureId),
          startDate,
          billingDay: day,
          monthlyAmount: String(monthlyAmount),
          status: "ativa",
          subscriptionType,
          clinicId: req.clinicId ?? null,
          notes: `Gerada automaticamente a partir do pacote: ${name}`,
          nextBillingDate: calcNextBillingDate(startDate, day),
        })
        .returning();

      subscription = sub;
      console.log(`[patient-packages] Assinatura #${sub.id} (${subscriptionType}) criada automaticamente para pacote "${name}" (paciente ${resolvedPatientId})`);
    }

    res.status(201).json({ ...pp, subscription, subscriptionCreated: !!subscription });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/:id/consume-session", requirePermission("appointments.update"), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);

    const condition = req.isSuperAdmin || !req.clinicId
      ? eq(patientPackagesTable.id, id)
      : and(eq(patientPackagesTable.id, id), eq(patientPackagesTable.clinicId, req.clinicId!));

    const [existing] = await db
      .select()
      .from(patientPackagesTable)
      .where(condition)
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Not Found" });
      return;
    }

    if (existing.usedSessions >= existing.totalSessions) {
      res.status(409).json({
        error: "Conflict",
        message: "Este pacote já foi totalmente utilizado (todas as sessões foram consumidas)",
      });
      return;
    }

    const [updated] = await db
      .update(patientPackagesTable)
      .set({ usedSessions: existing.usedSessions + 1 })
      .where(eq(patientPackagesTable.id, id))
      .returning();

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/:id", requirePermission("patients.update"), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);

    const condition = req.isSuperAdmin || !req.clinicId
      ? eq(patientPackagesTable.id, id)
      : and(eq(patientPackagesTable.id, id), eq(patientPackagesTable.clinicId, req.clinicId!));

    const body = validateBody(updatePatientPackageSchema, req.body, res);
    if (!body) return;
    const { name, sessionsPerWeek, expiryDate, paymentStatus, notes } = body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (sessionsPerWeek !== undefined) updateData.sessionsPerWeek = Number(sessionsPerWeek);
    if (expiryDate !== undefined) updateData.expiryDate = expiryDate;
    if (paymentStatus !== undefined) updateData.paymentStatus = paymentStatus;
    if (notes !== undefined) updateData.notes = notes;

    const [updated] = await db
      .update(patientPackagesTable)
      .set(updateData)
      .where(condition)
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Not Found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/:id", requirePermission("patients.delete"), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);

    const condition = req.isSuperAdmin || !req.clinicId
      ? eq(patientPackagesTable.id, id)
      : and(eq(patientPackagesTable.id, id), eq(patientPackagesTable.clinicId, req.clinicId!));

    await db.delete(patientPackagesTable).where(condition);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
