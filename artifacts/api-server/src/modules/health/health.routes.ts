import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { logger } from "../../lib/logger.js";

const router: IRouter = Router();

const startedAt = Date.now();

async function checkDatabase(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  const t0 = Date.now();
  try {
    await pool.query("SELECT 1");
    return { ok: true, latencyMs: Date.now() - t0 };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err: message }, "[health] database check failed");
    return { ok: false, error: message };
  }
}

router.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

router.get("/health", async (_req, res) => {
  const db = await checkDatabase();
  const status = db.ok ? "ok" : "degraded";
  const code = db.ok ? 200 : 503;
  res.status(code).json({
    status,
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? "0.0.0",
    db,
  });
});

export default router;
