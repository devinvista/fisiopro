import { Router, type Request, type Response, type NextFunction } from "express";
import { validateBody, validateQuery } from "../../utils/validate.js";
import {
  availableSlotsQuerySchema,
  bookSchema,
  patientLookupQuerySchema,
  proceduresQuerySchema,
  schedulesQuerySchema,
} from "./public.schemas.js";
import { PublicError, publicService } from "./public.service.js";

const router = Router();

function handle(fn: (req: Request, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof PublicError) {
        res.status(err.status).json({ error: err.code, message: err.message });
        return;
      }
      console.error(err);
      next(err);
    }
  };
}

// GET /api/public/plans
router.get(
  "/plans",
  handle(async (_req, res) => {
    res.json(await publicService.listPlans());
  }),
);

// GET /api/public/patient-lookup
router.get(
  "/patient-lookup",
  handle(async (req, res) => {
    const query = validateQuery(patientLookupQuerySchema, req.query, res);
    if (!query) {
      res.json({ found: false });
      return;
    }
    res.json(await publicService.lookupPatient(query.q));
  }),
);

// GET /api/public/procedures
router.get(
  "/procedures",
  handle(async (req, res) => {
    const query = validateQuery(proceduresQuerySchema, req.query, res);
    if (!query) return;
    res.json(await publicService.listProcedures(query.clinicId ?? null));
  }),
);

// GET /api/public/schedules
router.get(
  "/schedules",
  handle(async (req, res) => {
    const query = validateQuery(schedulesQuerySchema, req.query, res);
    if (!query) return;
    res.json(await publicService.listSchedules(query.clinicId));
  }),
);

// GET /api/public/available-slots
router.get(
  "/available-slots",
  handle(async (req, res) => {
    const query = validateQuery(availableSlotsQuerySchema, req.query, res);
    if (!query) return;
    res.json(
      await publicService.getAvailableSlots({
        date: query.date,
        procedureId: query.procedureId,
        clinicId: query.clinicId ?? null,
        scheduleId: query.scheduleId ?? null,
      }),
    );
  }),
);

// POST /api/public/book
router.post(
  "/book",
  handle(async (req, res) => {
    const body = validateBody(bookSchema, req.body, res);
    if (!body) return;
    res.status(201).json(await publicService.createBooking(body));
  }),
);

// GET /api/public/booking/:token
router.get(
  "/booking/:token",
  handle(async (req, res) => {
    res.json(await publicService.getBookingByToken(String(req.params.token)));
  }),
);

// DELETE /api/public/booking/:token
router.delete(
  "/booking/:token",
  handle(async (req, res) => {
    res.json(await publicService.cancelBooking(String(req.params.token)));
  }),
);

// GET /api/public/clinic-info
router.get(
  "/clinic-info",
  handle(async (_req, res) => {
    res.json(await publicService.getClinicInfo());
  }),
);

export default router;
