/**
 * Reverte agendamentos ao estado anterior a 28/04/2026.
 *
 * Contexto
 * --------
 * Em 28/04/2026 o backfill de planos de tratamento criou 1.839 agendamentos
 * cobrindo 04/2026 → 03/2027. O usuário pediu para voltar a agenda para o
 * estado de 27/04 mantendo o financeiro vinculado às faturas mensais
 * (financial_records).
 *
 * Estratégia
 * ----------
 * - Apagar todos os appointments com `created_at::date = '2026-04-28'`
 *   EXCETO os que já tiveram atendimento real (referenciados por
 *   financial_records ou accounting_journal_entries).
 * - As faturas mensais (financial_records) permanecem intactas — apenas a
 *   coluna `monthly_invoice_id` dos appointments será removida junto com o
 *   appointment.
 *
 * Segurança
 * ---------
 * - Transação BEGIN/COMMIT.
 * - --dry-run para simular.
 */
import { Client } from "pg";

const DRY_RUN = process.argv.includes("--dry-run");
const CUTOFF = "2026-04-28"; // tudo criado nesta data será removido

async function run() {
  const conn = process.env.DATABASE_URL;
  if (!conn) throw new Error("DATABASE_URL ausente");

  const client = new Client({ connectionString: conn });
  await client.connect();

  try {
    console.log(
      `\n=== Reverter agendas (${DRY_RUN ? "DRY-RUN" : "APLICANDO"}) ===\n`
    );

    const before = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM appointments WHERE created_at::date = $1) AS criados_hoje,
        (SELECT COUNT(*)::int FROM appointments) AS total_appts,
        (SELECT COUNT(*)::int FROM financial_records) AS total_frs
    `, [CUTOFF]);
    console.log("Antes:", before.rows[0]);

    // Quem é "intocável" — quem tem refs de FR ou ledger
    const protectedQ = await client.query(
      `
      SELECT id FROM appointments
      WHERE created_at::date = $1
        AND (
          EXISTS (SELECT 1 FROM accounting_journal_entries WHERE appointment_id = appointments.id)
          OR EXISTS (SELECT 1 FROM financial_records WHERE appointment_id = appointments.id)
          OR EXISTS (SELECT 1 FROM evolutions WHERE appointment_id = appointments.id)
          OR EXISTS (SELECT 1 FROM patient_wallet_transactions WHERE appointment_id = appointments.id)
          OR EXISTS (SELECT 1 FROM session_credits WHERE source_appointment_id = appointments.id)
          OR EXISTS (SELECT 1 FROM appointment_reschedules WHERE appointment_id = appointments.id)
          OR EXISTS (SELECT 1 FROM appointments a2 WHERE a2.rescheduled_to_id = appointments.id)
        )
    `,
      [CUTOFF]
    );
    const protectedIds = protectedQ.rows.map((r) => r.id as number);
    console.log(`Appointments protegidos (mantidos): ${protectedIds.length}`);
    console.log("IDs protegidos:", protectedIds);

    await client.query("BEGIN");

    // Apaga appointments criados hoje EXCETO os protegidos
    const del = await client.query(
      `
      DELETE FROM appointments
      WHERE created_at::date = $1
        AND id <> ALL($2::int[])
    `,
      [CUTOFF, protectedIds]
    );
    console.log(`Appointments deletados: ${del.rowCount}`);

    // Validações
    const after = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM appointments WHERE created_at::date = $1) AS restantes_hoje,
        (SELECT COUNT(*)::int FROM appointments) AS total_appts,
        (SELECT COUNT(*)::int FROM financial_records) AS total_frs
    `, [CUTOFF]);
    console.log("Depois:", after.rows[0]);

    // Sanity: nenhuma FK quebrou
    const orphan = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM financial_records fr
          WHERE fr.appointment_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.id = fr.appointment_id)) AS frs_orphans,
        (SELECT COUNT(*)::int FROM accounting_journal_entries e
          WHERE e.appointment_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.id = e.appointment_id)) AS entries_orphans
    `);
    console.log("Órfãos após:", orphan.rows[0]);
    if (orphan.rows[0].frs_orphans > 0 || orphan.rows[0].entries_orphans > 0) {
      throw new Error("Quebra de integridade detectada — abortando");
    }

    if (DRY_RUN) {
      await client.query("ROLLBACK");
      console.log("\nDRY-RUN: ROLLBACK");
    } else {
      await client.query("COMMIT");
      console.log("\nCOMMIT aplicado.");
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("\nErro, ROLLBACK:", err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

run();
