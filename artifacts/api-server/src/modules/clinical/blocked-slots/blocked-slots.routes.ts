import { Router } from "express";
import { db } from "@workspace/db";
import { blockedSlotsTable, schedulesTable } from "@workspace/db";
import { eq, and, gte, lte, inArray, isNull, or } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../../../middleware/auth.js";
import { requirePermission } from "../../../middleware/rbac.js";
import { randomUUID } from "crypto";

const router = Router();
router.use(authMiddleware);

function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function getDayOfWeek(dateStr: string): number {
  return new Date(dateStr + "T00:00:00Z").getUTCDay();
}

function dateStrIsAfter(a: string, b: string): boolean {
  return a > b;
}

router.get("/", requirePermission("appointments.read"), async (req: AuthRequest, res) => {
  try {
    const { startDate, endDate, date, scheduleId } = req.query;
    const conditions: any[] = [];

    if (date) conditions.push(eq(blockedSlotsTable.date, date as string));
    if (startDate) conditions.push(gte(blockedSlotsTable.date, startDate as string));
    if (endDate) conditions.push(lte(blockedSlotsTable.date, endDate as string));
    if (scheduleId) conditions.push(eq(blockedSlotsTable.scheduleId, parseInt(scheduleId as string)));

    if (!req.isSuperAdmin && req.clinicId) {
      conditions.push(eq(blockedSlotsTable.clinicId, req.clinicId));
    }

    const slots = conditions.length > 0
      ? await db.select().from(blockedSlotsTable).where(and(...conditions)).orderBy(blockedSlotsTable.date, blockedSlotsTable.startTime)
      : await db.select().from(blockedSlotsTable).orderBy(blockedSlotsTable.date, blockedSlotsTable.startTime);

    res.json(slots);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/", requirePermission("appointments.create"), async (req: AuthRequest, res) => {
  try {
    const {
      date,
      startTime,
      endTime,
      reason,
      scheduleId: rawScheduleId,
      recurrenceType,
      recurrenceDays,
      recurrenceEndDate,
    } = req.body;

    if (!date || !startTime || !endTime) {
      res.status(400).json({ error: "Bad Request", message: "date, startTime e endTime são obrigatórios" });
      return;
    }

    if (startTime >= endTime) {
      res.status(400).json({ error: "Bad Request", message: "startTime deve ser anterior ao endTime" });
      return;
    }

    const clinicId = req.clinicId ?? null;

    // Resolve scheduleId: use provided value, or auto-detect if clinic has a single active schedule
    let resolvedScheduleId: number | null = rawScheduleId ? parseInt(String(rawScheduleId)) : null;

    if (!resolvedScheduleId && clinicId) {
      const activeSchedules = await db
        .select({ id: schedulesTable.id })
        .from(schedulesTable)
        .where(and(eq(schedulesTable.clinicId, clinicId), eq(schedulesTable.isActive, true)));

      if (activeSchedules.length === 1) {
        resolvedScheduleId = activeSchedules[0].id;
      }
    }

    const isRecurring = recurrenceType && recurrenceType !== "none";

    if (!isRecurring) {
      const [slot] = await db
        .insert(blockedSlotsTable)
        .values({ date, startTime, endTime, reason: reason || null, userId: req.userId ?? null, clinicId, scheduleId: resolvedScheduleId })
        .returning();
      res.status(201).json({ slots: [slot], count: 1 });
      return;
    }

    if (!recurrenceEndDate) {
      res.status(400).json({ error: "Bad Request", message: "recurrenceEndDate é obrigatório para bloqueios recorrentes" });
      return;
    }

    if (dateStrIsAfter(date, recurrenceEndDate)) {
      res.status(400).json({ error: "Bad Request", message: "A data final deve ser posterior à data inicial" });
      return;
    }

    const allowedDays: number[] = Array.isArray(recurrenceDays)
      ? recurrenceDays.map(Number)
      : [getDayOfWeek(date)];

    const daysToBlock: string[] = [];
    let cursor = date;
    let iterations = 0;
    const maxIterations = 366;

    while (!dateStrIsAfter(cursor, recurrenceEndDate) && iterations < maxIterations) {
      const dow = getDayOfWeek(cursor);
      if (recurrenceType === "daily" || (recurrenceType === "weekly" && allowedDays.includes(dow))) {
        daysToBlock.push(cursor);
      }
      cursor = addDaysToDateStr(cursor, 1);
      iterations++;
    }

    if (daysToBlock.length === 0) {
      res.status(400).json({ error: "Bad Request", message: "Nenhuma data correspondeu ao padrão de recorrência" });
      return;
    }

    const groupId = randomUUID();
    const rows = daysToBlock.map((d) => ({
      date: d,
      startTime,
      endTime,
      reason: reason || null,
      userId: req.userId ?? null,
      clinicId,
      scheduleId: resolvedScheduleId,
      recurrenceGroupId: groupId,
    }));

    const slots = await db.insert(blockedSlotsTable).values(rows).returning();
    res.status(201).json({ slots, count: slots.length, recurrenceGroupId: groupId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/:id", requirePermission("appointments.create"), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const { date, startTime, endTime, reason, updateGroup } = req.body;

    if (!startTime || !endTime) {
      res.status(400).json({ error: "Bad Request", message: "startTime e endTime são obrigatórios" });
      return;
    }
    if (startTime >= endTime) {
      res.status(400).json({ error: "Bad Request", message: "startTime deve ser anterior ao endTime" });
      return;
    }

    const [existing] = await db.select().from(blockedSlotsTable).where(eq(blockedSlotsTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Not Found", message: "Bloqueio não encontrado" });
      return;
    }

    if (!req.isSuperAdmin && req.clinicId && existing.clinicId !== req.clinicId) {
      res.status(403).json({ error: "Forbidden", message: "Acesso negado a este bloqueio" });
      return;
    }

    // Update entire recurrence group (time/reason only, not date)
    if (updateGroup && existing.recurrenceGroupId) {
      await db
        .update(blockedSlotsTable)
        .set({ startTime, endTime, reason: reason ?? null })
        .where(eq(blockedSlotsTable.recurrenceGroupId, existing.recurrenceGroupId));
      const [refreshed] = await db.select().from(blockedSlotsTable).where(eq(blockedSlotsTable.id, id));
      res.json(refreshed);
      return;
    }

    const updateFields: Record<string, unknown> = { startTime, endTime, reason: reason ?? null };
    if (date) updateFields.date = date;

    const [updated] = await db
      .update(blockedSlotsTable)
      .set(updateFields)
      .where(eq(blockedSlotsTable.id, id))
      .returning();

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/:id", requirePermission("appointments.delete"), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const deleteGroup = req.query.group === "true";

    if (deleteGroup) {
      const [slot] = await db.select().from(blockedSlotsTable).where(eq(blockedSlotsTable.id, id));
      if (!slot) {
        res.status(404).json({ error: "Not Found", message: "Bloqueio não encontrado" });
        return;
      }
      if (!req.isSuperAdmin && req.clinicId && slot.clinicId !== req.clinicId) {
        res.status(403).json({ error: "Forbidden", message: "Acesso negado a este bloqueio" });
        return;
      }
      if (slot?.recurrenceGroupId) {
        const groupSlots = await db
          .select({ id: blockedSlotsTable.id })
          .from(blockedSlotsTable)
          .where(eq(blockedSlotsTable.recurrenceGroupId, slot.recurrenceGroupId));
        const ids = groupSlots.map((s) => s.id);
        if (ids.length > 0) {
          await db.delete(blockedSlotsTable).where(inArray(blockedSlotsTable.id, ids));
        }
        res.json({ deleted: ids.length });
        return;
      }
    }

    const [slot] = await db.select().from(blockedSlotsTable).where(eq(blockedSlotsTable.id, id));
    if (!slot) {
      res.status(404).json({ error: "Not Found", message: "Bloqueio não encontrado" });
      return;
    }
    if (!req.isSuperAdmin && req.clinicId && slot.clinicId !== req.clinicId) {
      res.status(403).json({ error: "Forbidden", message: "Acesso negado a este bloqueio" });
      return;
    }

    await db.delete(blockedSlotsTable).where(eq(blockedSlotsTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
