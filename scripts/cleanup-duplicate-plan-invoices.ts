/**
 * Limpa duplicatas de `faturaPlano` geradas pelo bug em que
 * `materializeTreatmentPlan` inseria a fatura do mês 0 sem checar a
 * fatura já criada por `acceptPlanFinancials`.
 *
 * Critério: agrupa por (treatmentPlanId, treatmentPlanProcedureId,
 * planMonthRef) com transactionType='faturaPlano'. Quando há mais de
 * uma linha no grupo, mantém a MAIS ANTIGA (menor `id`) — por convenção
 * é a do aceite — e remove as demais.
 *
 * Segurança:
 *   • Modo padrão é **dry-run**: lista o que seria removido, sem apagar.
 *   • `--apply` para executar de fato.
 *   • Pula grupos onde alguma das duplicatas está `paga` ou `parcialmente
 *     paga` — nesse caso não há limpeza automática segura, o operador
 *     precisa avaliar (estorno/transferência manual).
 *   • Antes de deletar, repõe `appointments.monthly_invoice_id` apontando
 *     para o ID que será mantido (preserva o vínculo dos atendimentos).
 *   • `clinic_id` opcional via `--clinic <id>` para escopo.
 *
 * Uso:
 *   pnpm tsx scripts/cleanup-duplicate-plan-invoices.ts            # dry-run
 *   pnpm tsx scripts/cleanup-duplicate-plan-invoices.ts -- --apply # executa
 *   pnpm tsx scripts/cleanup-duplicate-plan-invoices.ts -- --clinic 1 --apply
 */
import { db } from "../lib/db/src/index.ts";
import {
  financialRecordsTable,
  appointmentsTable,
} from "../lib/db/src/index.ts";
import { and, inArray, sql } from "drizzle-orm";

interface Args {
  apply: boolean;
  clinicId: number | null;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, clinicId: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") args.apply = true;
    else if (a === "--clinic") {
      const v = Number(argv[++i]);
      if (Number.isFinite(v)) args.clinicId = v;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.apply ? "APPLY" : "DRY-RUN";
  console.log(`[cleanup-duplicate-plan-invoices] modo=${mode} clinic=${args.clinicId ?? "todas"}`);

  // 1) Encontra grupos duplicados.
  const dupRows = await db.execute<{
    treatment_plan_id: number;
    treatment_plan_procedure_id: number;
    plan_month_ref: string;
    ids: number[];
    statuses: string[];
    amounts: string[];
    descriptions: string[];
  }>(sql`
    SELECT
      treatment_plan_id,
      treatment_plan_procedure_id,
      plan_month_ref,
      array_agg(id ORDER BY id ASC)            AS ids,
      array_agg(status ORDER BY id ASC)        AS statuses,
      array_agg(amount ORDER BY id ASC)        AS amounts,
      array_agg(description ORDER BY id ASC)   AS descriptions
    FROM financial_records
    WHERE transaction_type = 'faturaPlano'
      AND treatment_plan_id IS NOT NULL
      AND treatment_plan_procedure_id IS NOT NULL
      AND plan_month_ref IS NOT NULL
      ${args.clinicId != null ? sql`AND clinic_id = ${args.clinicId}` : sql``}
    GROUP BY treatment_plan_id, treatment_plan_procedure_id, plan_month_ref
    HAVING COUNT(*) > 1
    ORDER BY treatment_plan_id, treatment_plan_procedure_id, plan_month_ref
  `);

  const groups = (dupRows as any).rows ?? dupRows;
  if (!groups || groups.length === 0) {
    console.log("Nenhuma duplicata encontrada. Nada a fazer.");
    return;
  }

  let totalSkippedPaid = 0;
  let totalKept = 0;
  let totalDeleted = 0;
  let totalAppointmentsRelinked = 0;

  // pg retorna array_agg como array nativo (com `array: true`) ou como
  // literal Postgres `{a,b,c}` em string. Lida com os dois formatos.
  const toArr = (v: any): any[] => {
    if (Array.isArray(v)) return v;
    if (typeof v !== "string") return [];
    const s = v.trim();
    if (s.startsWith("{") && s.endsWith("}")) {
      const inner = s.slice(1, -1);
      if (!inner) return [];
      return inner.split(",").map((x) => x.replace(/^"|"$/g, ""));
    }
    return [];
  };

  for (const g of groups) {
    const ids: number[] = toArr(g.ids).map(Number);
    const statuses: string[] = toArr(g.statuses).map(String);
    const amounts: string[] = toArr(g.amounts).map(String);
    const descriptions: string[] = toArr(g.descriptions).map(String);

    const blockingStatus = statuses.some((s) =>
      ["pago", "parcialmentePago"].includes(s),
    );

    console.log(
      `\n── plano=${g.treatment_plan_id} item=${g.treatment_plan_procedure_id} mês=${g.plan_month_ref}`,
    );
    for (let i = 0; i < ids.length; i++) {
      console.log(
        `   • #${ids[i]} status=${statuses[i]} valor=R$${amounts[i]} ${
          i === 0 ? "[KEEP]" : "[DELETE]"
        }  ${descriptions[i]?.slice(0, 60) ?? ""}`,
      );
    }

    if (blockingStatus) {
      console.log("   ⚠ pulando: alguma duplicata já está paga/parcialmente paga.");
      totalSkippedPaid++;
      continue;
    }

    const keepId = ids[0];
    const deleteIds = ids.slice(1);
    totalKept++;

    if (!args.apply) {
      totalDeleted += deleteIds.length;
      continue;
    }

    await db.transaction(async (tx) => {
      // Repõe appointments apontando para os que serão removidos.
      const relinked = await tx
        .update(appointmentsTable)
        .set({ monthlyInvoiceId: keepId })
        .where(
          and(
            inArray(appointmentsTable.monthlyInvoiceId, deleteIds),
          ),
        )
        .returning({ id: appointmentsTable.id });
      totalAppointmentsRelinked += relinked.length;

      // Apaga as duplicatas (status pendente — sem journal, sem pagamento).
      const deleted = await tx
        .delete(financialRecordsTable)
        .where(inArray(financialRecordsTable.id, deleteIds))
        .returning({ id: financialRecordsTable.id });
      totalDeleted += deleted.length;
      console.log(
        `   ✓ removidas ${deleted.length} | appointments relinkados ${relinked.length}`,
      );
    });
  }

  console.log("\n────────── resumo ──────────");
  console.log(`grupos analisados:           ${groups.length}`);
  console.log(`grupos limpos:               ${totalKept}`);
  console.log(`grupos pulados (com pago):   ${totalSkippedPaid}`);
  console.log(`faturas removidas:           ${totalDeleted}${args.apply ? "" : " (dry-run)"}`);
  console.log(`appointments relinkados:     ${totalAppointmentsRelinked}${args.apply ? "" : " (dry-run)"}`);

  if (!args.apply) {
    console.log("\nRode novamente com `-- --apply` para executar de fato.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
