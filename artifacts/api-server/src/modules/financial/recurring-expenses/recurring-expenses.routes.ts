import { Router } from "express";
import { db } from "@workspace/db";
import { recurringExpensesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../../../middleware/auth.js";
import { requirePermission } from "../../../middleware/rbac.js";
import { requireFeature } from "../../../middleware/plan-features.js";

const router = Router();
router.use(authMiddleware);
router.use(requireFeature("module.recurring_expenses"));

router.get("/", requirePermission("financial.read"), async (req: AuthRequest, res) => {
  try {
    if (!req.clinicId && !req.isSuperAdmin) {
      res.status(400).json({ error: "Bad Request", message: "Clínica não identificada" });
      return;
    }

    const where = req.isSuperAdmin && !req.clinicId
      ? undefined
      : eq(recurringExpensesTable.clinicId, req.clinicId!);

    const records = await db
      .select()
      .from(recurringExpensesTable)
      .where(where)
      .orderBy(recurringExpensesTable.category, recurringExpensesTable.name);

    res.json(records);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/", requirePermission("financial.write"), async (req: AuthRequest, res) => {
  try {
    if (!req.clinicId) {
      res.status(400).json({ error: "Bad Request", message: "Clínica não identificada" });
      return;
    }

    const { name, category, amount, frequency, notes, monthlyBudget } = req.body;

    if (!name || !category || !amount) {
      res.status(400).json({ error: "Bad Request", message: "Nome, categoria e valor são obrigatórios" });
      return;
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      res.status(400).json({ error: "Bad Request", message: "Valor deve ser maior que zero" });
      return;
    }

    let monthlyBudgetValue: string | null = null;
    if (monthlyBudget !== undefined && monthlyBudget !== null && monthlyBudget !== "") {
      const numBudget = Number(monthlyBudget);
      if (isNaN(numBudget) || numBudget < 0) {
        res.status(400).json({ error: "Bad Request", message: "Orçamento mensal inválido" });
        return;
      }
      monthlyBudgetValue = String(numBudget);
    }

    const [record] = await db
      .insert(recurringExpensesTable)
      .values({
        clinicId: req.clinicId,
        name,
        category,
        amount: String(numAmount),
        monthlyBudget: monthlyBudgetValue,
        frequency: frequency || "mensal",
        notes: notes || null,
        isActive: true,
      })
      .returning();

    res.status(201).json(record);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/:id", requirePermission("financial.write"), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const { name, category, amount, frequency, notes, isActive, monthlyBudget } = req.body;

    const clinicCond = req.isSuperAdmin && !req.clinicId
      ? eq(recurringExpensesTable.id, id)
      : and(eq(recurringExpensesTable.id, id), eq(recurringExpensesTable.clinicId, req.clinicId!));

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (category !== undefined) updates.category = category;
    if (amount !== undefined) updates.amount = String(Number(amount));
    if (frequency !== undefined) updates.frequency = frequency;
    if (notes !== undefined) updates.notes = notes;
    if (isActive !== undefined) updates.isActive = Boolean(isActive);
    if (monthlyBudget !== undefined) {
      if (monthlyBudget === null || monthlyBudget === "") {
        updates.monthlyBudget = null;
      } else {
        const numBudget = Number(monthlyBudget);
        if (isNaN(numBudget) || numBudget < 0) {
          res.status(400).json({ error: "Bad Request", message: "Orçamento mensal inválido" });
          return;
        }
        updates.monthlyBudget = String(numBudget);
      }
    }

    const [record] = await db
      .update(recurringExpensesTable)
      .set(updates as any)
      .where(clinicCond)
      .returning();

    if (!record) {
      res.status(404).json({ error: "Not Found" });
      return;
    }

    res.json(record);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/:id", requirePermission("financial.write"), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);

    const clinicCond = req.isSuperAdmin && !req.clinicId
      ? eq(recurringExpensesTable.id, id)
      : and(eq(recurringExpensesTable.id, id), eq(recurringExpensesTable.clinicId, req.clinicId!));

    await db.delete(recurringExpensesTable).where(clinicCond);

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
