import { Router, type IRouter } from "express";
import { readFileSync } from "fs";
import { resolve } from "path";
import { pool } from "@workspace/db";
import { logger } from "../../lib/logger.js";

const router: IRouter = Router();

const startedAt = Date.now();
const startedAtIso = new Date().toISOString();

function readRootPackageVersion(): string {
  const candidates = [
    resolve(process.cwd(), "package.json"),
    resolve(process.cwd(), "../../package.json"),
    resolve(process.cwd(), "../../../package.json"),
  ];
  for (const p of candidates) {
    try {
      const pkg = JSON.parse(readFileSync(p, "utf-8"));
      if (pkg.name === "fisiogest-pro" && typeof pkg.version === "string") {
        return pkg.version;
      }
    } catch {
      // try next
    }
  }
  return process.env.npm_package_version ?? "0.0.0";
}

function readGitCommit(): string {
  const fromEnv =
    process.env.GIT_COMMIT ?? process.env.REPL_COMMIT_SHA ?? process.env.SOURCE_COMMIT;
  if (fromEnv) return fromEnv.slice(0, 12);
  const candidates = [
    resolve(process.cwd(), ".git"),
    resolve(process.cwd(), "../../.git"),
    resolve(process.cwd(), "../../../.git"),
  ];
  for (const gitDir of candidates) {
    try {
      const head = readFileSync(resolve(gitDir, "HEAD"), "utf-8").trim();
      if (head.startsWith("ref: ")) {
        const ref = head.slice(5).trim();
        const sha = readFileSync(resolve(gitDir, ref), "utf-8").trim();
        return sha.slice(0, 12);
      }
      return head.slice(0, 12);
    } catch {
      // try next
    }
  }
  return "unknown";
}

const VERSION = readRootPackageVersion();
const COMMIT = readGitCommit();
const BUILT_AT = process.env.BUILD_TIME ?? startedAtIso;

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
    version: VERSION,
    db,
  });
});

router.get("/version", (_req, res) => {
  res.json({
    name: "fisiogest-pro",
    version: VERSION,
    commit: COMMIT,
    builtAt: BUILT_AT,
    startedAt: startedAtIso,
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    nodeVersion: process.version,
    env: process.env.NODE_ENV ?? "development",
  });
});

export default router;
