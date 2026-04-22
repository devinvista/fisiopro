import { Router, type NextFunction, type Request, type Response } from "express";
import { authMiddleware, type AuthRequest } from "../../middleware/auth.js";
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
    res.status(201).json(await authService.register(body));
  }),
);

router.post(
  "/login",
  handle(async (req, res) => {
    const body = validateBody(loginSchema, req.body, res);
    if (!body) return;
    res.json(await authService.login(body));
  }),
);

router.post(
  "/switch-clinic",
  authMiddleware,
  handle(async (req, res) => {
    const authReq = req as AuthRequest;
    const body = validateBody(switchClinicSchema, req.body, res);
    if (!body) return;
    res.json(
      await authService.switchClinic({
        userId: authReq.userId!,
        userName: authReq.userName,
        isSuperAdmin: !!authReq.isSuperAdmin,
        clinicId: body.clinicId ?? null,
      }),
    );
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
