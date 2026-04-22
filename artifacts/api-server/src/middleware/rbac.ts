import { Response, NextFunction } from "express";
import { resolvePermissions, type Permission, type Role } from "@workspace/db";
import type { AuthRequest } from "./auth.js";

export function requirePermission(permission: Permission) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const roles = (req.userRoles ?? []) as Role[];
    const perms = resolvePermissions(roles, req.isSuperAdmin);

    if (!perms.has(permission)) {
      res.status(403).json({
        error: "Forbidden",
        message: `Permission required: ${permission}`,
      });
      return;
    }

    next();
  };
}

export function requireSuperAdmin() {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.isSuperAdmin) {
      res.status(403).json({
        error: "Forbidden",
        message: "Super admin access required",
      });
      return;
    }
    next();
  };
}
