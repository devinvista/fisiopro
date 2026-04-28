/**
 * Limpeza de estornos (ajustes) no ledger contábil.
 *
 * Objetivo
 * --------
 * Zerar do banco TODOS os pares "estorno + lançamento original" criados pelos
 * scripts de migração anteriores (loose_payment_relink_reversal,
 * premature_revenue_reversal, orphan_revenue_reversal e reversal genérico),
 * deixando apenas o lançamento "correto" (já posted) no ledger.
 *
 * Estratégia
 * ----------
 * 1. Identificar:
 *    - REV: todos os entries com `reversal_of_entry_id IS NOT NULL`
 *    - ORIG: todos os entries com `status = 'reversed'`
 * 2. Em uma única transação:
 *    a. Limpar referências em `financial_records` que apontam para esses
 *       entries (accounting_entry_id / settlement_entry_id / recognized_entry_id).
 *    b. Deletar `receivable_allocations` que referenciam esses entries.
 *    c. Deletar `accounting_journal_lines` desses entries.
 *    d. Deletar os entries.
 * 3. Validar saldo final (débito = crédito) — se quebrar, ROLLBACK.
 *
 * Segurança
 * ---------
 * - Usa `BEGIN/COMMIT/ROLLBACK` explícito.
 * - Use `--dry-run` para apenas relatar sem aplicar nada.
 * - Não toca em entries fora do escopo (status='posted' que NÃO são estornos).
 */
import { Client } from "pg";

const DRY_RUN = process.argv.includes("--dry-run");

async function run() {
  const conn = process.env.DATABASE_URL;
  if (!conn) throw new Error("DATABASE_URL ausente");

  const client = new Client({ connectionString: conn });
  await client.connect();

  try {
    console.log(`\n=== Cleanup de estornos ${DRY_RUN ? "(DRY-RUN)" : "(APLICANDO)"} ===\n`);

    // ── Diagnóstico inicial ─────────────────────────────────────────────────
    const before = await client.query(`
      SELECT
        ROUND(SUM(debit_amount), 2)::text AS debit,
        ROUND(SUM(credit_amount), 2)::text AS credit,
        ROUND(SUM(debit_amount) - SUM(credit_amount), 2)::text AS diff
      FROM accounting_journal_lines
    `);
    console.log("Saldo do ledger ANTES:", before.rows[0]);

    const counts = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM accounting_journal_entries WHERE reversal_of_entry_id IS NOT NULL) AS rev_entries,
        (SELECT COUNT(*)::int FROM accounting_journal_entries WHERE status = 'reversed') AS orig_reversed,
        (SELECT COUNT(*)::int FROM accounting_journal_lines l
         JOIN accounting_journal_entries e ON e.id = l.entry_id
         WHERE e.reversal_of_entry_id IS NOT NULL OR e.status = 'reversed') AS lines_to_delete,
        (SELECT COUNT(*)::int FROM receivable_allocations
         WHERE payment_entry_id IN (SELECT id FROM accounting_journal_entries WHERE reversal_of_entry_id IS NOT NULL OR status = 'reversed')
            OR receivable_entry_id IN (SELECT id FROM accounting_journal_entries WHERE reversal_of_entry_id IS NOT NULL OR status = 'reversed')
        ) AS allocations_to_delete,
        (SELECT COUNT(*)::int FROM financial_records
         WHERE accounting_entry_id IN (SELECT id FROM accounting_journal_entries WHERE reversal_of_entry_id IS NOT NULL OR status = 'reversed')
            OR settlement_entry_id IN (SELECT id FROM accounting_journal_entries WHERE reversal_of_entry_id IS NOT NULL OR status = 'reversed')
            OR recognized_entry_id IN (SELECT id FROM accounting_journal_entries WHERE reversal_of_entry_id IS NOT NULL OR status = 'reversed')
        ) AS frs_to_clean
    `);
    console.log("Itens a deletar:", counts.rows[0]);

    const breakdown = await client.query(`
      SELECT event_type, status, COUNT(*)::int AS cnt
      FROM accounting_journal_entries
      WHERE reversal_of_entry_id IS NOT NULL OR status = 'reversed'
      GROUP BY event_type, status
      ORDER BY event_type, status
    `);
    console.log("\nQuebra por tipo:");
    console.table(breakdown.rows);

    // ── Aplicação ───────────────────────────────────────────────────────────
    await client.query("BEGIN");

    // Materializa em tabela temporária os ids alvo (estorno + originais reversed)
    await client.query(`
      CREATE TEMP TABLE tmp_target_entries AS
      SELECT id FROM accounting_journal_entries
      WHERE reversal_of_entry_id IS NOT NULL OR status = 'reversed'
    `);

    const tgt = await client.query(`SELECT COUNT(*)::int AS n FROM tmp_target_entries`);
    console.log(`\nTotal de entries-alvo: ${tgt.rows[0].n}`);

    // a. Limpa referências em financial_records
    const upd = await client.query(`
      WITH cleared AS (
        UPDATE financial_records
        SET accounting_entry_id = CASE WHEN accounting_entry_id IN (SELECT id FROM tmp_target_entries) THEN NULL ELSE accounting_entry_id END,
            settlement_entry_id = CASE WHEN settlement_entry_id IN (SELECT id FROM tmp_target_entries) THEN NULL ELSE settlement_entry_id END,
            recognized_entry_id = CASE WHEN recognized_entry_id IN (SELECT id FROM tmp_target_entries) THEN NULL ELSE recognized_entry_id END
        WHERE accounting_entry_id IN (SELECT id FROM tmp_target_entries)
           OR settlement_entry_id IN (SELECT id FROM tmp_target_entries)
           OR recognized_entry_id IN (SELECT id FROM tmp_target_entries)
        RETURNING id
      )
      SELECT COUNT(*)::int AS n FROM cleared
    `);
    console.log(`financial_records limpos: ${upd.rows[0].n}`);

    // b. Deleta receivable_allocations
    const delAlloc = await client.query(`
      DELETE FROM receivable_allocations
      WHERE payment_entry_id IN (SELECT id FROM tmp_target_entries)
         OR receivable_entry_id IN (SELECT id FROM tmp_target_entries)
    `);
    console.log(`receivable_allocations deletadas: ${delAlloc.rowCount}`);

    // c. Deleta linhas (cascade já é onDelete cascade no schema, mas garante)
    const delLines = await client.query(`
      DELETE FROM accounting_journal_lines
      WHERE entry_id IN (SELECT id FROM tmp_target_entries)
    `);
    console.log(`accounting_journal_lines deletadas: ${delLines.rowCount}`);

    // d. Deleta os entries (primeiro os reversal — apontam ao orig via reversal_of_entry_id;
    //    como NÃO há FK declarada nesse campo, ordem importa apenas para clareza)
    const delRev = await client.query(`
      DELETE FROM accounting_journal_entries
      WHERE reversal_of_entry_id IS NOT NULL
    `);
    console.log(`reversal entries deletados: ${delRev.rowCount}`);

    const delOrig = await client.query(`
      DELETE FROM accounting_journal_entries
      WHERE status = 'reversed'
    `);
    console.log(`originais (reversed) deletados: ${delOrig.rowCount}`);

    // ── Validação final ─────────────────────────────────────────────────────
    const after = await client.query(`
      SELECT
        ROUND(SUM(debit_amount), 2)::text AS debit,
        ROUND(SUM(credit_amount), 2)::text AS credit,
        ROUND(SUM(debit_amount) - SUM(credit_amount), 2)::text AS diff
      FROM accounting_journal_lines
    `);
    console.log("\nSaldo do ledger DEPOIS:", after.rows[0]);

    if (after.rows[0].diff !== "0.00") {
      throw new Error(`Saldo do ledger ficou desbalanceado: ${after.rows[0].diff}`);
    }

    // Sanity: não pode sobrar nenhum estorno
    const leftover = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM accounting_journal_entries WHERE reversal_of_entry_id IS NOT NULL) AS rev,
        (SELECT COUNT(*)::int FROM accounting_journal_entries WHERE status = 'reversed') AS reversed
    `);
    console.log("Resto após cleanup:", leftover.rows[0]);
    if (leftover.rows[0].rev !== 0 || leftover.rows[0].reversed !== 0) {
      throw new Error("Sobrou entries de estorno após o cleanup");
    }

    if (DRY_RUN) {
      console.log("\nDRY-RUN: ROLLBACK (nada foi gravado).");
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
      console.log("\nCOMMIT aplicado com sucesso.");
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("\nErro durante cleanup, ROLLBACK:", err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

run();
