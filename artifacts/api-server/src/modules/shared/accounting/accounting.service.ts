import { db, pool } from "@workspace/db";
import {
  accountingAccountsTable,
  accountingJournalEntriesTable,
  accountingJournalLinesTable,
  receivableAllocationsTable,
} from "@workspace/db";
import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { todayBRT } from "../../../utils/dateUtils.js";

export const ACCOUNT_CODES = {
  cash: "1.1.1",
  receivables: "1.1.2",
  customerAdvances: "2.1.1",
  equity: "3.1.1",
  serviceRevenue: "4.1.1",
  packageRevenue: "4.1.2",
  operatingExpenses: "5.1.1",
  revenueReversals: "5.1.2",
} as const;

const SYSTEM_ACCOUNTS = [
  { code: ACCOUNT_CODES.cash, name: "Caixa/Banco", type: "asset", normalBalance: "debit" },
  { code: ACCOUNT_CODES.receivables, name: "Contas a Receber", type: "asset", normalBalance: "debit" },
  { code: ACCOUNT_CODES.customerAdvances, name: "Adiantamentos de Clientes", type: "liability", normalBalance: "credit" },
  { code: ACCOUNT_CODES.equity, name: "Patrimônio/Resultado Acumulado", type: "equity", normalBalance: "credit" },
  { code: ACCOUNT_CODES.serviceRevenue, name: "Receita de Atendimentos", type: "revenue", normalBalance: "credit" },
  { code: ACCOUNT_CODES.packageRevenue, name: "Receita de Pacotes/Mensalidades Reconhecida", type: "revenue", normalBalance: "credit" },
  { code: ACCOUNT_CODES.operatingExpenses, name: "Despesas Operacionais", type: "expense", normalBalance: "debit" },
  { code: ACCOUNT_CODES.revenueReversals, name: "Estornos/Cancelamentos de Receita", type: "expense", normalBalance: "debit" },
];

type Tx = typeof db;

type JournalLineInput = {
  accountCode: string;
  debit?: number;
  credit?: number;
  memo?: string | null;
};

type JournalEntryInput = {
  clinicId?: number | null;
  entryDate?: string;
  eventType: string;
  description: string;
  sourceType?: string | null;
  sourceId?: number | null;
  patientId?: number | null;
  appointmentId?: number | null;
  procedureId?: number | null;
  patientPackageId?: number | null;
  subscriptionId?: number | null;
  walletTransactionId?: number | null;
  financialRecordId?: number | null;
  reversalOfEntryId?: number | null;
  createdBy?: number | null;
  lines: JournalLineInput[];
};

function money(value: number): string {
  return Number(value || 0).toFixed(2);
}

function round(value: number): number {
  return Math.round(Number(value || 0) * 100) / 100;
}

async function ensureSystemAccounts(tx: Tx, clinicId?: number | null) {
  for (const account of SYSTEM_ACCOUNTS) {
    const clinicCondition = clinicId == null
      ? isNull(accountingAccountsTable.clinicId)
      : eq(accountingAccountsTable.clinicId, clinicId);
    const [existing] = await tx
      .select({ id: accountingAccountsTable.id })
      .from(accountingAccountsTable)
      .where(and(clinicCondition, eq(accountingAccountsTable.code, account.code)))
      .limit(1);

    if (!existing) {
      await tx.insert(accountingAccountsTable).values({
        clinicId: clinicId ?? null,
        code: account.code,
        name: account.name,
        type: account.type,
        normalBalance: account.normalBalance,
        isSystem: "true",
      });
    }
  }
}

export async function ensureAccountingReady(clinicId?: number | null, tx: Tx = db) {
  await ensureSystemAccounts(tx, clinicId ?? null);
}

/**
 * Resolve um código contábil válido — se a clínica configurou uma sub-conta
 * (`accounting_accounts.parent_id` ou conta filha) para um procedimento,
 * usamos esse código; caso contrário, retornamos o código padrão (fallback).
 *
 * Aceita tanto um id (`procedures.accounting_account_id`) quanto um código
 * já resolvido. Se o código não existir na clínica, faz fallback silencioso.
 */
export async function resolveAccountCodeById(
  accountId: number | null | undefined,
  fallbackCode: string,
  clinicId?: number | null,
  tx: Tx = db,
): Promise<string> {
  if (!accountId) return fallbackCode;
  const clinicCondition = clinicId == null
    ? isNull(accountingAccountsTable.clinicId)
    : eq(accountingAccountsTable.clinicId, clinicId);
  const [row] = await tx
    .select({ code: accountingAccountsTable.code })
    .from(accountingAccountsTable)
    .where(and(clinicCondition, eq(accountingAccountsTable.id, accountId)))
    .limit(1);
  return row?.code ?? fallbackCode;
}

export async function createJournalEntry(input: JournalEntryInput, tx: Tx = db) {
  const clinicId = input.clinicId ?? null;
  await ensureSystemAccounts(tx, clinicId);
  const clinicCondition = clinicId == null
    ? isNull(accountingAccountsTable.clinicId)
    : eq(accountingAccountsTable.clinicId, clinicId);

  const accounts = await tx
    .select({ id: accountingAccountsTable.id, code: accountingAccountsTable.code })
    .from(accountingAccountsTable)
    .where(and(clinicCondition, inArray(accountingAccountsTable.code, input.lines.map((line) => line.accountCode))));

  const accountByCode = new Map(accounts.map((account) => [account.code, account.id]));
  const debitTotal = round(input.lines.reduce((sum, line) => sum + Number(line.debit ?? 0), 0));
  const creditTotal = round(input.lines.reduce((sum, line) => sum + Number(line.credit ?? 0), 0));

  if (debitTotal <= 0 || creditTotal <= 0 || debitTotal !== creditTotal) {
    throw new Error(`Lançamento contábil não balanceado: débitos ${debitTotal.toFixed(2)} / créditos ${creditTotal.toFixed(2)}`);
  }

  for (const line of input.lines) {
    if (!accountByCode.get(line.accountCode)) {
      throw new Error(`Conta contábil não encontrada: ${line.accountCode}`);
    }
  }

  const [entry] = await tx.insert(accountingJournalEntriesTable).values({
    clinicId,
    entryDate: input.entryDate ?? todayBRT(),
    eventType: input.eventType,
    description: input.description,
    sourceType: input.sourceType ?? null,
    sourceId: input.sourceId ?? null,
    patientId: input.patientId ?? null,
    appointmentId: input.appointmentId ?? null,
    procedureId: input.procedureId ?? null,
    patientPackageId: input.patientPackageId ?? null,
    subscriptionId: input.subscriptionId ?? null,
    walletTransactionId: input.walletTransactionId ?? null,
    financialRecordId: input.financialRecordId ?? null,
    status: "posted",
    reversalOfEntryId: input.reversalOfEntryId ?? null,
    createdBy: input.createdBy ?? null,
  }).returning();

  await tx.insert(accountingJournalLinesTable).values(input.lines.map((line) => {
    const accountId = accountByCode.get(line.accountCode)!;
    return {
      entryId: entry.id,
      accountId,
      debitAmount: money(Number(line.debit ?? 0)),
      creditAmount: money(Number(line.credit ?? 0)),
      memo: line.memo ?? null,
    };
  }));

  return entry;
}

/**
 * ATENÇÃO — NÃO usar nos fluxos de cobrança de pacientes.
 *
 * Lança DIRETAMENTE D 1.1.1 (Caixa) / C 4.1.x (Receita), pulando a etapa
 * de recebível (1.1.2). Só é válido para cenários onde pagamento e entrega
 * do serviço ocorrem simultaneamente e SEM geração prévia de recebível
 * (ex.: venda de produto no balcão, bilheteria avulsa).
 *
 * Para os fluxos standard de sessões e planos, use a sequência correta:
 *   • Avulso pós-sessão:  postReceivableRevenue → postReceivableSettlement
 *   • Plano (P3):         postDeferredReceivable → postWalletUsage → postReceivableSettlement
 *   • Pagamento antecipado: postCashAdvance → postWalletUsage (na sessão)
 */
export async function postCashReceipt(input: Omit<JournalEntryInput, "lines" | "eventType"> & { amount: number; eventType?: string; revenueAccountCode?: string }, tx: Tx = db) {
  return createJournalEntry({
    ...input,
    eventType: input.eventType ?? "cash_receipt",
    lines: [
      { accountCode: ACCOUNT_CODES.cash, debit: input.amount },
      { accountCode: input.revenueAccountCode ?? ACCOUNT_CODES.serviceRevenue, credit: input.amount },
    ],
  }, tx);
}

export async function postReceivableRevenue(input: Omit<JournalEntryInput, "lines" | "eventType"> & { amount: number; eventType?: string; revenueAccountCode?: string }, tx: Tx = db) {
  return createJournalEntry({
    ...input,
    eventType: input.eventType ?? "receivable_revenue",
    lines: [
      { accountCode: ACCOUNT_CODES.receivables, debit: input.amount },
      { accountCode: input.revenueAccountCode ?? ACCOUNT_CODES.serviceRevenue, credit: input.amount },
    ],
  }, tx);
}

export async function postReceivableSettlement(input: Omit<JournalEntryInput, "lines" | "eventType"> & { amount: number; eventType?: string }, tx: Tx = db) {
  return createJournalEntry({
    ...input,
    eventType: input.eventType ?? "receivable_settlement",
    lines: [
      { accountCode: ACCOUNT_CODES.cash, debit: input.amount },
      { accountCode: ACCOUNT_CODES.receivables, credit: input.amount },
    ],
  }, tx);
}

export async function postWalletDeposit(input: Omit<JournalEntryInput, "lines" | "eventType"> & { amount: number }, tx: Tx = db) {
  return createJournalEntry({
    ...input,
    eventType: "wallet_deposit",
    lines: [
      { accountCode: ACCOUNT_CODES.cash, debit: input.amount },
      { accountCode: ACCOUNT_CODES.customerAdvances, credit: input.amount },
    ],
  }, tx);
}

export async function postWalletUsage(input: Omit<JournalEntryInput, "lines" | "eventType"> & { amount: number; revenueAccountCode?: string }, tx: Tx = db) {
  return createJournalEntry({
    ...input,
    eventType: "wallet_usage_revenue",
    lines: [
      { accountCode: ACCOUNT_CODES.customerAdvances, debit: input.amount },
      { accountCode: input.revenueAccountCode ?? ACCOUNT_CODES.serviceRevenue, credit: input.amount },
    ],
  }, tx);
}

/**
 * Sprint Financeiro 12 (P3) — Aceite contábil antecipado de fatura mensal.
 *
 * Postado no momento do aceite do plano (uma vez por mês de vigência).
 * Lança simultaneamente o **recebível** (D 1.1.2) e o **adiantamento**
 * (C 2.1.1, "obrigação de prestar serviço futuro"). A receita NÃO é
 * reconhecida aqui — só nasce com o consumo da sessão (P2:
 * `recognizeMonthlyInvoiceRevenuePartial` → `postWalletUsage`).
 *
 * Quando o paciente paga, o pagamento vira um SETTLEMENT puro
 * (`postReceivableSettlement`: D 1.1.1 / C 1.1.2), liquidando o
 * recebível, mas SEM tocar no adiantamento — ele só desce sessão a sessão.
 *
 * Idempotência: o callsite (`acceptPlanFinancials`) verifica se já existe
 * uma entry com `eventType='deferred_receivable'` e `sourceId=fatura.id`
 * antes de postar.
 */
export async function postDeferredReceivable(input: Omit<JournalEntryInput, "lines" | "eventType"> & { amount: number; eventType?: string }, tx: Tx = db) {
  return createJournalEntry({
    ...input,
    eventType: input.eventType ?? "deferred_receivable",
    lines: [
      { accountCode: ACCOUNT_CODES.receivables, debit: input.amount },
      { accountCode: ACCOUNT_CODES.customerAdvances, credit: input.amount },
    ],
  }, tx);
}

/**
 * Pagamento antecipado de fatura mensal (plano de tratamento) ANTES da
 * 1ª sessão do mês ser confirmada. Vai para Adiantamentos de Cliente
 * (passivo). A receita só é reconhecida no consumo (D: Adiantamentos /
 * C: Receita) via `postWalletUsage` na 1ª confirmação.
 *
 * NOTA: usado em planos sem `deferred_receivable` postado no aceite. Para
 * planos com recebível diferido, o pagamento é settlement puro via
 * `postReceivableSettlement`.
 */
export async function postCashAdvance(input: Omit<JournalEntryInput, "lines" | "eventType"> & { amount: number; eventType?: string }, tx: Tx = db) {
  return createJournalEntry({
    ...input,
    eventType: input.eventType ?? "cash_advance_receipt",
    lines: [
      { accountCode: ACCOUNT_CODES.cash, debit: input.amount },
      { accountCode: ACCOUNT_CODES.customerAdvances, credit: input.amount },
    ],
  }, tx);
}

/**
 * Sprint Financeiro 14 (Hardening) — Estorno PARCIAL de um `deferred_receivable`.
 *
 * Usado no cancelamento de plano (P3/P4) quando uma fatura mensal já teve
 * algumas sessões reconhecidas (`recognitionCreditsConsumed > 0`) mas
 * permanece em aberto (não paga). Posta uma entrada compensatória pelo
 * SALDO restante (`amount − recognizedAmount`):
 *
 *   D 2.1.1 (Adiantamentos)  — devolve a obrigação que o paciente não terá
 *   C 1.1.2 (Recebíveis)     — anula a expectativa de cobrar o saldo
 *
 * As fragmentas já reconhecidas (D 2.1.1 / C 4.1.2 via `postWalletUsage`)
 * ficam preservadas — receita por serviço prestado é definitiva.
 *
 * Diferença de `postReversal`: esta entry NÃO referencia o entry original
 * via `reversalOfEntryId` (não é um estorno integral) — usa `eventType=
 * 'deferred_receivable_partial_reversal'` para permitir a contabilização
 * do residual sem desfazer o histórico do aceite.
 */
export async function postPartialDeferredReversal(
  input: Omit<JournalEntryInput, "lines" | "eventType"> & { amount: number; eventType?: string },
  tx: Tx = db,
) {
  return createJournalEntry({
    ...input,
    eventType: input.eventType ?? "deferred_receivable_partial_reversal",
    lines: [
      { accountCode: ACCOUNT_CODES.customerAdvances, debit: input.amount },
      { accountCode: ACCOUNT_CODES.receivables, credit: input.amount },
    ],
  }, tx);
}

export async function postPackageSale(input: Omit<JournalEntryInput, "lines" | "eventType"> & { amount: number; paid: boolean }, tx: Tx = db) {
  return createJournalEntry({
    ...input,
    eventType: input.paid ? "package_sale_paid" : "package_sale_receivable",
    lines: [
      { accountCode: input.paid ? ACCOUNT_CODES.cash : ACCOUNT_CODES.receivables, debit: input.amount },
      { accountCode: ACCOUNT_CODES.customerAdvances, credit: input.amount },
    ],
  }, tx);
}

export async function postPackageCreditUsage(input: Omit<JournalEntryInput, "lines" | "eventType"> & { amount: number; revenueAccountCode?: string }, tx: Tx = db) {
  return createJournalEntry({
    ...input,
    eventType: "package_credit_usage_revenue",
    lines: [
      { accountCode: ACCOUNT_CODES.customerAdvances, debit: input.amount },
      { accountCode: input.revenueAccountCode ?? ACCOUNT_CODES.packageRevenue, credit: input.amount },
    ],
  }, tx);
}

export async function postExpense(input: Omit<JournalEntryInput, "lines" | "eventType"> & { amount: number }, tx: Tx = db) {
  return createJournalEntry({
    ...input,
    eventType: "expense_paid",
    lines: [
      { accountCode: ACCOUNT_CODES.operatingExpenses, debit: input.amount },
      { accountCode: ACCOUNT_CODES.cash, credit: input.amount },
    ],
  }, tx);
}

export async function postReversal(originalEntryId: number, input: Omit<JournalEntryInput, "lines" | "eventType" | "reversalOfEntryId"> & { eventType?: string }, tx: Tx = db) {
  const originalLines = await tx
    .select({
      accountId: accountingJournalLinesTable.accountId,
      debitAmount: accountingJournalLinesTable.debitAmount,
      creditAmount: accountingJournalLinesTable.creditAmount,
    })
    .from(accountingJournalLinesTable)
    .where(eq(accountingJournalLinesTable.entryId, originalEntryId));

  if (originalLines.length === 0) {
    throw new Error("Lançamento original sem linhas para estorno");
  }

  const [entry] = await tx.insert(accountingJournalEntriesTable).values({
    clinicId: input.clinicId ?? null,
    entryDate: input.entryDate ?? todayBRT(),
    eventType: input.eventType ?? "reversal",
    description: input.description,
    sourceType: input.sourceType ?? null,
    sourceId: input.sourceId ?? null,
    patientId: input.patientId ?? null,
    appointmentId: input.appointmentId ?? null,
    procedureId: input.procedureId ?? null,
    patientPackageId: input.patientPackageId ?? null,
    subscriptionId: input.subscriptionId ?? null,
    walletTransactionId: input.walletTransactionId ?? null,
    financialRecordId: input.financialRecordId ?? null,
    status: "posted",
    reversalOfEntryId: originalEntryId,
    createdBy: input.createdBy ?? null,
  }).returning();

  await tx.insert(accountingJournalLinesTable).values(originalLines.map((line) => ({
    entryId: entry.id,
    accountId: line.accountId,
    debitAmount: money(Number(line.creditAmount)),
    creditAmount: money(Number(line.debitAmount)),
    memo: "Estorno",
  })));

  await tx
    .update(accountingJournalEntriesTable)
    .set({ status: "reversed" })
    .where(eq(accountingJournalEntriesTable.id, originalEntryId));

  return entry;
}

export async function allocateReceivable(input: {
  clinicId?: number | null;
  paymentEntryId: number;
  receivableEntryId: number;
  patientId: number;
  amount: number;
  allocatedAt?: string;
}, tx: Tx = db) {
  await tx.insert(receivableAllocationsTable).values({
    clinicId: input.clinicId ?? null,
    paymentEntryId: input.paymentEntryId,
    receivableEntryId: input.receivableEntryId,
    patientId: input.patientId,
    amount: money(input.amount),
    allocatedAt: input.allocatedAt ?? todayBRT(),
  });
}

export async function getAccountingTotals(input: { clinicId?: number | null; startDate: string; endDate: string; patientId?: number }) {
  const conditions = [
    eq(accountingJournalEntriesTable.status, "posted"),
    gte(accountingJournalEntriesTable.entryDate, input.startDate),
    lte(accountingJournalEntriesTable.entryDate, input.endDate),
  ];
  if (input.clinicId != null) conditions.push(eq(accountingJournalEntriesTable.clinicId, input.clinicId));
  if (input.patientId != null) conditions.push(eq(accountingJournalEntriesTable.patientId, input.patientId));

  return db
    .select({
      code: accountingAccountsTable.code,
      type: accountingAccountsTable.type,
      debit: sql<number>`COALESCE(SUM(${accountingJournalLinesTable.debitAmount}::numeric), 0)`,
      credit: sql<number>`COALESCE(SUM(${accountingJournalLinesTable.creditAmount}::numeric), 0)`,
    })
    .from(accountingJournalLinesTable)
    .innerJoin(accountingJournalEntriesTable, eq(accountingJournalLinesTable.entryId, accountingJournalEntriesTable.id))
    .innerJoin(accountingAccountsTable, eq(accountingJournalLinesTable.accountId, accountingAccountsTable.id))
    .where(and(...conditions))
    .groupBy(accountingAccountsTable.code, accountingAccountsTable.type);
}

export async function getAccountingBalances(input: { clinicId?: number | null; patientId?: number }) {
  const conditions = [eq(accountingJournalEntriesTable.status, "posted")];
  if (input.clinicId != null) conditions.push(eq(accountingJournalEntriesTable.clinicId, input.clinicId));
  if (input.patientId != null) conditions.push(eq(accountingJournalEntriesTable.patientId, input.patientId));

  return db
    .select({
      code: accountingAccountsTable.code,
      type: accountingAccountsTable.type,
      debit: sql<number>`COALESCE(SUM(${accountingJournalLinesTable.debitAmount}::numeric), 0)`,
      credit: sql<number>`COALESCE(SUM(${accountingJournalLinesTable.creditAmount}::numeric), 0)`,
    })
    .from(accountingJournalLinesTable)
    .innerJoin(accountingJournalEntriesTable, eq(accountingJournalLinesTable.entryId, accountingJournalEntriesTable.id))
    .innerJoin(accountingAccountsTable, eq(accountingJournalLinesTable.accountId, accountingAccountsTable.id))
    .where(and(...conditions))
    .groupBy(accountingAccountsTable.code, accountingAccountsTable.type);
}

/**
 * Retorna o saldo de Adiantamentos de Clientes (2.1.1) filtrado pela
 * COMPETÊNCIA do mês selecionado.
 *
 * PRINCÍPIO DE COMPETÊNCIA (accrual):
 * Adiantamentos representam a obrigação de entrega de serviços — são
 * creditados pelo valor integral do deferred_receivable (total do plano) e
 * debitados conforme as sessões são reconhecidas como receita.
 * O pagamento em caixa é um evento FINANCEIRO separado: apenas move ativos
 * (D Caixa / C Contas a Receber) sem afetar Adiantamentos nem Receita.
 * Portanto, o saldo de Adiantamentos reflete serviços a entregar, não caixa
 * recebido — independente de a parcela estar paga ou pendente.
 *
 * Para entradas do tipo `deferred_receivable` (geradas no aceite do plano),
 * todos os meses futuros são lançados no mesmo dia (entry_date = data do
 * aceite). Por isso, a data de competência é lida da `due_date` do
 * `financial_record` vinculado, não da `entry_date` do lançamento.
 *
 * Para todos os demais lançamentos de 2.1.1 (reconhecimento de receita por
 * sessão, depósitos de carteira, estornos, etc.) a competência é a própria
 * `entry_date` — que já representa o dia em que o evento ocorreu.
 *
 * Usa SQL raw via pool.query para garantir que o COALESCE entre duas colunas
 * de tabelas diferentes seja gerado corretamente (evita ambiguidade no ORM).
 */
export async function getCustomerAdvancesByCompetence(input: {
  clinicId?: number | null;
  startDate: string;
  endDate: string;
}): Promise<number> {
  let queryText: string;
  let params: (string | number)[];

  if (input.clinicId != null) {
    queryText = `
      SELECT
        COALESCE(SUM(ajl.credit_amount::numeric), 0)
        - COALESCE(SUM(ajl.debit_amount::numeric), 0) AS advances
      FROM accounting_journal_lines ajl
      JOIN accounting_journal_entries aje ON aje.id = ajl.entry_id
      JOIN accounting_accounts aa ON aa.id = ajl.account_id
      LEFT JOIN financial_records fr ON fr.id = aje.financial_record_id
      WHERE aje.status = 'posted'
        AND aa.code = '2.1.1'
        AND aje.clinic_id = $1
        AND COALESCE(fr.due_date, aje.entry_date) BETWEEN $2 AND $3
    `;
    params = [input.clinicId, input.startDate, input.endDate];
  } else {
    queryText = `
      SELECT
        COALESCE(SUM(ajl.credit_amount::numeric), 0)
        - COALESCE(SUM(ajl.debit_amount::numeric), 0) AS advances
      FROM accounting_journal_lines ajl
      JOIN accounting_journal_entries aje ON aje.id = ajl.entry_id
      JOIN accounting_accounts aa ON aa.id = ajl.account_id
      LEFT JOIN financial_records fr ON fr.id = aje.financial_record_id
      WHERE aje.status = 'posted'
        AND aa.code = '2.1.1'
        AND COALESCE(fr.due_date, aje.entry_date) BETWEEN $1 AND $2
    `;
    params = [input.startDate, input.endDate];
  }

  const result = await pool.query<{ advances: string }>(queryText, params);
  const row = result.rows[0];
  return Math.max(0, Number(row?.advances ?? 0));
}