import { Router } from "express";
import { db, notesTable, usersTable, patientsTable } from "@workspace/db";
import { eq, and, or, isNull, sql } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../../middleware/auth.js";
import { requireFeature } from "../../middleware/plan-features.js";

const router = Router();
router.use(authMiddleware);
router.use(requireFeature("module.notes"));

function clinicFilter(req: AuthRequest) {
  if (!req.clinicId) return undefined;
  return eq(notesTable.clinicId, req.clinicId);
}

router.get("/patients", async (req: AuthRequest, res) => {
  try {
    if (!req.clinicId) { res.json([]); return; }
    const rows = await db
      .select({ id: patientsTable.id, name: patientsTable.name })
      .from(patientsTable)
      .where(and(
        eq(patientsTable.clinicId, req.clinicId),
        isNull(patientsTable.deletedAt),
      ))
      .orderBy(patientsTable.name)
      .limit(300);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/summary", async (req: AuthRequest, res) => {
  try {
    if (!req.clinicId) { res.json({ unread: 0, overdue: 0, dueToday: 0, pending: 0 }); return; }
    const now = new Date();
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

    const rawResult = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (
          WHERE assigned_to = ${req.userId} AND seen_at IS NULL AND status != 'concluido'
        ) AS unread,
        COUNT(*) FILTER (
          WHERE (assigned_to = ${req.userId} OR created_by = ${req.userId})
            AND status != 'concluido'
            AND due_at IS NOT NULL AND due_at < NOW()
        ) AS overdue,
        COUNT(*) FILTER (
          WHERE (assigned_to = ${req.userId} OR created_by = ${req.userId})
            AND status != 'concluido'
            AND due_at IS NOT NULL AND due_at >= NOW() AND due_at <= ${todayEnd}
        ) AS due_today,
        COUNT(*) FILTER (
          WHERE (assigned_to = ${req.userId} OR created_by = ${req.userId})
            AND status = 'pendente'
            AND clinic_id = ${req.clinicId}
        ) AS pending
      FROM notes
      WHERE clinic_id = ${req.clinicId}
    `) as any;

    const rawArr = Array.isArray(rawResult) ? rawResult : (rawResult?.rows ?? []);
    const r = rawArr[0] ?? rawResult;
    res.json({
      unread: Number(r?.unread ?? 0),
      overdue: Number(r?.overdue ?? 0),
      dueToday: Number(r?.due_today ?? 0),
      pending: Number(r?.pending ?? 0),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/", async (req: AuthRequest, res) => {
  try {
    if (!req.clinicId && !req.isSuperAdmin) {
      res.status(400).json({ error: "Bad Request", message: "Clínica não identificada" });
      return;
    }

    const filter = req.query.filter as string | undefined;
    const status = req.query.status as string | undefined;
    const type = req.query.type as string | undefined;
    const patientIdRaw = req.query.patientId as string | undefined;
    const patientId = patientIdRaw ? parseInt(patientIdRaw) : null;

    const conditions: any[] = [];
    if (req.clinicId) conditions.push(eq(notesTable.clinicId, req.clinicId));

    if (filter === "assigned") {
      conditions.push(
        or(
          eq(notesTable.assignedTo, req.userId!),
          isNull(notesTable.assignedTo),
        )!
      );
    } else if (filter === "created") {
      conditions.push(eq(notesTable.createdBy, req.userId!));
    } else if (!req.isSuperAdmin) {
      conditions.push(
        or(
          eq(notesTable.assignedTo, req.userId!),
          eq(notesTable.createdBy, req.userId!),
          isNull(notesTable.assignedTo),
        )!
      );
    }

    if (status) conditions.push(eq(notesTable.status, status));
    if (type) conditions.push(eq(notesTable.type, type));
    if (patientId && !isNaN(patientId)) conditions.push(eq(notesTable.patientId, patientId));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const creator = db.select({
      id: usersTable.id,
      name: usersTable.name,
    }).from(usersTable).as("creator");

    const assignee = db.select({
      id: usersTable.id,
      name: usersTable.name,
    }).from(usersTable).as("assignee");

    const patient = db.select({
      id: patientsTable.id,
      name: patientsTable.name,
    }).from(patientsTable).as("patient_ref");

    const rows = await db
      .select({
        id: notesTable.id,
        clinicId: notesTable.clinicId,
        createdBy: notesTable.createdBy,
        assignedTo: notesTable.assignedTo,
        patientId: notesTable.patientId,
        type: notesTable.type,
        title: notesTable.title,
        body: notesTable.body,
        priority: notesTable.priority,
        status: notesTable.status,
        dueAt: notesTable.dueAt,
        completedAt: notesTable.completedAt,
        seenAt: notesTable.seenAt,
        createdAt: notesTable.createdAt,
        updatedAt: notesTable.updatedAt,
        creatorName: creator.name,
        assigneeName: assignee.name,
        patientName: patient.name,
      })
      .from(notesTable)
      .leftJoin(creator, eq(notesTable.createdBy, creator.id))
      .leftJoin(assignee, eq(notesTable.assignedTo, assignee.id))
      .leftJoin(patient, eq(notesTable.patientId, patient.id))
      .where(where)
      .orderBy(sql`
        CASE
          WHEN ${notesTable.status} = 'concluido' THEN 2
          WHEN ${notesTable.priority} = 'urgente' THEN 0
          ELSE 1
        END,
        CASE ${notesTable.priority}
          WHEN 'urgente' THEN 0
          WHEN 'alta' THEN 1
          WHEN 'normal' THEN 2
          ELSE 3
        END,
        ${notesTable.dueAt} ASC NULLS LAST,
        ${notesTable.createdAt} DESC
      `);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/", async (req: AuthRequest, res) => {
  try {
    if (!req.clinicId) {
      res.status(400).json({ error: "Bad Request", message: "Clínica não identificada" });
      return;
    }

    const { title, body, type, priority, assignedTo, patientId, dueAt } = req.body;
    if (!title?.trim()) {
      res.status(400).json({ error: "Bad Request", message: "Título é obrigatório" });
      return;
    }

    const [note] = await db.insert(notesTable).values({
      clinicId: req.clinicId,
      createdBy: req.userId!,
      assignedTo: assignedTo ?? null,
      patientId: patientId ?? null,
      type: type ?? "tarefa",
      title: title.trim(),
      body: body ?? null,
      priority: priority ?? "normal",
      status: "pendente",
      dueAt: dueAt ? new Date(dueAt) : null,
    }).returning();

    res.status(201).json(note);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/:id", async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const cond = req.isSuperAdmin && !req.clinicId
      ? eq(notesTable.id, id)
      : and(eq(notesTable.id, id), eq(notesTable.clinicId, req.clinicId!));

    const [note] = await db.select().from(notesTable).where(cond);
    if (!note) { res.status(404).json({ error: "Not Found" }); return; }

    if (!req.isSuperAdmin && note.assignedTo !== req.userId && note.createdBy !== req.userId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    res.json(note);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/:id", async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const cond = req.isSuperAdmin && !req.clinicId
      ? eq(notesTable.id, id)
      : and(eq(notesTable.id, id), eq(notesTable.clinicId, req.clinicId!));

    const [existing] = await db.select().from(notesTable).where(cond);
    if (!existing) { res.status(404).json({ error: "Not Found" }); return; }

    if (!req.isSuperAdmin && existing.createdBy !== req.userId) {
      res.status(403).json({ error: "Forbidden", message: "Apenas o criador pode editar este item" }); return;
    }

    const { title, body, type, priority, status, assignedTo, patientId, dueAt } = req.body;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (title !== undefined) updates.title = title.trim();
    if (body !== undefined) updates.body = body ?? null;
    if (type !== undefined) updates.type = type;
    if (priority !== undefined) updates.priority = priority;
    if (status !== undefined) {
      updates.status = status;
      if (status === "concluido" && !existing.completedAt) {
        updates.completedAt = new Date();
      } else if (status !== "concluido") {
        updates.completedAt = null;
      }
    }
    if (assignedTo !== undefined) updates.assignedTo = assignedTo ?? null;
    if (patientId !== undefined) updates.patientId = patientId ?? null;
    if (dueAt !== undefined) updates.dueAt = dueAt ? new Date(dueAt) : null;

    const [note] = await db.update(notesTable).set(updates as any).where(cond).returning();
    res.json(note);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/:id", async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const cond = req.isSuperAdmin && !req.clinicId
      ? eq(notesTable.id, id)
      : and(eq(notesTable.id, id), eq(notesTable.clinicId, req.clinicId!));

    const [existing] = await db.select().from(notesTable).where(cond);
    if (!existing) { res.status(404).json({ error: "Not Found" }); return; }

    if (!req.isSuperAdmin && existing.createdBy !== req.userId) {
      res.status(403).json({ error: "Forbidden", message: "Apenas o criador pode excluir este item" }); return;
    }

    await db.delete(notesTable).where(cond);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/:id/complete", async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const cond = req.isSuperAdmin && !req.clinicId
      ? eq(notesTable.id, id)
      : and(eq(notesTable.id, id), eq(notesTable.clinicId, req.clinicId!));

    const [existing] = await db.select().from(notesTable).where(cond);
    if (!existing) { res.status(404).json({ error: "Not Found" }); return; }

    if (!req.isSuperAdmin && existing.assignedTo !== req.userId && existing.createdBy !== req.userId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const isDone = existing.status === "concluido";
    const [note] = await db.update(notesTable).set({
      status: isDone ? "pendente" : "concluido",
      completedAt: isDone ? null : new Date(),
      updatedAt: new Date(),
    }).where(cond).returning();

    res.json(note);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/:id/seen", async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const cond = req.isSuperAdmin && !req.clinicId
      ? eq(notesTable.id, id)
      : and(eq(notesTable.id, id), eq(notesTable.clinicId, req.clinicId!));

    const [existing] = await db.select().from(notesTable).where(cond);
    if (!existing || existing.seenAt) { res.json(existing ?? {}); return; }

    if (existing.assignedTo !== req.userId) { res.json(existing); return; }

    const [note] = await db.update(notesTable).set({
      seenAt: new Date(),
      updatedAt: new Date(),
    }).where(cond).returning();

    res.json(note);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
