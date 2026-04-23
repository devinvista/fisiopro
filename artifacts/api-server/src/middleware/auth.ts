import { randomBytes } from "crypto";
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "@workspace/db";
import { AUTH_COOKIE } from "./cookies.js";

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

type CookieRequest = Request & { cookies?: Record<string, string> };

function extractToken(req: Request): string | null {
  const cookies = (req as CookieRequest).cookies;
  const cookieToken = cookies?.[AUTH_COOKIE];
  if (cookieToken) return cookieToken;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }
  return null;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized", message: "No token provided" });
    return;
  }

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
