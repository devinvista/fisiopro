/**
 * accounting.routes — Categorização contábil por procedimento.
 *
 * Endpoints:
 *  - GET    /accounting/accounts              → lista contas contábeis (system + clínica)
 *  - POST   /accounting/accounts              → cria sub-conta filha (gated `financial.view.accounting`)
 *  - PUT    /accounting/accounts/:id          → renomeia conta (apenas não-system)
 *  - DELETE /accounting/accounts/:id          → desativa conta (apenas não-system, sem uso ativo)
 *  - GET    /accounting/dre-by-procedure      → DRE agregado por procedimento (período)
 *
 * Convenções:
 *  - Contas com `is_system='true'` são imutáveis; usuário só edita as criadas
 *    pela clínica (sub-contas filhas de 4.1.1 e 4.1.2 normalmente).
 *  - O `code` deve seguir o padrão de prefixo do pai (ex.: `4.1.1.01`).
 */
import { Router } from "express";
import { db, accountingAccountsTable, accountingJournalEntriesTable, accountingJournalLinesTable, proceduresTable, appointmentsTable, financialRecordsTable, patientsTable, sessionCreditsTable } from "@workspace/db";
import { eq, and, sql, gte, lte, isNull, or, desc, isNotNull } from "drizzle-orm";
import { z } from "zod/v4";
import type { AuthRequest } from "../../../middleware/auth.js";
import { requirePermission } from "../../../middleware/rbac.js";
import { requireFeature } from "../../../middleware/plan-features.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { validateBody } from "../../../utils/validate.js";
import { HttpError } from "../../../utils/httpError.js";
import { recognizeMonthlyInvoiceRevenuePartial } from "../../clinical/medical-records/treatment-plans.revenue-recognition.js";

const router = Router();

// Filtro tenant: contas system (clinic_id NULL) + contas da clínica
function clinicAccountFilter(clinicId: number | null | undefined) {
  if (!clinicId) return isNull(accountingAccountsTable.clinicId);
  return or(
    isNull(accountingAccountsTable.clinicId),
    eq(accountingAccountsTable.clinicId, clinicId),
  );
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createAccountSchema = z.object({
  code: z.string().min(3, "code obrigatório (ex.: 4.1.1.01)").max(20).regex(/^[0-9.]+$/, "code deve conter apenas dígitos e pontos"),
  name: z.string().min(1, "nome obrigatório").max(120),
  type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
  normalBalance: z.enum(["debit", "credit"]),
});

const updateAccountSchema = z.object({
  name: z.string().min(1).max(120).optional(),
});

const dreByProcedureQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from deve ser YYYY-MM-DD"),
  to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to deve ser YYYY-MM-DD"),
});

// ─── GET /accounting/accounts ─────────────────────────────────────────────────
router.get(
  "/accounting/accounts",
  requireFeature("financial.view.accounting"),
  requirePermission("financial.read"),
  asyncHandler(async (req: AuthRequest, res) => {
    const clinicId = req.clinicId ?? null;
    const rows = await db
      .select({
        id: accountingAccountsTable.id,
        code: accountingAccountsTable.code,
        name: accountingAccountsTable.name,
        type: accountingAccountsTable.type,
        normalBalance: accountingAccountsTable.normalBalance,
        isSystem: accountingAccountsTable.isSystem,
        clinicId: accountingAccountsTable.clinicId,
      })
      .from(accountingAccountsTable)
      .where(clinicAccountFilter(clinicId))
      .orderBy(accountingAccountsTable.code);
    res.json({ accounts: rows });
  }),
);

// ─── POST /accounting/accounts ────────────────────────────────────────────────
router.post(
  "/accounting/accounts",
  requireFeature("financial.view.accounting"),
  requirePermission("financial.write"),
  asyncHandler(async (req: AuthRequest, res) => {
    const body = validateBody(createAccountSchema, req.body, res);
    if (!body) return;
    const clinicId = req.clinicId ?? null;
    if (!clinicId) throw HttpError.badRequest("Clínica não identificada");

    // Verifica colisão (mesma clínica + mesmo code)
    const [existing] = await db
      .select({ id: accountingAccountsTable.id })
      .from(accountingAccountsTable)
      .where(and(eq(accountingAccountsTable.clinicId, clinicId), eq(accountingAccountsTable.code, body.code)))
      .limit(1);
    if (existing) throw HttpError.badRequest(`Conta com code=${body.code} já existe nesta clínica`);

    const [created] = await db
      .insert(accountingAccountsTable)
      .values({
        clinicId,
        code: body.code,
        name: body.name,
        type: body.type,
        normalBalance: body.normalBalance,
        isSystem: "false",
      })
      .returning();
    res.status(201).json(created);
  }),
);

// ─── PUT /accounting/accounts/:id ─────────────────────────────────────────────
router.put(
  "/accounting/accounts/:id",
  requireFeature("financial.view.accounting"),
  requirePermission("financial.write"),
  asyncHandler(async (req: AuthRequest, res) => {
    const id = parseInt(req.params.id as string);
    if (!Number.isFinite(id)) throw HttpError.badRequest("id inválido");
    const body = validateBody(updateAccountSchema, req.body, res);
    if (!body) return;
    const clinicId = req.clinicId ?? null;

    const [account] = await db
      .select()
      .from(accountingAccountsTable)
      .where(eq(accountingAccountsTable.id, id))
      .limit(1);
    if (!account) throw HttpError.notFound("Conta não encontrada");
    if (account.isSystem === "true") {
      throw HttpError.badRequest("Conta de sistema não pode ser alterada");
    }
    if (account.clinicId !== clinicId) {
      throw HttpError.forbidden("Conta pertence a outra clínica");
    }

    const [updated] = await db
      .update(accountingAccountsTable)
      .set({ name: body.name ?? account.name })
      .where(eq(accountingAccountsTable.id, id))
      .returning();
    res.json(updated);
  }),
);

// ─── DELETE /accounting/accounts/:id ──────────────────────────────────────────
router.delete(
  "/accounting/accounts/:id",
  requireFeature("financial.view.accounting"),
  requirePermission("financial.write"),
  asyncHandler(async (req: AuthRequest, res) => {
    const id = parseInt(req.params.id as string);
    if (!Number.isFinite(id)) throw HttpError.badRequest("id inválido");
    const clinicId = req.clinicId ?? null;

    const [account] = await db
      .select()
      .from(accountingAccountsTable)
      .where(eq(accountingAccountsTable.id, id))
      .limit(1);
    if (!account) throw HttpError.notFound("Conta não encontrada");
    if (account.isSystem === "true") {
      throw HttpError.badRequest("Conta de sistema não pode ser removida");
    }
    if (account.clinicId !== clinicId) {
      throw HttpError.forbidden("Conta pertence a outra clínica");
    }

    // Bloqueia remoção se existir lançamento usando esta conta
    const [usage] = await db
      .select({ c: sql<string>`COUNT(*)` })
      .from(accountingJournalLinesTable)
      .where(eq(accountingJournalLinesTable.accountId, id));
    if (Number(usage?.c ?? 0) > 0) {
      throw HttpError.badRequest("Conta possui lançamentos contábeis e não pode ser removida");
    }
    // Bloqueia remoção se algum procedimento ainda referencia
    const [pUsage] = await db
      .select({ c: sql<string>`COUNT(*)` })
      .from(proceduresTable)
      .where(eq(proceduresTable.accountingAccountId, id));
    if (Number(pUsage?.c ?? 0) > 0) {
      throw HttpError.badRequest("Conta está em uso por procedimentos");
    }

    await db.delete(accountingAccountsTable).where(eq(accountingAccountsTable.id, id));
    res.status(204).end();
  }),
);

// ─── GET /accounting/dre-by-procedure ─────────────────────────────────────────
// Agrega receita reconhecida (créditos em contas de receita) por procedimento
// no período. Retorna também o nome da conta contábil usada (quando há).
router.get(
  "/accounting/dre-by-procedure",
  requireFeature("financial.view.accounting"),
  requirePermission("financial.read"),
  asyncHandler(async (req: AuthRequest, res) => {
    const parsed = dreByProcedureQuerySchema.safeParse({
      from: req.query.from,
      to: req.query.to,
    });
    if (!parsed.success) {
      throw HttpError.badRequest(parsed.error.issues.map((i) => i.message).join("; "));
    }
    const { from, to } = parsed.data;
    const clinicId = req.clinicId ?? null;

    const clinicCondEntries = clinicId
      ? eq(accountingJournalEntriesTable.clinicId, clinicId)
      : sql`true`;

    // Soma créditos em contas de receita agrupado por procedure
    const rows = await db
      .select({
        procedureId: accountingJournalEntriesTable.procedureId,
        procedureName: proceduresTable.name,
        accountId: accountingJournalLinesTable.accountId,
        accountCode: accountingAccountsTable.code,
        accountName: accountingAccountsTable.name,
        totalRevenue: sql<string>`COALESCE(SUM(${accountingJournalLinesTable.creditAmount}::numeric), 0)`,
        entries: sql<string>`COUNT(DISTINCT ${accountingJournalEntriesTable.id})`,
      })
      .from(accountingJournalLinesTable)
      .innerJoin(accountingJournalEntriesTable, eq(accountingJournalLinesTable.entryId, accountingJournalEntriesTable.id))
      .innerJoin(accountingAccountsTable, eq(accountingJournalLinesTable.accountId, accountingAccountsTable.id))
      .leftJoin(proceduresTable, eq(accountingJournalEntriesTable.procedureId, proceduresTable.id))
      .where(and(
        clinicCondEntries,
        eq(accountingAccountsTable.type, "revenue"),
        gte(accountingJournalEntriesTable.entryDate, from),
        lte(accountingJournalEntriesTable.entryDate, to),
      ))
      .groupBy(
        accountingJournalEntriesTable.procedureId,
        proceduresTable.name,
        accountingJournalLinesTable.accountId,
        accountingAccountsTable.code,
        accountingAccountsTable.name,
      )
      .orderBy(desc(sql`COALESCE(SUM(${accountingJournalLinesTable.creditAmount}::numeric), 0)`));

    // Total geral
    const [totalRow] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${accountingJournalLinesTable.creditAmount}::numeric), 0)`,
      })
      .from(accountingJournalLinesTable)
      .innerJoin(accountingJournalEntriesTable, eq(accountingJournalLinesTable.entryId, accountingJournalEntriesTable.id))
      .innerJoin(accountingAccountsTable, eq(accountingJournalLinesTable.accountId, accountingAccountsTable.id))
      .where(and(
        clinicCondEntries,
        eq(accountingAccountsTable.type, "revenue"),
        gte(accountingJournalEntriesTable.entryDate, from),
        lte(accountingJournalEntriesTable.entryDate, to),
      ));

    res.json({
      from,
      to,
      total: Number(totalRow?.total ?? 0),
      rows: rows.map((r) => ({
        procedureId: r.procedureId,
        procedureName: r.procedureName ?? (r.procedureId ? `#${r.procedureId}` : "(sem procedimento)"),
        accountId: r.accountId,
        accountCode: r.accountCode,
        accountName: r.accountName,
        totalRevenue: Number(r.totalRevenue ?? 0),
        entries: Number(r.entries ?? 0),
      })),
    });
  }),
);

// ─── GET /accounting/repair-revenue ───────────────────────────────────────────
// Diagnóstico: lista agendamentos concluídos sem reconhecimento de receita.
router.get(
  "/accounting/repair-revenue",
  requireFeature("financial.view.accounting"),
  requirePermission("financial.read"),
  asyncHandler(async (req: AuthRequest, res) => {
    const clinicId = req.clinicId ?? null;

    const clinicFilter = clinicId
      ? sql`fr.clinic_id = ${clinicId}`
      : sql`true`;

    const rows = await db.execute(sql`
      SELECT
        a.id                   AS appointment_id,
        a.date                 AS appointment_date,
        a.monthly_invoice_id,
        p.name                 AS patient_name,
        fr.amount              AS invoice_amount,
        fr.recognized_amount,
        fr.status              AS invoice_status,
        fr.transaction_type,
        fr.clinic_id
      FROM appointments a
      JOIN financial_records fr ON fr.id = a.monthly_invoice_id
      JOIN patients p ON p.id = a.patient_id
      WHERE a.status IN ('concluido', 'compareceu')
        AND a.monthly_invoice_id IS NOT NULL
        AND fr.transaction_type IN ('faturaPlano', 'faturaPlanoAvulsoMensal')
        AND fr.status NOT IN ('cancelado', 'estornado')
        AND fr.amount::numeric > 0
        AND ${clinicFilter}
        AND NOT EXISTS (
          SELECT 1
          FROM accounting_journal_entries je
          WHERE je.financial_record_id = fr.id
            AND je.appointment_id = a.id
            AND je.event_type IN ('wallet_usage_revenue', 'receivable_revenue')
            AND je.reversal_of_entry_id IS NULL
        )
      ORDER BY a.date DESC
      LIMIT 200
    `);

    const appointments = (rows as any[]).map((r) => ({
      appointmentId: Number(r.appointment_id),
      appointmentDate: r.appointment_date,
      monthlyInvoiceId: Number(r.monthly_invoice_id),
      patientName: r.patient_name ?? "(sem nome)",
      invoiceAmount: Number(r.invoice_amount ?? 0),
      recognizedAmount: Number(r.recognized_amount ?? 0),
      invoiceStatus: r.invoice_status,
      transactionType: r.transaction_type,
      clinicId: Number(r.clinic_id),
    }));

    res.json({ count: appointments.length, appointments });
  }),
);

// ─── POST /accounting/repair-revenue ──────────────────────────────────────────
// Executa reconhecimento de receita para todos os agendamentos pendentes.
router.post(
  "/accounting/repair-revenue",
  requireFeature("financial.view.accounting"),
  requirePermission("financial.write"),
  asyncHandler(async (req: AuthRequest, res) => {
    const clinicId = req.clinicId ?? null;

    const clinicFilter = clinicId
      ? sql`fr.clinic_id = ${clinicId}`
      : sql`true`;

    const rows = await db.execute(sql`
      SELECT
        a.id                   AS appointment_id,
        a.date                 AS appointment_date,
        a.monthly_invoice_id,
        fr.clinic_id
      FROM appointments a
      JOIN financial_records fr ON fr.id = a.monthly_invoice_id
      WHERE a.status IN ('concluido', 'compareceu')
        AND a.monthly_invoice_id IS NOT NULL
        AND fr.transaction_type IN ('faturaPlano', 'faturaPlanoAvulsoMensal')
        AND fr.status NOT IN ('cancelado', 'estornado')
        AND fr.amount::numeric > 0
        AND ${clinicFilter}
        AND NOT EXISTS (
          SELECT 1
          FROM accounting_journal_entries je
          WHERE je.financial_record_id = fr.id
            AND je.appointment_id = a.id
            AND je.event_type IN ('wallet_usage_revenue', 'receivable_revenue')
            AND je.reversal_of_entry_id IS NULL
        )
      ORDER BY a.date ASC
      LIMIT 200
    `);

    const pending = rows as Array<{
      appointment_id: unknown;
      appointment_date: unknown;
      monthly_invoice_id: unknown;
    }>;

    let repaired = 0;
    let skipped = 0;
    const errors: Array<{ appointmentId: number; invoiceId: number; error: string }> = [];

    for (const r of pending) {
      const appointmentId = Number(r.appointment_id);
      const monthlyInvoiceId = Number(r.monthly_invoice_id);
      const appointmentDate = String(r.appointment_date).slice(0, 10);
      try {
        const result = await recognizeMonthlyInvoiceRevenuePartial({
          monthlyInvoiceId,
          appointmentId,
          appointmentDate,
        });
        if (result.recognized) {
          repaired++;
        } else {
          skipped++;
        }
      } catch (err: any) {
        errors.push({
          appointmentId,
          invoiceId: monthlyInvoiceId,
          error: err?.message ?? String(err),
        });
      }
    }

    res.json({
      found: pending.length,
      repaired,
      skipped,
      errors,
    });
  }),
);

// ─── GET /accounting/plan-invoices ────────────────────────────────────────────
// Lista faturas de plano mensal (faturaPlano + faturaPlanoAvulsoMensal) do
// mês/ano selecionado, com contagem de sessões e fragmentas reconhecidas.
router.get(
  "/accounting/plan-invoices",
  requireFeature("financial.view.accounting"),
  requirePermission("financial.read"),
  asyncHandler(async (req: AuthRequest, res) => {
    const clinicId = req.clinicId ?? null;
    const monthRaw = parseInt(req.query.month as string);
    const yearRaw  = parseInt(req.query.year  as string);
    if (!Number.isFinite(monthRaw) || monthRaw < 1 || monthRaw > 12)
      throw HttpError.badRequest("month inválido (1–12)");
    if (!Number.isFinite(yearRaw) || yearRaw < 2020 || yearRaw > 2100)
      throw HttpError.badRequest("year inválido");

    const clinicFilter = clinicId
      ? sql`fr.clinic_id = ${clinicId}`
      : sql`TRUE`;

    const rows = await db.execute(sql`
      SELECT
        fr.id,
        fr.amount::numeric                                AS amount,
        fr.recognized_amount::numeric                     AS recognized_amount,
        fr.recognition_credits_total,
        fr.recognition_credits_consumed,
        fr.status                                         AS invoice_status,
        fr.transaction_type,
        fr.description,
        fr.due_date::text                                 AS due_date,
        fr.plan_month_ref::text                           AS plan_month_ref,
        p.name                                            AS patient_name,
        p.id                                              AS patient_id,
        (SELECT COUNT(*)::int
           FROM appointments a
          WHERE a.monthly_invoice_id = fr.id
            AND a.status <> 'cancelado')                  AS appointment_count,
        (SELECT COUNT(*)::int
           FROM accounting_journal_entries je
          WHERE je.financial_record_id = fr.id
            AND je.event_type IN ('wallet_usage_revenue', 'receivable_revenue')
            AND je.reversal_of_entry_id IS NULL)          AS entry_count
      FROM financial_records fr
      JOIN patients p ON p.id = fr.patient_id
      WHERE fr.transaction_type IN ('faturaPlano', 'faturaPlanoAvulsoMensal')
        AND fr.status NOT IN ('cancelado', 'estornado')
        AND ${clinicFilter}
        AND (
          (EXTRACT(YEAR  FROM fr.due_date) = ${yearRaw}
            AND EXTRACT(MONTH FROM fr.due_date) = ${monthRaw})
          OR
          (EXTRACT(YEAR  FROM fr.plan_month_ref) = ${yearRaw}
            AND EXTRACT(MONTH FROM fr.plan_month_ref) = ${monthRaw})
        )
      ORDER BY p.name ASC, fr.id ASC
    `);

    const invoices = (rows as any[]).map((r) => ({
      id:                       Number(r.id),
      amount:                   Number(r.amount ?? 0),
      recognizedAmount:         Number(r.recognized_amount ?? 0),
      recognitionCreditsTotal:  r.recognition_credits_total != null ? Number(r.recognition_credits_total) : null,
      recognitionCreditsConsumed: Number(r.recognition_credits_consumed ?? 0),
      invoiceStatus:            r.invoice_status,
      transactionType:          r.transaction_type,
      description:              r.description ?? null,
      dueDate:                  r.due_date ?? null,
      planMonthRef:             r.plan_month_ref ?? null,
      patientName:              r.patient_name ?? "(sem nome)",
      patientId:                Number(r.patient_id),
      appointmentCount:         Number(r.appointment_count ?? 0),
      entryCount:               Number(r.entry_count ?? 0),
    }));

    res.json({ invoices });
  }),
);

// ─── GET /accounting/invoice-fragments/:id ────────────────────────────────────
// Retorna as fragmentas contábeis (uma por sessão) de uma fatura mensal,
// com status da sessão vinculada e crédito de reposição gerado (se houver).
router.get(
  "/accounting/invoice-fragments/:id",
  requireFeature("financial.view.accounting"),
  requirePermission("financial.read"),
  asyncHandler(async (req: AuthRequest, res) => {
    const clinicId = req.clinicId ?? null;
    const invoiceId = parseInt(req.params.id as string);
    if (!Number.isFinite(invoiceId)) throw HttpError.badRequest("id inválido");

    // Fetch invoice
    const [invoice] = await db
      .select()
      .from(financialRecordsTable)
      .where(eq(financialRecordsTable.id, invoiceId))
      .limit(1);

    if (!invoice) throw HttpError.notFound("Fatura não encontrada");
    if (clinicId && invoice.clinicId !== clinicId) throw HttpError.forbidden("Fatura de outra clínica");

    const [patient] = await db
      .select({ name: patientsTable.name })
      .from(patientsTable)
      .where(eq(patientsTable.id, invoice.patientId!))
      .limit(1);

    // Build appointment query based on invoice type
    let apptRows: any[];
    if (
      invoice.transactionType === "faturaPlanoAvulsoMensal" &&
      invoice.treatmentPlanProcedureId &&
      invoice.planMonthRef
    ) {
      const monthStart = String(invoice.planMonthRef).slice(0, 10);
      apptRows = (await db.execute(sql`
        SELECT
          a.id            AS appointment_id,
          a.date::text    AS appointment_date,
          a.status        AS appointment_status,
          je.id           AS entry_id,
          je.entry_date::text AS entry_date,
          je.event_type   AS entry_event_type,
          je.status       AS entry_status,
          (SELECT COALESCE(SUM(jl.debit_amount), 0)::numeric
             FROM accounting_journal_lines jl
            WHERE jl.entry_id = je.id) AS entry_amount,
          sc.id           AS credit_id,
          sc.origin       AS credit_origin,
          sc.status       AS credit_status,
          sc.quantity     AS credit_quantity,
          sc.used_quantity AS credit_used_quantity
        FROM appointments a
        LEFT JOIN accounting_journal_entries je
          ON je.financial_record_id = ${invoiceId}
         AND je.appointment_id = a.id
         AND je.event_type IN ('wallet_usage_revenue', 'receivable_revenue')
         AND je.reversal_of_entry_id IS NULL
        LEFT JOIN session_credits sc
          ON sc.source_appointment_id = a.id
         AND sc.origin IN ('reposicaoFalta', 'reposicaoRemarcacao')
        WHERE a.treatment_plan_procedure_id = ${invoice.treatmentPlanProcedureId}
          AND a.date >= ${monthStart}::date
          AND a.date <  (${monthStart}::date + INTERVAL '1 month')
          AND a.status <> 'cancelado'
        ORDER BY a.date ASC, a.id ASC
      `)) as any[];
    } else {
      apptRows = (await db.execute(sql`
        SELECT
          a.id            AS appointment_id,
          a.date::text    AS appointment_date,
          a.status        AS appointment_status,
          je.id           AS entry_id,
          je.entry_date::text AS entry_date,
          je.event_type   AS entry_event_type,
          je.status       AS entry_status,
          (SELECT COALESCE(SUM(jl.debit_amount), 0)::numeric
             FROM accounting_journal_lines jl
            WHERE jl.entry_id = je.id) AS entry_amount,
          sc.id           AS credit_id,
          sc.origin       AS credit_origin,
          sc.status       AS credit_status,
          sc.quantity     AS credit_quantity,
          sc.used_quantity AS credit_used_quantity
        FROM appointments a
        LEFT JOIN accounting_journal_entries je
          ON je.financial_record_id = ${invoiceId}
         AND je.appointment_id = a.id
         AND je.event_type IN ('wallet_usage_revenue', 'receivable_revenue')
         AND je.reversal_of_entry_id IS NULL
        LEFT JOIN session_credits sc
          ON sc.source_appointment_id = a.id
         AND sc.origin IN ('reposicaoFalta', 'reposicaoRemarcacao')
        WHERE a.monthly_invoice_id = ${invoiceId}
          AND a.status <> 'cancelado'
        ORDER BY a.date ASC, a.id ASC
      `)) as any[];
    }

    const fragments = (apptRows as any[]).map((r) => ({
      appointmentId:      Number(r.appointment_id),
      appointmentDate:    r.appointment_date ?? null,
      appointmentStatus:  r.appointment_status ?? "pendente",
      entryId:            r.entry_id != null ? Number(r.entry_id) : null,
      entryDate:          r.entry_date ?? null,
      entryAmount:        r.entry_amount != null ? Number(r.entry_amount) : null,
      entryEventType:     r.entry_event_type ?? null,
      entryStatus:        r.entry_status ?? null,
      creditId:           r.credit_id != null ? Number(r.credit_id) : null,
      creditOrigin:       r.credit_origin ?? null,
      creditStatus:       r.credit_status ?? null,
      creditQuantity:     r.credit_quantity != null ? Number(r.credit_quantity) : null,
      creditUsedQuantity: r.credit_used_quantity != null ? Number(r.credit_used_quantity) : null,
    }));

    res.json({
      invoice: {
        id:                       invoice.id,
        amount:                   Number(invoice.amount ?? 0),
        recognizedAmount:         Number(invoice.recognizedAmount ?? 0),
        recognitionCreditsTotal:  invoice.recognitionCreditsTotal ?? null,
        recognitionCreditsConsumed: invoice.recognitionCreditsConsumed ?? 0,
        invoiceStatus:            invoice.status,
        transactionType:          invoice.transactionType,
        patientName:              patient?.name ?? "(sem nome)",
        dueDate:                  invoice.dueDate ? String(invoice.dueDate) : null,
        planMonthRef:             invoice.planMonthRef ? String(invoice.planMonthRef) : null,
      },
      fragments,
    });
  }),
);

export default router;

