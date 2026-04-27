/**
 * accounting.routes — Sprint 3 T8 (Categorização contábil por procedimento).
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
import { db, accountingAccountsTable, accountingJournalEntriesTable, accountingJournalLinesTable, proceduresTable } from "@workspace/db";
import { eq, and, sql, gte, lte, isNull, or, desc } from "drizzle-orm";
import { z } from "zod/v4";
import type { AuthRequest } from "../../../middleware/auth.js";
import { requirePermission } from "../../../middleware/rbac.js";
import { requireFeature } from "../../../middleware/plan-features.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { validateBody } from "../../../utils/validate.js";
import { HttpError } from "../../../utils/httpError.js";

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

export default router;
