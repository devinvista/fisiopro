import { Router, type NextFunction, type Request, type Response } from "express";
import { authMiddleware, type AuthRequest } from "../../middleware/auth.js";
import { setAuthCookie, clearAuthCookie, clearCsrfCookie } from "../../middleware/cookies.js";
import { validateBody } from "../../utils/validate.js";
import { AuthError, authService } from "./auth.service.js";
import { loginSchema, registerSchema, switchClinicSchema } from "./auth.schemas.js";

const router = Router();

function handle(fn: (req: Request, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof AuthError) {
        res.status(err.status).json({ error: err.code, message: err.message });
        return;
      }
      console.error(err);
      next(err);
    }
  };
}

router.post(
  "/register",
  handle(async (req, res) => {
    const body = validateBody(registerSchema, req.body, res);
    if (!body) return;
    const result = await authService.register(body);
    setAuthCookie(res, result.token);
    res.status(201).json(result);
  }),
);

router.post(
  "/login",
  handle(async (req, res) => {
    const body = validateBody(loginSchema, req.body, res);
    if (!body) return;
    const result = await authService.login(body);
    setAuthCookie(res, result.token);
    res.json(result);
  }),
);

router.post(
  "/logout",
  handle(async (_req, res) => {
    clearAuthCookie(res);
    clearCsrfCookie(res);
    res.json({ ok: true });
  }),
);

router.post(
  "/switch-clinic",
  authMiddleware,
  handle(async (req, res) => {
    const authReq = req as AuthRequest;
    const body = validateBody(switchClinicSchema, req.body, res);
    if (!body) return;
    const result = await authService.switchClinic({
      userId: authReq.userId!,
      userName: authReq.userName,
      isSuperAdmin: !!authReq.isSuperAdmin,
      clinicId: body.clinicId ?? null,
    });
    setAuthCookie(res, result.token);
    res.json(result);
  }),
);

router.get(
  "/me",
  authMiddleware,
  handle(async (req, res) => {
    const authReq = req as AuthRequest;
    res.json(
      await authService.getMe({
        userId: authReq.userId!,
        activeClinicId: authReq.clinicId ?? null,
        fallbackRoles: authReq.userRoles,
      }),
    );
  }),
);

export default router;
