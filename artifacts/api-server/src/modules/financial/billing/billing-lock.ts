import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

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
