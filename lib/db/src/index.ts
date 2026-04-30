import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const rawConnectionString = process.env.DATABASE_URL;

const sslmodeMatch = rawConnectionString.match(/[?&]sslmode=([^&]+)/i);
const sslmode = sslmodeMatch?.[1]?.toLowerCase();
const ssl =
  sslmode && sslmode !== "disable" && sslmode !== "allow"
    ? { rejectUnauthorized: sslmode === "verify-ca" || sslmode === "verify-full" }
    : undefined;

const connectionString = rawConnectionString
  .replace(/([?&])sslmode=[^&]*&?/i, "$1")
  .replace(/[?&]$/, "");

export const pool = new Pool({
  connectionString,
  ssl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  allowExitOnIdle: false,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
