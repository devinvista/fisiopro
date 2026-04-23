import type { Store, ClientRateLimitInfo, IncrementResponse } from "express-rate-limit";
import { pool } from "@workspace/db";

/**
 * Store distribuído de rate-limit usando PostgreSQL.
 * Substitui o store em memória padrão do express-rate-limit, permitindo
 * rodar múltiplas réplicas (autoscale) sem limites duplicados/falhos.
 *
 * Cria a tabela `rate_limit_counters` automaticamente na primeira execução.
 *
 * Chave: `${prefix}:${ip}` — janela rotativa de `windowMs` ms.
 */
export class PgRateLimitStore implements Store {
  windowMs!: number;
  prefix: string;
  initialized = false;
  initPromise: Promise<void> | null = null;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  init(opts: { windowMs: number }): void {
    this.windowMs = opts.windowMs;
    void this.ensureTable();
  }

  private ensureTable(): Promise<void> {
    if (this.initialized) return Promise.resolve();
    if (this.initPromise) return this.initPromise;
    this.initPromise = pool
      .query(
        `CREATE TABLE IF NOT EXISTS rate_limit_counters (
           key TEXT PRIMARY KEY,
           hits INTEGER NOT NULL,
           reset_at TIMESTAMPTZ NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_rate_limit_reset_at ON rate_limit_counters (reset_at);`,
      )
      .then(() => {
        this.initialized = true;
      })
      .catch(() => {
        // Mantém initPromise nulo para tentar novamente
        this.initPromise = null;
      });
    return this.initPromise;
  }

  private buildKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  async increment(key: string): Promise<IncrementResponse> {
    await this.ensureTable();
    const fullKey = this.buildKey(key);
    const windowSec = Math.ceil(this.windowMs / 1000);

    const { rows } = await pool.query<{ hits: number; reset_at: Date }>(
      `INSERT INTO rate_limit_counters (key, hits, reset_at)
       VALUES ($1, 1, NOW() + ($2 || ' seconds')::interval)
       ON CONFLICT (key) DO UPDATE SET
         hits = CASE
           WHEN rate_limit_counters.reset_at <= NOW()
             THEN 1
           ELSE rate_limit_counters.hits + 1
         END,
         reset_at = CASE
           WHEN rate_limit_counters.reset_at <= NOW()
             THEN NOW() + ($2 || ' seconds')::interval
           ELSE rate_limit_counters.reset_at
         END
       RETURNING hits, reset_at`,
      [fullKey, windowSec],
    );

    const row = rows[0];
    return {
      totalHits: row.hits,
      resetTime: new Date(row.reset_at),
    };
  }

  async decrement(key: string): Promise<void> {
    const fullKey = this.buildKey(key);
    await pool.query(
      `UPDATE rate_limit_counters SET hits = GREATEST(hits - 1, 0) WHERE key = $1`,
      [fullKey],
    );
  }

  async resetKey(key: string): Promise<void> {
    const fullKey = this.buildKey(key);
    await pool.query(`DELETE FROM rate_limit_counters WHERE key = $1`, [fullKey]);
  }

  async resetAll(): Promise<void> {
    await pool.query(`DELETE FROM rate_limit_counters`);
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const fullKey = this.buildKey(key);
    const { rows } = await pool.query<{ hits: number; reset_at: Date }>(
      `SELECT hits, reset_at FROM rate_limit_counters WHERE key = $1`,
      [fullKey],
    );
    const row = rows[0];
    if (!row) return undefined;
    return { totalHits: row.hits, resetTime: new Date(row.reset_at) };
  }
}

/**
 * Limpeza periódica de chaves expiradas. Chamada uma vez no boot.
 */
export function startRateLimitCleanup(): void {
  const interval = setInterval(
    () => {
      pool
        .query(`DELETE FROM rate_limit_counters WHERE reset_at <= NOW() - interval '1 hour'`)
        .catch(() => undefined);
    },
    15 * 60 * 1000,
  );
  interval.unref?.();
}
