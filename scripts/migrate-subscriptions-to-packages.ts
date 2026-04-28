/**
 * migrate-subscriptions-to-packages.ts — Sprint 1.
 *
 * Copia os dados de recorrência de `patient_subscriptions` para os campos
 * novos em `patient_packages`. Idempotente.
 *
 * Estratégia:
 *  1. Para cada subscription ATIVA, procura um patient_package compatível
 *     (mesmo paciente + procedure + sem `recurrence_status` preenchido)
 *     vinculado ao mesmo template (`packages.package_type` mensal/consolidada).
 *  2. Se encontrar, copia: billing_day, monthly_amount, next_billing_date,
 *     recurrence_status (= status), recurrence_type (= subscription_type).
 *  3. Se NÃO encontrar package compatível, registra na lista "órfãos".
 *
 * Uso:
 *   pnpm tsx scripts/migrate-subscriptions-to-packages.ts                # DRY-RUN (default)
 *   pnpm tsx scripts/migrate-subscriptions-to-packages.ts --apply        # aplica
 */
import { db } from "../lib/db/src";
import { sql } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");

interface SubRow {
  id: number;
  patient_id: number;
  procedure_id: number;
  start_date: string;
  billing_day: number;
  monthly_amount: string;
  status: string;
  subscription_type: string;
  next_billing_date: string | null;
  clinic_id: number | null;
}

interface PkgRow {
  id: number;
  patient_id: number;
  procedure_id: number;
  package_id: number | null;
  recurrence_status: string | null;
  start_date: string;
  package_type: string | null;
}

async function rows<T = any>(text: string): Promise<T[]> {
  const r: any = await db.execute(sql.raw(text));
  return (Array.isArray(r) ? r : (r?.rows ?? [])) as T[];
}

async function main() {
  console.log(`\n=== migrate-subscriptions-to-packages ${APPLY ? "(APPLY)" : "(DRY-RUN)"} ===\n`);

  const subs = await rows<SubRow>(`
    SELECT id, patient_id, procedure_id, start_date, billing_day,
           monthly_amount::text AS monthly_amount, status, subscription_type,
           next_billing_date, clinic_id
    FROM patient_subscriptions
    WHERE status = 'ativa'
    ORDER BY id
  `);

  console.log(`Subscriptions ATIVAS: ${subs.length}`);

  if (subs.length === 0) {
    console.log("Nada a migrar (nenhuma subscription ativa).");
    return;
  }

  const candidatePkgs = await rows<PkgRow>(`
    SELECT pp.id, pp.patient_id, pp.procedure_id, pp.package_id,
           pp.recurrence_status, pp.start_date, p.package_type
    FROM patient_packages pp
    LEFT JOIN packages p ON p.id = pp.package_id
    WHERE pp.recurrence_status IS NULL
      AND (p.package_type IN ('mensal','faturaConsolidada') OR pp.package_id IS NULL)
  `);

  let matched = 0;
  let orphan = 0;
  const updates: Array<{ subId: number; pkgId: number; subType: string; billingDay: number }> = [];
  const orphans: SubRow[] = [];

  for (const sub of subs) {
    // Busca um pacote do mesmo paciente+procedimento, ainda sem recorrência.
    // Preferência: pacote cujo template seja do tipo correto (mensal vs consolidada).
    const candidates = candidatePkgs.filter(
      (p) =>
        p.patient_id === sub.patient_id &&
        p.procedure_id === sub.procedure_id,
    );

    let chosen: PkgRow | undefined;
    if (sub.subscription_type === "mensal") {
      chosen = candidates.find((p) => p.package_type === "mensal") ?? candidates[0];
    } else if (sub.subscription_type === "faturaConsolidada") {
      chosen = candidates.find((p) => p.package_type === "faturaConsolidada") ?? candidates[0];
    } else {
      chosen = candidates[0];
    }

    if (!chosen) {
      orphan++;
      orphans.push(sub);
      continue;
    }

    matched++;
    updates.push({
      subId: sub.id,
      pkgId: chosen.id,
      subType: sub.subscription_type,
      billingDay: sub.billing_day,
    });

    // Remove do pool para não casar duas vezes.
    const idx = candidatePkgs.indexOf(chosen);
    if (idx >= 0) candidatePkgs.splice(idx, 1);
  }

  console.log(`Matches encontrados: ${matched}`);
  console.log(`Órfãos (sem pacote correspondente): ${orphan}`);

  if (orphans.length > 0) {
    console.log("\nÓrfãos (recomendação: criar patient_package retroativo ou cancelar a subscription):");
    for (const o of orphans) {
      console.log(`  - sub#${o.id} paciente=${o.patient_id} proc=${o.procedure_id} tipo=${o.subscription_type} dia=${o.billing_day}`);
    }
  }

  if (!APPLY) {
    console.log("\n[DRY-RUN] Nenhuma alteração foi aplicada. Use --apply para gravar.\n");
    return;
  }

  console.log("\nAplicando updates...");
  let updated = 0;
  for (const u of updates) {
    await db.execute(sql`
      UPDATE patient_packages SET
        billing_day        = (SELECT billing_day        FROM patient_subscriptions WHERE id = ${u.subId}),
        monthly_amount     = (SELECT monthly_amount     FROM patient_subscriptions WHERE id = ${u.subId}),
        next_billing_date  = (SELECT next_billing_date  FROM patient_subscriptions WHERE id = ${u.subId}),
        recurrence_status  = (SELECT status             FROM patient_subscriptions WHERE id = ${u.subId}),
        recurrence_type    = (SELECT subscription_type  FROM patient_subscriptions WHERE id = ${u.subId})
      WHERE id = ${u.pkgId}
        AND recurrence_status IS NULL
    `);
    updated++;
  }
  console.log(`OK: ${updated} patient_packages atualizados.\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
