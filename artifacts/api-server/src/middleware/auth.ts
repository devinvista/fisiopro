import { randomBytes } from "crypto";
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "@workspace/db";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET environment variable must be set in production.");
  } else {
    console.warn(
      "[auth] WARNING: JWT_SECRET não definido. Um segredo aleatório será usado — todos os tokens serão invalidados ao reiniciar. Defina JWT_SECRET no ambiente."
    );
  }
}

const secret = JWT_SECRET ?? randomBytes(64).toString("hex");

export interface AuthRequest extends Request {
  userId?: number;
  userName?: string | null;
  userRoles?: Role[];
  clinicId?: number | null;
  isSuperAdmin?: boolean;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized", message: "No token provided" });
    return;
  }

  const token = authHeader.substring(7);
  try {
    const payload = jwt.verify(token, secret) as {
      userId: number;
      userName?: string | null;
      roles: Role[];
      clinicId?: number | null;
      isSuperAdmin?: boolean;
    };
    req.userId = payload.userId;
    req.userName = payload.userName ?? null;
    req.userRoles = payload.roles ?? [];
    req.clinicId = payload.clinicId ?? null;
    req.isSuperAdmin = payload.isSuperAdmin ?? false;
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized", message: "Invalid token" });
  }
}

export function generateToken(
  userId: number,
  roles: Role[],
  clinicId: number | null,
  isSuperAdmin: boolean,
  userName?: string | null
): string {
  return jwt.sign({ userId, userName: userName ?? null, roles, clinicId, isSuperAdmin }, secret, { expiresIn: "7d" });
}
