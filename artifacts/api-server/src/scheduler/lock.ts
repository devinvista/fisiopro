import { pool } from "@workspace/db";

/**
 * Hash determinístico de uma string para um inteiro 32-bit assinado, usado
 * como chave para `pg_advisory_lock`.
 */
function hashKey(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = Math.imul(31, h) + name.charCodeAt(i);
    h |= 0;
  }
  return h;
}

/**
 * Tenta adquirir um lock advisory de sessão. Retorna `true` se conseguiu,
 * `false` se outro processo já tem o lock.
 *
 * Uso: jobs do scheduler em ambiente com múltiplas réplicas — apenas uma
 * instância executa o job.
 */
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function tryAcquireAdvisoryLock(name: string): Promise<{
  acquired: boolean;
  release: () => Promise<void>;
}> {
  const key = hashKey(`fisiogest:scheduler:${name}`);

  // Retry curto para tolerar erros transitórios do Postgres serverless
  // (ex.: Neon "Control plane request failed" durante cold-start/scale).
  const maxAttempts = 3;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let client;
    try {
      client = await pool.connect();
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        await sleep(200 * attempt);
        continue;
      }
      throw err;
    }
    try {
      const { rows } = await client.query<{ pg_try_advisory_lock: boolean }>(
        "SELECT pg_try_advisory_lock($1)",
        [key],
      );
      const acquired = rows[0]?.pg_try_advisory_lock === true;
      if (!acquired) {
        client.release();
        return { acquired: false, release: async () => undefined };
      }
      return {
        acquired: true,
        release: async () => {
          try {
            await client.query("SELECT pg_advisory_unlock($1)", [key]);
          } finally {
            client.release();
          }
        },
      };
    } catch (err) {
      client.release();
      lastErr = err;
      if (attempt < maxAttempts) {
        await sleep(200 * attempt);
        continue;
      }
      throw err;
    }
  }
  // Inalcançável, mas mantém o tipo coerente.
  throw lastErr ?? new Error("tryAcquireAdvisoryLock: erro desconhecido");
}
