/**
 * baseline-metrics.ts — coleta métricas pré-redesign para comparação posterior.
 *
 * Uso:
 *   pnpm tsx scripts/baseline-metrics.ts
 *
 * Saída:
 *   - imprime na tela
 *   - grava em sprints/_baselines/YYYY-MM-DD-HHMMSS.json
 */
import { db } from "../lib/db/src";
import { sql } from "drizzle-orm";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface MetricRow { metric: string; value: number | string }

async function q1<T = any>(text: string): Promise<T> {
  const res: any = await db.execute(sql.raw(text));
  const rows = Array.isArray(res) ? res : (res?.rows ?? []);
  return rows[0] as T;
}

async function qAll<T = any>(text: string): Promise<T[]> {
  const res: any = await db.execute(sql.raw(text));
  return (Array.isArray(res) ? res : (res?.rows ?? [])) as T[];
}

async function main() {
  const out: MetricRow[] = [];

  const push = (metric: string, value: number | string) => {
    out.push({ metric, value });
    console.log(`  ${metric.padEnd(50)} ${value}`);
  };

  console.log("\n=== Baseline pré-redesign — " + new Date().toISOString() + " ===\n");

  console.log("[Assinaturas]");
  const subs = await q1<{ ativas: number; pausadas: number; canceladas: number; mensal: number; consolidada: number }>(
    `SELECT
       COUNT(*) FILTER (WHERE status='ativa')::int       AS ativas,
       COUNT(*) FILTER (WHERE status='pausada')::int     AS pausadas,
       COUNT(*) FILTER (WHERE status='cancelada')::int   AS canceladas,
       COUNT(*) FILTER (WHERE subscription_type='mensal')::int            AS mensal,
       COUNT(*) FILTER (WHERE subscription_type='faturaConsolidada')::int AS consolidada
     FROM patient_subscriptions`
  );
  push("subscriptions.ativas", subs.ativas);
  push("subscriptions.pausadas", subs.pausadas);
  push("subscriptions.canceladas", subs.canceladas);
  push("subscriptions.tipo_mensal", subs.mensal);
  push("subscriptions.tipo_consolidada", subs.consolidada);

  console.log("\n[Pacotes do paciente]");
  const pkgs = await q1<{ total: number; com_template: number; sem_template: number }>(
    `SELECT
       COUNT(*)::int                            AS total,
       COUNT(package_id)::int                   AS com_template,
       COUNT(*) FILTER (WHERE package_id IS NULL)::int AS sem_template
     FROM patient_packages`
  );
  push("patient_packages.total", pkgs.total);
  push("patient_packages.com_template_catalogo", pkgs.com_template);
  push("patient_packages.sem_template_catalogo", pkgs.sem_template);

  const pkgsByType = await qAll<{ tipo: string; qtd: number }>(
    `SELECT COALESCE(p.package_type, 'sem_template') AS tipo, COUNT(pp.*)::int AS qtd
     FROM patient_packages pp LEFT JOIN packages p ON p.id = pp.package_id
     GROUP BY 1 ORDER BY 1`
  );
  for (const row of pkgsByType) push(`patient_packages.tipo.${row.tipo}`, row.qtd);

  console.log("\n[Planos de tratamento]");
  const plans = await q1<{ total: number; materializados: number; nao_materializados: number; com_proc_mensal: number }>(
    `SELECT
       COUNT(*)::int                                              AS total,
       COUNT(materialized_at)::int                                AS materializados,
       COUNT(*) FILTER (WHERE materialized_at IS NULL)::int       AS nao_materializados,
       (SELECT COUNT(DISTINCT treatment_plan_id)::int
          FROM treatment_plan_procedures tpp
          JOIN packages pk ON pk.id = tpp.package_id
          WHERE pk.package_type = 'mensal') AS com_proc_mensal
     FROM treatment_plans`
  );
  push("treatment_plans.total", plans.total);
  push("treatment_plans.materializados", plans.materializados);
  push("treatment_plans.nao_materializados", plans.nao_materializados);
  push("treatment_plans.com_proc_mensal", plans.com_proc_mensal);

  console.log("\n[Agendamentos]");
  const appts = await q1<{
    total: number; futuros: number; vinculados_a_plano: number;
    com_monthly_invoice: number; antes_da_corte: number;
  }>(
    `SELECT
       COUNT(*)::int                                                AS total,
       COUNT(*) FILTER (WHERE date >= '2026-04-30')::int            AS futuros,
       COUNT(*) FILTER (WHERE treatment_plan_procedure_id IS NOT NULL)::int AS vinculados_a_plano,
       COUNT(*) FILTER (WHERE monthly_invoice_id IS NOT NULL)::int  AS com_monthly_invoice,
       COUNT(*) FILTER (WHERE date < '2026-04-30')::int             AS antes_da_corte
     FROM appointments`
  );
  push("appointments.total", appts.total);
  push("appointments.futuros_30abr_em_diante", appts.futuros);
  push("appointments.vinculados_a_plano", appts.vinculados_a_plano);
  push("appointments.com_monthly_invoice_id", appts.com_monthly_invoice);
  push("appointments.antes_da_corte_30abr", appts.antes_da_corte);

  console.log("\n[Financeiro]");
  const fin = await q1<{
    total_records: number; pendente: number; pago: number;
    fatura_plano: number; fatura_consolidada: number; pendente_fatura: number;
  }>(
    `SELECT
       COUNT(*)::int                                                  AS total_records,
       COUNT(*) FILTER (WHERE status='pendente')::int                 AS pendente,
       COUNT(*) FILTER (WHERE status='pago')::int                     AS pago,
       COUNT(*) FILTER (WHERE transaction_type='faturaPlano')::int    AS fatura_plano,
       COUNT(*) FILTER (WHERE transaction_type='faturaConsolidada')::int AS fatura_consolidada,
       COUNT(*) FILTER (WHERE transaction_type='pendenteFatura')::int AS pendente_fatura
     FROM financial_records`
  );
  push("financial_records.total", fin.total_records);
  push("financial_records.pendente", fin.pendente);
  push("financial_records.pago", fin.pago);
  push("financial_records.tipo.faturaPlano", fin.fatura_plano);
  push("financial_records.tipo.faturaConsolidada", fin.fatura_consolidada);
  push("financial_records.tipo.pendenteFatura", fin.pendente_fatura);

  console.log("\n[Créditos de sessão]");
  const credits = await q1<{
    total: number; disponivel: number; consumido: number;
    pendente_pagamento: number; expirado: number;
  }>(
    `SELECT
       COUNT(*)::int                                              AS total,
       COUNT(*) FILTER (WHERE status='disponivel')::int           AS disponivel,
       COUNT(*) FILTER (WHERE status='consumido')::int            AS consumido,
       COUNT(*) FILTER (WHERE status='pendentePagamento')::int    AS pendente_pagamento,
       COUNT(*) FILTER (WHERE status='expirado')::int             AS expirado
     FROM session_credits`
  );
  push("session_credits.total", credits.total);
  push("session_credits.disponivel", credits.disponivel);
  push("session_credits.consumido", credits.consumido);
  push("session_credits.pendente_pagamento", credits.pendente_pagamento);
  push("session_credits.expirado", credits.expirado);

  console.log("\n[Ledger contábil]");
  const ledger = await q1<{ entries: number; lines: number; debit: string; credit: string }>(
    `SELECT
       (SELECT COUNT(*)::int FROM accounting_journal_entries) AS entries,
       (SELECT COUNT(*)::int FROM accounting_journal_lines)   AS lines,
       (SELECT COALESCE(SUM(debit_amount),  0)::text FROM accounting_journal_lines) AS debit,
       (SELECT COALESCE(SUM(credit_amount), 0)::text FROM accounting_journal_lines) AS credit`
  );
  push("ledger.entries", ledger.entries);
  push("ledger.lines", ledger.lines);
  push("ledger.total_debit", ledger.debit);
  push("ledger.total_credit", ledger.credit);
  push("ledger.balanced", ledger.debit === ledger.credit ? "true" : "FALSE");

  // Salva snapshot
  const dir = resolve(process.cwd(), "sprints", "_baselines");
  mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const file = resolve(dir, `${ts}.json`);
  writeFileSync(file, JSON.stringify({ collectedAt: new Date().toISOString(), metrics: out }, null, 2));
  console.log(`\n[ok] Baseline salvo em sprints/_baselines/${ts}.json\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
