/**
 * Sprint 3 — Limpeza de faturas mensais futuras (`faturaPlano`).
 *
 * O Sprint 3 troca a geração antecipada de 12 meses de fatura por
 * geração lazy mês a mês via `runMonthlyPlanBilling`. Este script
 * remove faturas `pendente` futuras criadas pela materialização
 * antiga de planos aceitos, para que o novo job assuma a régua a
 * partir do mês corrente.
 *
 * Critério de seleção (todas as condições):
 *   • financial_records.transactionType = 'faturaPlano'
 *   • financial_records.status = 'pendente'
 *   • financial_records.recognizedEntryId IS NULL
 *     (receita ainda não foi reconhecida — fatura nunca foi consumida)
 *   • financial_records.planMonthRef > <mês corrente em BRT>
 *     (apenas meses estritamente futuros — nunca toca o mês corrente)
 *   • o plano de tratamento referenciado está em status
 *     'vigente'/'ativo' E tem acceptedAt definido
 *
 * Antes de excluir a fatura, zeramos `monthlyInvoiceId` em todos os
 * appointments que apontavam para ela (FK lógica) — o próximo run do
 * `runMonthlyPlanBilling` re-vincula automaticamente quando criar a
 * nova fatura.
 *
 * Modos:
 *   --dry-run            (default) apenas lista o que seria removido
 *   --apply              executa as remoções
 *   --plan=<id>          restringe a um plano específico
 *   --clinic=<id>        restringe a uma clínica
 *   --month=<YYYY-MM>    permite escolher um mês de corte alternativo
 *                        (default: mês corrente em BRT)
 *
 * Execução:
 *   pnpm --filter @workspace/api-server exec tsx \
 *     src/scripts/cleanup-future-faturaplano.ts [--apply] [--plan=42]
 */
import { db } from "@workspace/db";
import {
  financialRecordsTable,
  treatmentPlansTable,
  appointmentsTable,
} from "@workspace/db";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { nowBRT } from "../utils/dateUtils.js";

interface ScriptArgs {
  apply: boolean;
  planId: number | null;
  clinicId: number | null;
  monthRef: string; // YYYY-MM-01
}

function parseArgs(): ScriptArgs {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  let planId: number | null = null;
  let clinicId: number | null = null;
  let monthRef: string | null = null;
  for (const a of args) {
    if (a.startsWith("--plan=")) planId = Number(a.slice("--plan=".length));
    if (a.startsWith("--clinic=")) clinicId = Number(a.slice("--clinic=".length));
    if (a.startsWith("--month=")) monthRef = a.slice("--month=".length);
  }
  if (!monthRef) {
    const t = nowBRT();
    monthRef = `${t.year}-${String(t.month).padStart(2, "0")}-01`;
  } else {
    // Normaliza YYYY-MM ou YYYY-MM-DD para YYYY-MM-01.
    const [y, m] = monthRef.slice(0, 7).split("-");
    if (!y || !m) throw new Error(`--month inválido: ${monthRef}`);
    monthRef = `${y}-${m}-01`;
  }
  return { apply, planId, clinicId, monthRef };
}

async function main() {
  const args = parseArgs();
  console.log(
    `\n🧹 cleanup-future-faturaplano (${args.apply ? "APPLY" : "DRY-RUN"})`,
  );
  console.log(`   mês de corte (exclusivo): ${args.monthRef}`);
  if (args.planId) console.log(`   filtrado por plano: #${args.planId}`);
  if (args.clinicId) console.log(`   filtrado por clínica: #${args.clinicId}`);
  console.log("");

  const conds: any[] = [
    eq(financialRecordsTable.transactionType, "faturaPlano"),
    eq(financialRecordsTable.status, "pendente"),
    isNull(financialRecordsTable.recognizedEntryId),
    sql`${financialRecordsTable.planMonthRef} > ${args.monthRef}::date`,
  ];
  if (args.clinicId) {
    conds.push(eq(financialRecordsTable.clinicId, args.clinicId));
  }
  if (args.planId) {
    conds.push(eq(financialRecordsTable.treatmentPlanId, args.planId));
  }

  const candidates = await db
    .select({
      id: financialRecordsTable.id,
      planId: financialRecordsTable.treatmentPlanId,
      planMonthRef: financialRecordsTable.planMonthRef,
      amount: financialRecordsTable.amount,
      description: financialRecordsTable.description,
      planStatus: treatmentPlansTable.status,
      acceptedAt: treatmentPlansTable.acceptedAt,
    })
    .from(financialRecordsTable)
    .innerJoin(
      treatmentPlansTable,
      eq(treatmentPlansTable.id, financialRecordsTable.treatmentPlanId),
    )
    .where(and(...conds, sql`${treatmentPlansTable.acceptedAt} IS NOT NULL`));

  // Filtra apenas planos vigentes/ativos.
  const eligible = candidates.filter(
    (c) => c.planStatus === "vigente" || c.planStatus === "ativo",
  );
  const skippedByStatus = candidates.length - eligible.length;

  console.log(`Candidatos: ${candidates.length}`);
  console.log(`Elegíveis (plano vigente/ativo + aceito): ${eligible.length}`);
  if (skippedByStatus > 0) {
    console.log(`Ignorados por status do plano: ${skippedByStatus}`);
  }

  if (eligible.length === 0) {
    console.log("\nNada a fazer.\n");
    return;
  }

  // Resumo por plano
  const byPlan = new Map<number, number>();
  let totalAmount = 0;
  for (const c of eligible) {
    byPlan.set((c.planId ?? 0), (byPlan.get(c.planId ?? 0) ?? 0) + 1);
    totalAmount += Number(c.amount ?? 0);
  }
  const planBreakdown = Array.from(byPlan.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  console.log(`Total a remover: R$ ${totalAmount.toFixed(2)}`);
  console.log(`Top planos (até 20):`);
  for (const [pid, count] of planBreakdown) {
    console.log(`  • Plano #${pid}: ${count} fatura(s) futura(s)`);
  }

  const ids = eligible.map((e) => e.id);

  if (!args.apply) {
    console.log("\n[DRY-RUN] Use --apply para executar.\n");
    return;
  }

  await db.transaction(async (tx) => {
    // 1) Desvincula appointments dessas faturas — Sprint 3 lazy job re-vincula
    //    quando recriar a fatura do mês.
    const unlinked = await tx
      .update(appointmentsTable)
      .set({ monthlyInvoiceId: null })
      .where(inArray(appointmentsTable.monthlyInvoiceId, ids))
      .returning({ id: appointmentsTable.id });
    console.log(`✓ ${unlinked.length} appointment(s) desvinculado(s)`);

    // 2) Remove as faturas futuras.
    const removed = await tx
      .delete(financialRecordsTable)
      .where(
        and(
          inArray(financialRecordsTable.id, ids),
          // Re-checa o status para evitar TOCTOU (alguém pagou no meio).
          eq(financialRecordsTable.status, "pendente"),
          isNull(financialRecordsTable.recognizedEntryId),
        ),
      )
      .returning({ id: financialRecordsTable.id });
    console.log(`✓ ${removed.length} fatura(s) futura(s) removida(s)`);
  });

  console.log("\nConcluído.\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Falha:", err);
    process.exit(1);
  });
