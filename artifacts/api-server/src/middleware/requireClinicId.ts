import type { Response, NextFunction } from "express";
import type { AuthRequest } from "./auth.js";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Safety-net middleware: rejects any state-mutating request made by an
 * authenticated non-superadmin user who has no clinicId bound to their token.
 *
 * - Superadmins are exempt (clinicId can be null for platform-level operations).
 * - Unauthenticated requests are skipped here and handled by authMiddleware.
 * - Read-only methods (GET, HEAD, OPTIONS) are always allowed through.
 *
 * This prevents null-constraint DB errors before they ever reach the
 * repository layer, and catches any future code path that forgets to
 * thread clinicId through.
 */
export function requireClinicIdForMutations(req: AuthRequest, res: Response, next: NextFunction) {
  if (!MUTATING_METHODS.has(req.method)) return next();
  if (!req.userId) return next();
  if (req.isSuperAdmin) return next();

  if (!req.clinicId) {
    res.status(403).json({
      error: "Forbidden",
      message: "Usuário não está vinculado a nenhuma clínica. Contate o administrador.",
    });
    return;
  }

  next();
}
