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

// ─── Sprint 2 — Aceite público de plano de tratamento via token ──────────────
//
// GET  /api/public/treatment-plans/by-token/:token   → snapshot do plano
// POST /api/public/treatment-plans/by-token/:token/accept → consome o token
//
// Sem auth: a posse do token é a credencial. Status do token (`valid|expired|
// used|not_found`) é refletido em códigos HTTP distintos para a UI exibir
// mensagens claras.
router.get(
  "/treatment-plans/by-token/:token",
  handle(async (req, res) => {
    const token = String(req.params.token);
    const { lookupAcceptanceToken, loadPublicPlanSnapshot } = await import(
      "../clinical/medical-records/treatment-plans.tokens.js"
    );
    const lookup = await lookupAcceptanceToken(token);
    if (lookup.status === "not_found") {
      throw new PublicError(404, "not_found", "Link inválido.");
    }
    if (lookup.status === "expired") {
      throw new PublicError(410, "expired", "Este link expirou. Solicite um novo à clínica.");
    }
    if (lookup.status === "used") {
      throw new PublicError(409, "used", "Este link já foi usado.");
    }
    const snapshot = await loadPublicPlanSnapshot(lookup.tokenRow!.planId);
    if (!snapshot) {
      throw new PublicError(404, "not_found", "Plano não encontrado.");
    }
    res.json({ ...snapshot, expiresAt: lookup.tokenRow!.expiresAt.toISOString() });
  }),
);

router.post(
  "/treatment-plans/by-token/:token/accept",
  handle(async (req, res) => {
    const token = String(req.params.token);
    const body = (req.body ?? {}) as { signature?: string };
    const signature = typeof body.signature === "string" ? body.signature.trim() : "";
    if (signature.length < 3) {
      throw new PublicError(400, "signature_required", "Digite seu nome completo como assinatura.");
    }
    const { lookupAcceptanceToken, consumeAcceptanceToken } = await import(
      "../clinical/medical-records/treatment-plans.tokens.js"
    );
    const { acceptPatientTreatmentPlan } = await import(
      "../clinical/medical-records/medical-records.service.js"
    );
    const { db, treatmentPlansTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");

    const lookup = await lookupAcceptanceToken(token);
    if (lookup.status === "not_found") {
      throw new PublicError(404, "not_found", "Link inválido.");
    }
    if (lookup.status === "expired") {
      throw new PublicError(410, "expired", "Este link expirou. Solicite um novo à clínica.");
    }
    if (lookup.status === "used") {
      throw new PublicError(409, "used", "Este link já foi usado.");
    }

    const planId = lookup.tokenRow!.planId;
    const [plan] = await db
      .select({ patientId: treatmentPlansTable.patientId })
      .from(treatmentPlansTable)
      .where(eq(treatmentPlansTable.id, planId))
      .limit(1);
    if (!plan) {
      throw new PublicError(404, "not_found", "Plano não encontrado.");
    }

    const ipHeader = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
    const ip = ipHeader || req.ip || null;
    const ua = (req.headers["user-agent"] as string | undefined) ?? null;

    const updated = await acceptPatientTreatmentPlan(plan.patientId, planId, {}, {
      signature,
      ip,
      device: ua,
      via: "link",
    });

    await consumeAcceptanceToken(token);

    res.json({
      ok: true,
      planId,
      acceptedAt: (updated as any)?.acceptedAt ?? null,
    });
  }),
);

export default router;
