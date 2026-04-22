import { db } from "@workspace/db";
import {
  accountingAccountsTable,
  accountingJournalEntriesTable,
  accountingJournalLinesTable,
  receivableAllocationsTable,
} from "@workspace/db";
import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { todayBRT } from "../utils/dateUtils.js";

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

export async function postCashReceipt(input: Omit<JournalEntryInput, "lines" | "eventType"> & { amount: number; eventType?: string }, tx: Tx = db) {
  return createJournalEntry({
    ...input,
    eventType: input.eventType ?? "cash_receipt",
    lines: [
      { accountCode: ACCOUNT_CODES.cash, debit: input.amount },
      { accountCode: ACCOUNT_CODES.serviceRevenue, credit: input.amount },
    ],
  }, tx);
}

export async function postReceivableRevenue(input: Omit<JournalEntryInput, "lines" | "eventType"> & { amount: number; eventType?: string }, tx: Tx = db) {
  return createJournalEntry({
    ...input,
    eventType: input.eventType ?? "receivable_revenue",
    lines: [
      { accountCode: ACCOUNT_CODES.receivables, debit: input.amount },
      { accountCode: ACCOUNT_CODES.serviceRevenue, credit: input.amount },
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

export async function postWalletUsage(input: Omit<JournalEntryInput, "lines" | "eventType"> & { amount: number }, tx: Tx = db) {
  return createJournalEntry({
    ...input,
    eventType: "wallet_usage_revenue",
    lines: [
      { accountCode: ACCOUNT_CODES.customerAdvances, debit: input.amount },
      { accountCode: ACCOUNT_CODES.serviceRevenue, credit: input.amount },
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

export async function postPackageCreditUsage(input: Omit<JournalEntryInput, "lines" | "eventType"> & { amount: number }, tx: Tx = db) {
  return createJournalEntry({
    ...input,
    eventType: "package_credit_usage_revenue",
    lines: [
      { accountCode: ACCOUNT_CODES.customerAdvances, debit: input.amount },
      { accountCode: ACCOUNT_CODES.packageRevenue, credit: input.amount },
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