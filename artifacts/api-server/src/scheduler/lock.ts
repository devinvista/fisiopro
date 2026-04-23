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
export async function tryAcquireAdvisoryLock(name: string): Promise<{
  acquired: boolean;
  release: () => Promise<void>;
}> {
  const key = hashKey(`fisiogest:scheduler:${name}`);
  const client = await pool.connect();
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
    throw err;
  }
}
