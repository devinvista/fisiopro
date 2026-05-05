import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { authMiddleware, AuthRequest } from "../../../middleware/auth.js";
import { requireSuperAdmin } from "../../../middleware/rbac.js";
import { z } from "zod/v4";

const router = Router();
router.use(authMiddleware);
router.use(requireSuperAdmin());

const afterDateSchema = z.object({
  afterDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "afterDate deve ser YYYY-MM-DD"),
});

/**
 * Retorna a contagem de registros que seriam apagados por tabela,
 * dado um ponto de corte (afterDate). Não modifica nenhum dado.
 *
 * POST /admin/data-cleanup/preview
 * Body: { afterDate: "YYYY-MM-DD" }
 */
router.post("/preview", async (req: AuthRequest, res) => {
  const parsed = afterDateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Bad Request", message: parsed.error.issues[0]?.message });
    return;
  }
  const { afterDate } = parsed.data;

  try {
    const counts = await previewCounts(afterDate);
    res.json({ afterDate, counts, total: counts.reduce((s, r) => s + r.count, 0) });
  } catch (err) {
    console.error("[data-cleanup/preview]", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * Executa o hard delete de todos os registros criados após afterDate,
 * em transação única e na ordem correta de FK constraints.
 *
 * POST /admin/data-cleanup/execute
 * Body: { afterDate: "YYYY-MM-DD", confirm: true }
 */
router.post("/execute", async (req: AuthRequest, res) => {
  const parsed = afterDateSchema
    .extend({ confirm: z.literal(true, { error: 'confirm deve ser true' }) })
    .safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "Bad Request", message: parsed.error.issues[0]?.message });
    return;
  }
  const { afterDate } = parsed.data;

  try {
    const before = await previewCounts(afterDate);
    const total = before.reduce((s, r) => s + r.count, 0);

    if (total === 0) {
      res.json({ afterDate, deleted: [], total: 0, message: "Nenhum registro encontrado após a data informada." });
      return;
    }

    const deleted = await runHardDelete(afterDate);
    res.json({ afterDate, deleted, total: deleted.reduce((s, r) => s + r.deleted, 0) });
  } catch (err) {
    console.error("[data-cleanup/execute]", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function previewCounts(afterDate: string) {
  const rows = await db.execute(sql`
    SELECT 'appointments'               AS tabela, COUNT(*)::int AS count FROM appointments                WHERE created_at > ${afterDate}::date
    UNION ALL
    SELECT 'evolutions',                           COUNT(*)::int           FROM evolutions                 WHERE created_at > ${afterDate}::date
       OR appointment_id IN (SELECT id FROM appointments WHERE created_at > ${afterDate}::date)
    UNION ALL
    SELECT 'financial_records',                    COUNT(*)::int           FROM financial_records          WHERE created_at > ${afterDate}::date
       OR appointment_id IN (SELECT id FROM appointments WHERE created_at > ${afterDate}::date)
    UNION ALL
    SELECT 'accounting_journal_entries',           COUNT(*)::int           FROM accounting_journal_entries WHERE created_at > ${afterDate}::date
       OR appointment_id IN (SELECT id FROM appointments WHERE created_at > ${afterDate}::date)
    UNION ALL
    SELECT 'session_credits',                      COUNT(*)::int           FROM session_credits            WHERE created_at > ${afterDate}::date
       OR source_appointment_id IN (SELECT id FROM appointments WHERE created_at > ${afterDate}::date)
    UNION ALL
    SELECT 'appointment_reschedules',              COUNT(*)::int           FROM appointment_reschedules
       WHERE appointment_id IN (SELECT id FROM appointments WHERE created_at > ${afterDate}::date)
    UNION ALL
    SELECT 'patient_wallet_transactions',          COUNT(*)::int           FROM patient_wallet_transactions WHERE created_at > ${afterDate}::date
       OR appointment_id IN (SELECT id FROM appointments WHERE created_at > ${afterDate}::date)
       OR financial_record_id IN (SELECT id FROM financial_records WHERE created_at > ${afterDate}::date)
    UNION ALL
    SELECT 'treatment_plan_acceptance_tokens',     COUNT(*)::int           FROM treatment_plan_acceptance_tokens WHERE created_at > ${afterDate}::date
       OR plan_id IN (SELECT id FROM treatment_plans WHERE created_at > ${afterDate}::date)
    UNION ALL
    SELECT 'treatment_plan_procedures',            COUNT(*)::int           FROM treatment_plan_procedures  WHERE created_at > ${afterDate}::date
    UNION ALL
    SELECT 'treatment_plans',                      COUNT(*)::int           FROM treatment_plans            WHERE created_at > ${afterDate}::date
    UNION ALL
    SELECT 'patient_packages',                     COUNT(*)::int           FROM patient_packages           WHERE created_at > ${afterDate}::date
    UNION ALL
    SELECT 'billing_run_logs',                     COUNT(*)::int           FROM billing_run_logs           WHERE ran_at    > ${afterDate}::date
    UNION ALL
    SELECT 'audit_log',                            COUNT(*)::int           FROM audit_log                  WHERE created_at > ${afterDate}::date
    UNION ALL
    SELECT 'blocked_slots',                        COUNT(*)::int           FROM blocked_slots              WHERE created_at > ${afterDate}::date
    ORDER BY tabela
  `);

  return (rows.rows as { tabela: string; count: number }[]).map((r) => ({
    tabela: r.tabela,
    count: Number(r.count),
  }));
}

async function runHardDelete(afterDate: string) {
  const results: { tabela: string; deleted: number }[] = [];

  await db.transaction(async (tx) => {
    const del = async (tabela: string, q: string) => {
      const r = await tx.execute(sql.raw(q));
      results.push({ tabela, deleted: r.rowCount ?? 0 });
    };

    await del(
      "evolutions",
      `DELETE FROM evolutions
       WHERE created_at > '${afterDate}'::date
          OR appointment_id IN (SELECT id FROM appointments WHERE created_at > '${afterDate}'::date)`,
    );

    await del(
      "patient_wallet_transactions",
      `DELETE FROM patient_wallet_transactions
       WHERE created_at > '${afterDate}'::date
          OR appointment_id IN (SELECT id FROM appointments WHERE created_at > '${afterDate}'::date)
          OR financial_record_id IN (SELECT id FROM financial_records WHERE created_at > '${afterDate}'::date)`,
    );

    await del(
      "treatment_plan_acceptance_tokens",
      `DELETE FROM treatment_plan_acceptance_tokens
       WHERE created_at > '${afterDate}'::date
          OR plan_id IN (SELECT id FROM treatment_plans WHERE created_at > '${afterDate}'::date)`,
    );

    await del(
      "appointment_reschedules",
      `DELETE FROM appointment_reschedules
       WHERE appointment_id IN (SELECT id FROM appointments WHERE created_at > '${afterDate}'::date)`,
    );

    await del(
      "accounting_journal_entries",
      `DELETE FROM accounting_journal_entries
       WHERE created_at > '${afterDate}'::date
          OR appointment_id IN (SELECT id FROM appointments WHERE created_at > '${afterDate}'::date)`,
    );

    await del(
      "session_credits",
      `DELETE FROM session_credits
       WHERE created_at > '${afterDate}'::date
          OR source_appointment_id IN (SELECT id FROM appointments WHERE created_at > '${afterDate}'::date)`,
    );

    await del(
      "financial_records",
      `DELETE FROM financial_records
       WHERE created_at > '${afterDate}'::date
          OR appointment_id IN (SELECT id FROM appointments WHERE created_at > '${afterDate}'::date)`,
    );

    await del("appointments",            `DELETE FROM appointments            WHERE created_at > '${afterDate}'::date`);
    await del("treatment_plan_procedures", `DELETE FROM treatment_plan_procedures WHERE created_at > '${afterDate}'::date`);
    await del("treatment_plans",         `DELETE FROM treatment_plans         WHERE created_at > '${afterDate}'::date`);
    await del("patient_packages",        `DELETE FROM patient_packages        WHERE created_at > '${afterDate}'::date`);
    await del("billing_run_logs",        `DELETE FROM billing_run_logs        WHERE ran_at     > '${afterDate}'::date`);
    await del("audit_log",               `DELETE FROM audit_log               WHERE created_at > '${afterDate}'::date`);
    await del("blocked_slots",           `DELETE FROM blocked_slots           WHERE created_at > '${afterDate}'::date`);
  });

  return results.filter((r) => r.deleted > 0);
}

export default router;
