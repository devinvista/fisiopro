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

// Sprint 2 — após o aceite, o "carrinho" do plano vira venda formal e fica
// imutável em campos comerciais. Itens só podem mudar campos operacionais
// (agenda/profissional/notas). Adição/remoção de itens fica bloqueada — para
// isso o usuário deve usar a renegociação (que cria nova versão do plano).
async function getPlanAcceptedAt(planId: number): Promise<Date | null> {
  const [row] = await db
    .select({ acceptedAt: treatmentPlansTable.acceptedAt })
    .from(treatmentPlansTable)
    .where(eq(treatmentPlansTable.id, planId))
    .limit(1);
  return row?.acceptedAt ?? null;
}

async function getItemAndPlanAcceptedAt(
  itemId: number,
): Promise<{ item: typeof treatmentPlanProceduresTable.$inferSelect; acceptedAt: Date | null } | null> {
  const [row] = await db
    .select({
      item: treatmentPlanProceduresTable,
      acceptedAt: treatmentPlansTable.acceptedAt,
    })
    .from(treatmentPlanProceduresTable)
    .innerJoin(treatmentPlansTable, eq(treatmentPlanProceduresTable.treatmentPlanId, treatmentPlansTable.id))
    .where(eq(treatmentPlanProceduresTable.id, itemId))
    .limit(1);
  if (!row) return null;
  return { item: row.item, acceptedAt: row.acceptedAt };
}

function fmtAcceptedDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Comparação tolerante para detectar mudança real (number↔string, ""↔null).
function normalizeForCompare(x: unknown): string | null {
  if (x === null || x === undefined || x === "") return null;
  return String(x);
}
function valueChanged(prev: unknown, next: unknown): boolean {
  return normalizeForCompare(prev) !== normalizeForCompare(next);
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
            // Procedimento "real" associado ao pacote — usado pelo editor de
            // aceite para consultar disponibilidade de horários (a coluna
            // `procedure_id` do item é NULL quando ele aponta para um pacote).
            packageProcedureId: pkg.procedureId,
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
      weekDays, defaultStartTime, defaultProfessionalId, scheduleId,
    } = req.body;

    if (!procedureId && !packageId) {
      res.status(400).json({ error: "Bad Request", message: "procedureId ou packageId é obrigatório" });
      return;
    }

    // Verify plan exists before ownership check to give a clear 404
    const [planExists] = await db
      .select({ id: treatmentPlansTable.id, acceptedAt: treatmentPlansTable.acceptedAt })
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

    // Sprint 2 — bloqueio pós-aceite: o "carrinho" do plano fica congelado.
    if (planExists.acceptedAt) {
      res.status(409).json({
        error: "plan_already_accepted",
        message:
          `Plano já aceito em ${fmtAcceptedDate(planExists.acceptedAt)}. ` +
          `Não é possível adicionar novos procedimentos. Use a renegociação para criar uma nova versão do plano.`,
      });
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
        // Duração da consulta vem SEMPRE do procedimento vinculado — sem
        // override por item. Mantemos a coluna como `null` para clareza.
        sessionDurationMinutes: null,
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
      weekDays, defaultStartTime, defaultProfessionalId, scheduleId,
    } = req.body;

    if (!(await verifyItemOwnership(id, req))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Sprint 2 — após aceite, só campos operacionais (agenda/profissional/notas)
    // continuam editáveis. Mudar identidade do item ou valores comerciais
    // exige renegociação. No-ops (mesmo valor) são silenciosamente aceitos
    // para o frontend poder reenviar o objeto inteiro sem ser bloqueado.
    const ctx = await getItemAndPlanAcceptedAt(id);
    if (!ctx) {
      res.status(404).json({ error: "Not Found" });
      return;
    }
    const { item: existing, acceptedAt } = ctx;
    const isAccepted = !!acceptedAt;

    const updateData: Record<string, unknown> = {};

    // Helper que aplica a regra de bloqueio para campos comerciais:
    // se o plano está aceito e o valor mudou de fato, rejeita; se for igual,
    // ignora; se não está aceito, simplesmente aplica a mudança.
    const setLocked = (
      key: keyof typeof treatmentPlanProceduresTable.$inferSelect,
      incoming: unknown,
      label: string,
    ): { reject?: { error: string; message: string } } => {
      if (isAccepted && valueChanged(existing[key], incoming)) {
        return {
          reject: {
            error: "plan_already_accepted",
            message:
              `Plano já aceito em ${fmtAcceptedDate(acceptedAt!)}. ` +
              `Não é possível alterar "${label}" — use a renegociação para criar uma nova versão do plano.`,
          },
        };
      }
      if (!isAccepted || valueChanged(existing[key], incoming)) {
        updateData[key] = incoming;
      }
      return {};
    };

    // Campos comerciais / de identidade do item — bloqueados após aceite.
    if (procedureId !== undefined) {
      const next = procedureId ? parseInt(procedureId) : null;
      const r = setLocked("procedureId", next, "procedimento");
      if (r.reject) { res.status(409).json(r.reject); return; }
    }
    if (packageId !== undefined) {
      const next = packageId ? parseInt(packageId) : null;
      const r = setLocked("packageId", next, "pacote");
      if (r.reject) { res.status(409).json(r.reject); return; }
    }
    if (sessionsPerWeek !== undefined) {
      const next = parseInt(sessionsPerWeek);
      const r = setLocked("sessionsPerWeek", next, "sessões por semana");
      if (r.reject) { res.status(409).json(r.reject); return; }
    }
    if (totalSessions !== undefined) {
      const next = totalSessions ? parseInt(totalSessions) : null;
      const r = setLocked("totalSessions", next, "total de sessões");
      if (r.reject) { res.status(409).json(r.reject); return; }
    }
    if (unitPrice !== undefined) {
      const next = unitPrice != null ? String(unitPrice) : null;
      const r = setLocked("unitPrice", next, "valor unitário");
      if (r.reject) { res.status(409).json(r.reject); return; }
    }
    if (unitMonthlyPrice !== undefined) {
      const next = unitMonthlyPrice != null ? String(unitMonthlyPrice) : null;
      const r = setLocked("unitMonthlyPrice", next, "valor mensal");
      if (r.reject) { res.status(409).json(r.reject); return; }
    }
    if (discount !== undefined) {
      const next = String(discount ?? 0);
      const r = setLocked("discount", next, "desconto");
      if (r.reject) { res.status(409).json(r.reject); return; }
    }

    // Campos operacionais — sempre editáveis (inclusive pós-aceite, usados
    // pelo AcceptanceScheduleEditor para configurar a materialização).
    if (priority !== undefined) updateData.priority = parseInt(priority);
    if (notes !== undefined) updateData.notes = notes;
    if (weekDays !== undefined) updateData.weekDays = weekDays;
    if (defaultStartTime !== undefined) updateData.defaultStartTime = defaultStartTime;
    if (defaultProfessionalId !== undefined) updateData.defaultProfessionalId = defaultProfessionalId != null ? Number(defaultProfessionalId) : null;
    if (scheduleId !== undefined) updateData.scheduleId = scheduleId != null ? Number(scheduleId) : null;
    // Duração da consulta vem SEMPRE do procedimento vinculado — sem
    // override por item. Se algum cliente legado mandar o campo, ignora.

    if (Object.keys(updateData).length === 0) {
      res.json(existing);
      return;
    }

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

    // Sprint 2 — bloqueio pós-aceite: itens vendidos não podem ser removidos
    // (impacto contábil/financeiro). Use renegociação para refazer o plano.
    const ctx = await getItemAndPlanAcceptedAt(id);
    if (!ctx) {
      res.status(404).json({ error: "Not Found" });
      return;
    }
    if (ctx.acceptedAt) {
      res.status(409).json({
        error: "plan_already_accepted",
        message:
          `Plano já aceito em ${fmtAcceptedDate(ctx.acceptedAt)}. ` +
          `Não é possível remover procedimentos. Use a renegociação para criar uma nova versão do plano.`,
      });
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
