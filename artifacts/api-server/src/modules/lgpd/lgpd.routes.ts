import { Router, type NextFunction, type Request, type Response } from "express";
import { authMiddleware, type AuthRequest } from "../../middleware/auth.js";
import { parseIntParam, validateBody } from "../../utils/validate.js";
import { LgpdError, lgpdService } from "./lgpd.service.js";
import { acceptPolicySchema, policyTypeSchema } from "./lgpd.schemas.js";

const router = Router();

function handle(fn: (req: Request, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof LgpdError) {
        res.status(err.status).json({ error: err.code, message: err.message });
        return;
      }
      next(err);
    }
  };
}

function clientIp(req: Request): string | null {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0]!.trim();
  }
  return req.ip ?? null;
}

// ─── Public endpoints (no auth) ───────────────────────────────────────────

router.get(
  "/policies/current",
  handle(async (_req, res) => {
    const docs = await lgpdService.getCurrentPolicies();
    res.json({ items: docs });
  }),
);

router.get(
  "/policies/:type/current",
  handle(async (req, res) => {
    const parsed = policyTypeSchema.safeParse(req.params.type);
    if (!parsed.success) {
      res.status(400).json({ error: "Bad Request", message: "Tipo inválido" });
      return;
    }
    const doc = await lgpdService.getCurrentPolicyByType(parsed.data);
    res.json(doc);
  }),
);

router.get(
  "/policies/:type/history",
  handle(async (req, res) => {
    const parsed = policyTypeSchema.safeParse(req.params.type);
    if (!parsed.success) {
      res.status(400).json({ error: "Bad Request", message: "Tipo inválido" });
      return;
    }
    const items = await lgpdService.getPolicyHistory(parsed.data);
    res.json({ items });
  }),
);

// ─── Authenticated endpoints ──────────────────────────────────────────────

router.use(authMiddleware);

router.get(
  "/me/status",
  handle(async (req, res) => {
    const authReq = req as AuthRequest;
    const status = await lgpdService.getUserStatus(authReq.userId!);
    res.json(status);
  }),
);

router.post(
  "/me/accept",
  handle(async (req, res) => {
    const authReq = req as AuthRequest;
    const body = validateBody(acceptPolicySchema, req.body, res);
    if (!body) return;
    const result = await lgpdService.acceptPolicy({
      userId: authReq.userId!,
      userName: authReq.userName ?? null,
      policyDocumentId: body.policyDocumentId,
      ip: clientIp(req),
      userAgent: req.headers["user-agent"] ?? null,
    });
    res.status(201).json(result);
  }),
);

router.get(
  "/patients/:patientId/export",
  handle(async (req, res) => {
    const authReq = req as AuthRequest;
    const patientId = parseIntParam(req.params.patientId, res, "ID do paciente");
    if (patientId === null) return;
    const data = await lgpdService.exportPatientData({
      patientId,
      requestedByUserId: authReq.userId!,
      requestedByUserName: authReq.userName ?? null,
    });
    const filename = `paciente-${patientId}-lgpd-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.json(data);
  }),
);

export default router;
