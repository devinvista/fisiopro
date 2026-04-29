import { Router } from "express";
import { db } from "@workspace/db";
import { treatmentPlanProceduresTable, treatmentPlansTable, proceduresTable, packagesTable, patientsTable, appointmentsTable, usersTable } from "@workspace/db";
import { eq, and, or, inArray } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../../../middleware/auth.js";
import { requirePermission } from "../../../middleware/rbac.js";

const router = Router({ mergeParams: true });
router.use(authMiddleware);

async function verifyPlanOwnership(planId: number, req: AuthRequest): Promise<boolean> {
  if (req.isSuperAdmin || !req.clinicId) return true;
  const [row] = await db
    .select({ clinicId: patientsTable.clinicId })
    .from(treatmentPlansTable)
    .innerJoin(patientsTable, eq(treatmentPlansTable.patientId, patientsTable.id))
    .where(eq(treatmentPlansTable.id, planId))
    .limit(1);
  return row?.clinicId === req.clinicId;
}

async function verifyItemOwnership(itemId: number, req: AuthRequest): Promise<boolean> {
  if (req.isSuperAdmin || !req.clinicId) return true;
  const [row] = await db
    .select({ clinicId: patientsTable.clinicId })
    .from(treatmentPlanProceduresTable)
    .innerJoin(treatmentPlansTable, eq(treatmentPlanProceduresTable.treatmentPlanId, treatmentPlansTable.id))
    .innerJoin(patientsTable, eq(treatmentPlansTable.patientId, patientsTable.id))
    .where(eq(treatmentPlanProceduresTable.id, itemId))
    .limit(1);
  return row?.clinicId === req.clinicId;
}

router.get("/", requirePermission("patients.read"), async (req: AuthRequest, res) => {
  try {
    const planId = parseInt(req.params.planId as string);

    if (!(await verifyPlanOwnership(planId, req))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [plan] = await db
      .select({ patientId: treatmentPlansTable.patientId })
      .from(treatmentPlansTable)
      .where(eq(treatmentPlansTable.id, planId))
      .limit(1);

    if (!plan) {
      res.status(404).json({ error: "Not Found" });
      return;
    }

    const patientId = plan.patientId;

    const [rawItems, completedAppts] = await Promise.all([
      db
        .select({
          id: treatmentPlanProceduresTable.id,
          planId: treatmentPlanProceduresTable.treatmentPlanId,
          procedureId: treatmentPlanProceduresTable.procedureId,
          packageId: treatmentPlanProceduresTable.packageId,
          sessionsPerWeek: treatmentPlanProceduresTable.sessionsPerWeek,
          totalSessions: treatmentPlanProceduresTable.totalSessions,
          unitPrice: treatmentPlanProceduresTable.unitPrice,
          unitMonthlyPrice: treatmentPlanProceduresTable.unitMonthlyPrice,
          discount: treatmentPlanProceduresTable.discount,
          priority: treatmentPlanProceduresTable.priority,
          notes: treatmentPlanProceduresTable.notes,
          weekDays: treatmentPlanProceduresTable.weekDays,
          defaultStartTime: treatmentPlanProceduresTable.defaultStartTime,
          defaultProfessionalId: treatmentPlanProceduresTable.defaultProfessionalId,
          scheduleId: treatmentPlanProceduresTable.scheduleId,
          sessionDurationMinutes: treatmentPlanProceduresTable.sessionDurationMinutes,
          defaultProfessionalName: usersTable.name,
          createdAt: treatmentPlanProceduresTable.createdAt,
        })
        .from(treatmentPlanProceduresTable)
        .leftJoin(usersTable, eq(treatmentPlanProceduresTable.defaultProfessionalId, usersTable.id))
        .where(eq(treatmentPlanProceduresTable.treatmentPlanId, planId))
        .orderBy(treatmentPlanProceduresTable.priority),
      db
        .select({ procedureId: appointmentsTable.procedureId })
        .from(appointmentsTable)
        .where(and(
          eq(appointmentsTable.patientId, patientId),
          or(eq(appointmentsTable.status, "concluido"), eq(appointmentsTable.status, "presenca"))
        )),
    ]);

    // Build usage map for session progress tracking
    const procedureUsageMap: Record<number, number> = {};
    for (const a of completedAppts) {
      if (a.procedureId) {
        procedureUsageMap[a.procedureId] = (procedureUsageMap[a.procedureId] ?? 0) + 1;
      }
    }

    if (rawItems.length === 0) {
      res.json([]);
      return;
    }

    // Batch fetch all packages and procedures referenced by the items
    const packageIds = [...new Set(rawItems.map(i => i.packageId).filter((id): id is number => id != null))];
    const procedureIds = [...new Set(rawItems.map(i => i.procedureId).filter((id): id is number => id != null))];

    const [packagesRows, proceduresRows] = await Promise.all([
      packageIds.length > 0
        ? db.select({
            id: packagesTable.id,
            name: packagesTable.name,
            packageType: packagesTable.packageType,
            totalSessions: packagesTable.totalSessions,
            sessionsPerWeek: packagesTable.sessionsPerWeek,
            validityDays: packagesTable.validityDays,
            price: packagesTable.price,
            monthlyPrice: packagesTable.monthlyPrice,
            billingDay: packagesTable.billingDay,
            absenceCreditLimit: packagesTable.absenceCreditLimit,
            procedureId: packagesTable.procedureId,
            procedureName: proceduresTable.name,
          }).from(packagesTable)
            .innerJoin(proceduresTable, eq(packagesTable.procedureId, proceduresTable.id))
            .where(inArray(packagesTable.id, packageIds))
        : Promise.resolve([]),
      procedureIds.length > 0
        ? db.select({
            id: proceduresTable.id,
            name: proceduresTable.name,
            price: proceduresTable.price,
            category: proceduresTable.category,
            modalidade: proceduresTable.modalidade,
            durationMinutes: proceduresTable.durationMinutes,
          }).from(proceduresTable)
            .where(inArray(proceduresTable.id, procedureIds))
        : Promise.resolve([]),
    ]);

    const pkgMap = new Map(packagesRows.map(p => [p.id, p]));
    const procMap = new Map(proceduresRows.map(p => [p.id, p]));

    const enriched = rawItems.map((item) => {
      if (item.packageId) {
        const pkg = pkgMap.get(item.packageId);
        if (pkg) {
          const usedSessions = procedureUsageMap[pkg.procedureId] ?? 0;
          return {
            ...item,
            packageName: pkg.name,
            procedureName: pkg.procedureName,
            packageType: pkg.packageType,
            totalSessions: item.totalSessions ?? pkg.totalSessions ?? null,
            sessionsPerWeek: item.sessionsPerWeek ?? pkg.sessionsPerWeek,
            price: item.unitPrice ?? pkg.price,
            monthlyPrice: item.unitMonthlyPrice ?? pkg.monthlyPrice,
            billingDay: pkg.billingDay,
            absenceCreditLimit: pkg.absenceCreditLimit,
            usedSessions,
            discount: item.discount ?? "0",
          };
        }
        return { ...item, usedSessions: 0, discount: item.discount ?? "0" };
      }

      if (item.procedureId) {
        const proc = procMap.get(item.procedureId);
        if (proc) {
          return {
            ...item,
            procedureName: proc.name,
            packageType: null,
            price: item.unitPrice ?? proc.price,
            monthlyPrice: null,
            usedSessions: procedureUsageMap[proc.id] ?? 0,
            discount: item.discount ?? "0",
          };
        }
        return { ...item, usedSessions: 0, discount: item.discount ?? "0" };
      }

      return { ...item, usedSessions: 0, discount: item.discount ?? "0" };
    });

    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/", requirePermission("medical.write"), async (req: AuthRequest, res) => {
  try {
    const planId = parseInt(req.params.planId as string);
    const {
      procedureId, packageId, sessionsPerWeek, totalSessions, priority, notes,
      unitPrice, unitMonthlyPrice, discount,
      weekDays, defaultStartTime, defaultProfessionalId, scheduleId, sessionDurationMinutes,
    } = req.body;

    if (!procedureId && !packageId) {
      res.status(400).json({ error: "Bad Request", message: "procedureId ou packageId é obrigatório" });
      return;
    }

    // Verify plan exists before ownership check to give a clear 404
    const [planExists] = await db
      .select({ id: treatmentPlansTable.id })
      .from(treatmentPlansTable)
      .where(eq(treatmentPlansTable.id, planId))
      .limit(1);
    if (!planExists) {
      res.status(404).json({ error: "Not Found", message: "Plano de tratamento não encontrado" });
      return;
    }

    if (!(await verifyPlanOwnership(planId, req))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [item] = await db
      .insert(treatmentPlanProceduresTable)
      .values({
        treatmentPlanId: planId,
        procedureId: procedureId ? parseInt(procedureId) : null,
        packageId: packageId ? parseInt(packageId) : null,
        sessionsPerWeek: sessionsPerWeek ? parseInt(sessionsPerWeek) : 1,
        totalSessions: totalSessions ? parseInt(totalSessions) : null,
        unitPrice: unitPrice != null ? String(unitPrice) : null,
        unitMonthlyPrice: unitMonthlyPrice != null ? String(unitMonthlyPrice) : null,
        discount: discount != null ? String(discount) : "0",
        priority: priority ? parseInt(priority) : 1,
        notes: notes || null,
        weekDays: weekDays ?? null,
        defaultStartTime: defaultStartTime ?? null,
        defaultProfessionalId: defaultProfessionalId != null ? Number(defaultProfessionalId) : null,
        scheduleId: scheduleId != null ? Number(scheduleId) : null,
        sessionDurationMinutes: sessionDurationMinutes != null ? Number(sessionDurationMinutes) : null,
      })
      .returning();

    res.status(201).json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/:id", requirePermission("medical.write"), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const {
      procedureId, packageId, sessionsPerWeek, totalSessions, priority, notes,
      unitPrice, unitMonthlyPrice, discount,
      weekDays, defaultStartTime, defaultProfessionalId, scheduleId, sessionDurationMinutes,
    } = req.body;

    if (!(await verifyItemOwnership(id, req))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const updateData: any = {};
    if (procedureId !== undefined) updateData.procedureId = procedureId ? parseInt(procedureId) : null;
    if (packageId !== undefined) updateData.packageId = packageId ? parseInt(packageId) : null;
    if (sessionsPerWeek !== undefined) updateData.sessionsPerWeek = parseInt(sessionsPerWeek);
    if (totalSessions !== undefined) updateData.totalSessions = totalSessions ? parseInt(totalSessions) : null;
    if (unitPrice !== undefined) updateData.unitPrice = unitPrice != null ? String(unitPrice) : null;
    if (unitMonthlyPrice !== undefined) updateData.unitMonthlyPrice = unitMonthlyPrice != null ? String(unitMonthlyPrice) : null;
    if (discount !== undefined) updateData.discount = String(discount ?? 0);
    if (priority !== undefined) updateData.priority = parseInt(priority);
    if (notes !== undefined) updateData.notes = notes;
    if (weekDays !== undefined) updateData.weekDays = weekDays;
    if (defaultStartTime !== undefined) updateData.defaultStartTime = defaultStartTime;
    if (defaultProfessionalId !== undefined) updateData.defaultProfessionalId = defaultProfessionalId != null ? Number(defaultProfessionalId) : null;
    if (scheduleId !== undefined) updateData.scheduleId = scheduleId != null ? Number(scheduleId) : null;
    if (sessionDurationMinutes !== undefined) updateData.sessionDurationMinutes = sessionDurationMinutes != null ? Number(sessionDurationMinutes) : null;

    const [updated] = await db
      .update(treatmentPlanProceduresTable)
      .set(updateData)
      .where(eq(treatmentPlanProceduresTable.id, id))
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

router.delete("/:id", requirePermission("medical.write"), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);

    if (!(await verifyItemOwnership(id, req))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    await db.delete(treatmentPlanProceduresTable).where(eq(treatmentPlanProceduresTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
