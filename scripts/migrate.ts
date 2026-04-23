/**
 * Aplica migrations pendentes em produção e desenvolvimento.
 *
 * Uso:
 *   pnpm db:migrate           — aplica migrations pendentes (idempotente)
 *   pnpm db:migrate -- --baseline
 *                             — uso único em DBs já existentes (criadas via
 *                               drizzle-kit push). Cria a tabela
 *                               `__drizzle_migrations` e registra TODAS as
 *                               migrations atuais como já aplicadas, sem
 *                               executá-las.
 */

import path from "path";
import { fileURLToPath } from "url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import fs from "fs";
import crypto from "crypto";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.resolve(__dirname, "..", "lib", "db", "migrations");

if (!process.env.DATABASE_URL) {
  console.error("[migrate] DATABASE_URL não definido.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function applyMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR) || fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).length === 0) {
    console.log("[migrate] Nenhuma migration encontrada — nada a aplicar.");
    return;
  }
  console.log("[migrate] Aplicando migrations pendentes...");
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR, migrationsTable: "__drizzle_migrations" });
  console.log("[migrate] OK.");
}

interface MigrationJournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

async function baselineExistingDb() {
  console.log("[migrate] Modo BASELINE — registrando migrations atuais como aplicadas (não executa SQL).");
  const journalPath = path.join(MIGRATIONS_DIR, "meta", "_journal.json");
  if (!fs.existsSync(journalPath)) {
    console.error("[migrate] _journal.json não encontrado. Rode `pnpm db:generate` primeiro.");
    process.exit(1);
  }

  const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8")) as { entries: MigrationJournalEntry[] };

  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS drizzle;
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    );
  `);

  for (const entry of journal.entries) {
    const sqlPath = path.join(MIGRATIONS_DIR, `${entry.tag}.sql`);
    if (!fs.existsSync(sqlPath)) {
      console.warn(`[migrate] arquivo ${entry.tag}.sql não encontrado — pulando`);
      continue;
    }
    const content = fs.readFileSync(sqlPath, "utf-8");
    const hash = crypto.createHash("sha256").update(content).digest("hex");
    const exists = await pool.query("SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = $1", [hash]);
    if (exists.rowCount && exists.rowCount > 0) {
      console.log(`[migrate] [skip] ${entry.tag} já registrado`);
      continue;
    }
    await pool.query(
      "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)",
      [hash, entry.when],
    );
    console.log(`[migrate] [baseline] ${entry.tag} registrado como aplicado`);
  }
}

const isBaseline = process.argv.includes("--baseline");

(async () => {
  try {
    if (isBaseline) {
      await baselineExistingDb();
    } else {
      await applyMigrations();
    }
  } catch (err) {
    console.error("[migrate] erro:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
