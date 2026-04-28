import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

/**
 * Adquire um lock advisory por (subscription, year, month) DENTRO de uma
 * transação Postgres. O lock é liberado automaticamente no fim da transação.
 *
 * Garante que duas instâncias do scheduler não gerem cobrança duplicada para
 * a mesma assinatura no mesmo ciclo, mesmo se o lock global do scheduler
 * falhar (defesa em profundidade).
 */
export async function withSubscriptionBillingLock<T>(
  subscriptionId: number,
  year: number,
  month: number,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // pg_advisory_xact_lock(int4, int4) — duas chaves: (subId, year*100+month)
    const second = year * 100 + month;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${subscriptionId}::int, ${second}::int)`);
    return fn(tx);
  });
}

/**
 * Sprint 1 — Lock equivalente para o novo regime que itera em `patient_packages`.
 *
 * Usa namespace de keys distinto (`-packageId` no primeiro slot) para não
 * colidir com o lock de `patient_subscriptions` durante a transição em que
 * ambos os caminhos podem rodar.
 */
export async function withPackageBillingLock<T>(
  patientPackageId: number,
  year: number,
  month: number,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const first = -Math.abs(patientPackageId);
    const second = year * 100 + month;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${first}::int, ${second}::int)`);
    return fn(tx);
  });
}
