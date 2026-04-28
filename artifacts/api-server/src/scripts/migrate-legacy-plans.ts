/**
 * Sprint 5 — migrate-legacy-plans.ts
 *
 * Migra dados pré-Sprint 2 para o novo modelo "Plano de Tratamento como
 * fonte única de aceite/cobrança":
 *
 *   PARTE A — Planos materializados sem aceite formal
 *   ──────────────────────────────────────────────────
 *   Antes do Sprint 2, materializar um plano não criava trilha de aceite
 *   (LGPD). Esses planos têm `materializedAt IS NOT NULL` mas
 *   `acceptedAt IS NULL`. Migramos:
 *     - `acceptedAt`     ← `materializedAt` (preserva data histórica)
 *     - `acceptedVia`    ← 'legado'
 *     - `frozenPricesJson` ← snapshot dos preços vigentes dos itens (igual
 *                            ao que `acceptTreatmentPlan` faria hoje).
 *
 *   PARTE B — Subscriptions órfãs (sem plano)
 *   ─────────────────────────────────────────
 *   `patient_subscriptions` ativas que NÃO foram convertidas para
 *   `treatment_plans` pelo backfill v2 viram um "Plano Legado" novo por
 *   paciente, com 1 `treatment_plan_procedure` por subscription. O plano
 *   legado já nasce com `acceptedVia='legado'` e `acceptedAt = NOW()`.
 *   As subscriptions são canceladas (`status='cancelada'`).
 *
 * SAFETY: por padrão executa em DRY-RUN. Para aplicar passe `--apply`.
 *
 * Execução:
 *   pnpm --filter @workspace/api-server exec tsx \
 *     src/scripts/migrate-legacy-plans.ts            # dry-run
 *   pnpm --filter @workspace/api-server exec tsx \
 *     src/scripts/migrate-legacy-plans.ts --apply    # grava
 *
 * Filtros opcionais:
 *   --only-clinic <id>   restringe a uma clínica
 *   --skip-part-a        pula a Parte A
 *   --skip-part-b        pula a Parte B
 */
import { db } from "@workspace/db";
import {
  treatmentPlansTable,
  treatmentPlanProceduresTable,
  patientSubscriptionsTable,
  proceduresTable,
  packagesTable,
} from "@workspace/db";
import { and, eq, isNull, isNotNull, inArray, sql } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");
const SKIP_A = process.argv.includes("--skip-part-a");
const SKIP_B = process.argv.includes("--skip-part-b");
const ONLY_CLINIC = (() => {
  const idx = process.argv.indexOf("--only-clinic");
  if (idx === -1 || idx + 1 >= process.argv.length) return null;
  const n = Number(process.argv[idx + 1]);
  return Number.isFinite(n) ? n : null;
})();

function log(...args: unknown[]) {
  console.log("[migrate-legacy-plans]", ...args);
}

function banner() {
  log(APPLY ? ">>> APPLY: gravando mudanças <<<" : ">>> DRY-RUN (use --apply para gravar) <<<");
  if (ONLY_CLINIC != null) log(`filtro: clinicId = ${ONLY_CLINIC}`);
  if (SKIP_A) log("Parte A: PULADA (--skip-part-a)");
  if (SKIP_B) log("Parte B: PULADA (--skip-part-b)");
}

// ── PARTE A ────────────────────────────────────────────────────────────────
async function partAMaterializedWithoutAcceptance() {
  log("");
  log("── PARTE A — planos materializados sem aceite formal ──");
  const filters = [
    isNotNull(treatmentPlansTable.materializedAt),
    isNull(treatmentPlansTable.acceptedAt),
  ];
  if (ONLY_CLINIC != null) {
    filters.push(eq(treatmentPlansTable.clinicId, ONLY_CLINIC));
  }
  const plans = await db
    .select({
      id: treatmentPlansTable.id,
      patientId: treatmentPlansTable.patientId,
      materializedAt: treatmentPlansTable.materializedAt,
      status: treatmentPlansTable.status,
    })
    .from(treatmentPlansTable)
    .where(and(...filters));
  log(`encontrados: ${plans.length} planos`);

  let updated = 0;
  for (const plan of plans) {
    // Snapshot dos preços vigentes para frozenPricesJson.
    const items = await db
      .select({
        id: treatmentPlanProceduresTable.id,
        procedureId: treatmentPlanProceduresTable.procedureId,
        packageId: treatmentPlanProceduresTable.packageId,
        unitPrice: treatmentPlanProceduresTable.unitPrice,
        unitMonthlyPrice: treatmentPlanProceduresTable.unitMonthlyPrice,
        discount: treatmentPlanProceduresTable.discount,
        totalSessions: treatmentPlanProceduresTable.totalSessions,
        procedurePrice: proceduresTable.price,
        packagePrice: packagesTable.price,
        packageMonthlyPrice: packagesTable.monthlyPrice,
        packageType: packagesTable.packageType,
      })
      .from(treatmentPlanProceduresTable)
      .leftJoin(
        proceduresTable,
        eq(proceduresTable.id, treatmentPlanProceduresTable.procedureId),
      )
      .leftJoin(
        packagesTable,
        eq(packagesTable.id, treatmentPlanProceduresTable.packageId),
      )
      .where(eq(treatmentPlanProceduresTable.treatmentPlanId, plan.id));

    const frozen = {
      version: 1,
      legacyMigration: true,
      capturedAt: new Date().toISOString(),
      items: items.map((it) => ({
        planProcedureId: it.id,
        procedureId: it.procedureId,
        packageId: it.packageId,
        unitPrice: it.unitPrice ?? it.packagePrice ?? it.procedurePrice ?? null,
        unitMonthlyPrice: it.unitMonthlyPrice ?? it.packageMonthlyPrice ?? null,
        discount: it.discount ?? "0",
        totalSessions: it.totalSessions,
        snapshotPrice: it.unitPrice ?? it.packagePrice ?? it.procedurePrice ?? null,
      })),
    };

    log(
      `  plan #${plan.id} (paciente #${plan.patientId}, materializado ${plan.materializedAt?.toISOString().slice(0, 10)}): ${items.length} itens`,
    );

    if (APPLY) {
      await db
        .update(treatmentPlansTable)
        .set({
          acceptedAt: plan.materializedAt!,
          acceptedVia: "legado",
          frozenPricesJson: JSON.stringify(frozen),
          status: plan.status === "rascunho" ? "vigente" : plan.status,
          updatedAt: new Date(),
        })
        .where(eq(treatmentPlansTable.id, plan.id));
      updated++;
    }
  }
  log(`Parte A: ${APPLY ? `${updated} atualizados` : `${plans.length} seriam atualizados`}.`);
  return { found: plans.length, updated };
}

// ── PARTE B ────────────────────────────────────────────────────────────────
async function partBOrphanSubscriptions() {
  log("");
  log("── PARTE B — patient_subscriptions órfãs ──");
  const subFilters = [
    inArray(patientSubscriptionsTable.status, ["ativa", "pendente"]),
  ];
  if (ONLY_CLINIC != null) {
    subFilters.push(eq(patientSubscriptionsTable.clinicId, ONLY_CLINIC));
  }
  // "Órfã" = subscription ativa cujo paciente NÃO tem nenhum plano com aquela
  // procedureId entre os itens. Identificamos via NOT EXISTS.
  const subs = await db
    .select({
      id: patientSubscriptionsTable.id,
      patientId: patientSubscriptionsTable.patientId,
      procedureId: patientSubscriptionsTable.procedureId,
      clinicId: patientSubscriptionsTable.clinicId,
      startDate: patientSubscriptionsTable.startDate,
      monthlyAmount: patientSubscriptionsTable.monthlyAmount,
      billingDay: patientSubscriptionsTable.billingDay,
      subscriptionType: patientSubscriptionsTable.subscriptionType,
    })
    .from(patientSubscriptionsTable)
    .where(
      and(
        ...subFilters,
        sql`NOT EXISTS (
          SELECT 1 FROM ${treatmentPlansTable} tp
          INNER JOIN ${treatmentPlanProceduresTable} tpp
            ON tpp.treatment_plan_id = tp.id
          WHERE tp.patient_id = ${patientSubscriptionsTable.patientId}
            AND tpp.procedure_id = ${patientSubscriptionsTable.procedureId}
        )`,
      ),
    );
  log(`encontradas: ${subs.length} subscriptions órfãs`);

  // Agrupa por paciente — 1 plano legado por paciente.
  const byPatient = new Map<number, typeof subs>();
  for (const s of subs) {
    if (!byPatient.has(s.patientId)) byPatient.set(s.patientId, []);
    byPatient.get(s.patientId)!.push(s);
  }
  log(`pacientes únicos: ${byPatient.size}`);

  let plansCreated = 0;
  let itemsCreated = 0;
  let subsClosed = 0;

  for (const [patientId, list] of byPatient) {
    const clinicId = list[0].clinicId;
    const earliestStart =
      list
        .map((s) => s.startDate)
        .filter((d): d is string => !!d)
        .sort()[0] ?? new Date().toISOString().slice(0, 10);

    log(`  paciente #${patientId} (clínica #${clinicId}): ${list.length} subs → 1 plano legado`);

    if (!APPLY) continue;

    const now = new Date();
    const [newPlan] = await db
      .insert(treatmentPlansTable)
      .values({
        patientId,
        clinicId,
        status: "vigente",
        startDate: earliestStart,
        durationMonths: 12,
        objectives: "Plano Legado — gerado automaticamente a partir de assinatura(s) anterior(es).",
        acceptedAt: now,
        acceptedVia: "legado",
        frozenPricesJson: JSON.stringify({
          version: 1,
          legacyMigration: true,
          source: "patient_subscriptions",
          capturedAt: now.toISOString(),
          subscriptionIds: list.map((s) => s.id),
        }),
        avulsoBillingMode: "porSessao",
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: treatmentPlansTable.id });
    plansCreated++;

    for (const s of list) {
      await db.insert(treatmentPlanProceduresTable).values({
        treatmentPlanId: newPlan.id,
        procedureId: s.procedureId,
        packageId: null,
        // Subscriptions sempre representavam pacote mensal recorrente.
        kind: "recorrenteMensal",
        sessionsPerWeek: 1,
        unitMonthlyPrice: s.monthlyAmount,
        notes: `Migrado de patient_subscription #${s.id} (billingDay=${s.billingDay}, type=${s.subscriptionType}).`,
      });
      itemsCreated++;
    }

    const closed = await db
      .update(patientSubscriptionsTable)
      .set({
        status: "cancelada",
        cancelledAt: new Date(),
        notes: sql`COALESCE(${patientSubscriptionsTable.notes}, '') || E'\n[migrate-legacy-plans] Convertida em Plano Legado #' || ${newPlan.id}::text`,
      })
      .where(
        inArray(
          patientSubscriptionsTable.id,
          list.map((s) => s.id),
        ),
      )
      .returning({ id: patientSubscriptionsTable.id });
    subsClosed += closed.length;
  }

  log(
    `Parte B: ${APPLY ? `${plansCreated} planos / ${itemsCreated} itens / ${subsClosed} subs encerradas` : `${byPatient.size} planos seriam criados, ${subs.length} subs encerradas`}.`,
  );
  return { subsFound: subs.length, plansCreated, itemsCreated, subsClosed };
}

// ── MAIN ───────────────────────────────────────────────────────────────────
async function main() {
  banner();
  const a = SKIP_A ? null : await partAMaterializedWithoutAcceptance();
  const b = SKIP_B ? null : await partBOrphanSubscriptions();
  log("");
  log("── RESUMO ──");
  if (a) log(`  Parte A: encontrados=${a.found}, atualizados=${a.updated}`);
  if (b)
    log(
      `  Parte B: subs órfãs=${b.subsFound}, planos legado criados=${b.plansCreated}, itens=${b.itemsCreated}, subs encerradas=${b.subsClosed}`,
    );
  log(APPLY ? "Concluído (APPLY)." : "Concluído (DRY-RUN, nada gravado).");
  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate-legacy-plans] erro:", err);
  process.exit(1);
});
