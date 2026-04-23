import { Router, type Response } from "express";
import { authMiddleware, AuthRequest } from "../../../middleware/auth.js";
import { requirePermission } from "../../../middleware/rbac.js";
import { parseIntParam, validateBody, validateQuery } from "../../../utils/validate.js";
import { listQuerySchema } from "../../../utils/listQuery.js";
import { z } from "zod/v4";

const listAppointmentsQuerySchema = listQuerySchema.extend({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date deve estar no formato YYYY-MM-DD").optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate deve estar no formato YYYY-MM-DD").optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "endDate deve estar no formato YYYY-MM-DD").optional(),
  patientId: z.union([z.string(), z.number()]).optional().transform((v) => (v === undefined ? undefined : String(v))),
  /** Compat: `?status=` aqui aceita string única (não lista). */
  status: z.string().trim().min(1).optional(),
});
import {
  createAppointmentSchema, updateAppointmentSchema, rescheduleSchema,
  recurringAppointmentSchema,
} from "./appointments.schemas.js";
import {
  listAppointments, getAvailableSlots, createAppointment, getAppointment,
  updateAppointment, deleteAppointment, rescheduleAppointment,
  completeAppointment, createRecurringAppointments, type AuthCtx,
} from "./appointments.service.js";
import { AppointmentError } from "./appointments.errors.js";
import type { Role } from "@workspace/db";

const router = Router();
router.use(authMiddleware);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCtx(req: AuthRequest): AuthCtx {
  return {
    userId: req.userId,
    userName: req.userName ?? null,
    userRoles: (req.userRoles ?? []) as Role[],
    isSuperAdmin: req.isSuperAdmin,
    clinicId: req.clinicId ?? null,
  };
}

function handleError(err: unknown, res: Response): void {
  if (err instanceof AppointmentError) {
    res.status(err.httpStatus).json({ error: err.code, message: err.message, ...(err.extra ?? {}) });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal Server Error" });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get("/", requirePermission("appointments.read"), async (req: AuthRequest, res) => {
  try {
    const q = validateQuery(listAppointmentsQuerySchema, req.query, res);
    if (!q) return;
    const data = await listAppointments(
      {
        date: q.date,
        startDate: q.startDate,
        endDate: q.endDate,
        patientId: q.patientId,
        status: q.status,
        limit: q.limit,
        cursor: q.cursor,
      },
      getCtx(req),
    );
    res.json(data);
  } catch (err) {
    handleError(err, res);
  }
});

router.get("/available-slots", requirePermission("appointments.read"), async (req, res) => {
  try {
    const { date, procedureId, scheduleId, clinicStart, clinicEnd } = req.query;
    const data = await getAvailableSlots(
      {
        date: date as string | undefined,
        procedureId: procedureId as string | undefined,
        scheduleId: scheduleId as string | undefined,
        clinicStart: clinicStart as string | undefined,
        clinicEnd: clinicEnd as string | undefined,
      },
      getCtx(req as AuthRequest),
    );
    res.json(data);
  } catch (err) {
    handleError(err, res);
  }
});

router.post("/", requirePermission("appointments.create"), async (req: AuthRequest, res) => {
  try {
    const body = validateBody(createAppointmentSchema, req.body, res);
    if (!body) return;
    const created = await createAppointment(body as any, getCtx(req));
    res.status(201).json(created);
  } catch (err) {
    handleError(err, res);
  }
});

router.get("/:id", requirePermission("appointments.read"), async (req, res) => {
  try {
    const id = parseIntParam(req.params.id, res, "ID do agendamento");
    if (id === null) return;
    const data = await getAppointment(id, getCtx(req as AuthRequest));
    res.json(data);
  } catch (err) {
    handleError(err, res);
  }
});

router.put("/:id", requirePermission("appointments.update"), async (req, res) => {
  try {
    const id = parseIntParam(req.params.id, res, "ID do agendamento");
    if (id === null) return;
    const body = validateBody(updateAppointmentSchema, req.body, res);
    if (!body) return;
    const data = await updateAppointment(id, body as any, getCtx(req as AuthRequest));
    res.json(data);
  } catch (err) {
    handleError(err, res);
  }
});

router.delete("/:id", requirePermission("appointments.delete"), async (req, res) => {
  try {
    const id = parseIntParam(req.params.id, res, "ID do agendamento");
    if (id === null) return;
    await deleteAppointment(id, getCtx(req as AuthRequest));
    res.status(204).send();
  } catch (err) {
    handleError(err, res);
  }
});

// ─── Reschedule (atomic: mark old as remarcado + create new) ─────────────────
router.post("/:id/reschedule", requirePermission("appointments.create"), async (req: AuthRequest, res) => {
  try {
    const id = parseIntParam(req.params.id, res, "ID do agendamento");
    if (id === null) return;
    const body = validateBody(rescheduleSchema, req.body, res);
    if (!body) return;
    const data = await rescheduleAppointment(id, body as any, getCtx(req));
    res.status(201).json(data);
  } catch (err) {
    handleError(err, res);
  }
});

// ─── Complete ─────────────────────────────────────────────────────────────────
router.post("/:id/complete", requirePermission("appointments.update"), async (req, res) => {
  try {
    const id = parseIntParam(req.params.id, res, "ID do agendamento");
    if (id === null) return;
    const data = await completeAppointment(id, getCtx(req as AuthRequest));
    res.json(data);
  } catch (err) {
    handleError(err, res);
  }
});

// ─── Recurring ────────────────────────────────────────────────────────────────
router.post("/recurring", requirePermission("appointments.create"), async (req: AuthRequest, res) => {
  try {
    const body = validateBody(recurringAppointmentSchema, req.body, res);
    if (!body) return;
    const data = await createRecurringAppointments(body as any, getCtx(req));
    res.status(201).json(data);
  } catch (err) {
    handleError(err, res);
  }
});

export default router;
