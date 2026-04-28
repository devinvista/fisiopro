/**
 * Sprint 3 — Geração lazy das faturas mensais de plano de tratamento.
 *
 * O aceite (`acceptPlanFinancials`) cria APENAS a fatura do mês corrente.
 * As próximas são geradas pelo job diário deste módulo:
 *
 *   • Para cada plano `vigente`/`ativo` aceito, com itens
 *     `recorrenteMensal`, garantimos a existência da `faturaPlano` do mês
 *     corrente em D-`toleranceDays` do `billingDay` do pacote (default
 *     5 dias antes — janela inclusiva [billingDay-tol, fim do mês]).
 *
 *   • Se houver meses pulados (paciente novo + plano antigo sem
 *     materialização, ou job parado por dias), preenchemos o gap em
 *     ordem cronológica do mês de aceite até o mês corrente.
 *
 *   • Idempotência por triple `(treatmentPlanId, treatmentPlanProcedureId,
 *     planMonthRef)` — mesma chave usada por `acceptPlanFinancials` e por
 *     `materializeTreatmentPlan` (legado), portanto rodar várias vezes
 *     no mesmo dia ou conviver com planos materializados não duplica.
 *
 *   • Lock advisory por (item, ano-mês) para evitar race com outros
 *     replicas do scheduler — namespace -1_000_000 - itemId para não
 *     colidir com `withPackageBillingLock`.
 *
 * Não toca em `appointments`/`session_credits`. Reconhecimento de receita
 * permanece em `recognizeMonthlyInvoiceRevenue` (chamado na 1ª sessão do
 * mês). Quando uma `faturaPlano` é gerada para um mês onde já existem
 * appointments materializados (planos legados), back-linkamos
 * `monthlyInvoiceId` nos appointments do mês para que o reconhecimento
 * funcione.
 */
import { db } from "@workspace/db";
import {
  financialRecordsTable,
  treatmentPlansTable,
  treatmentPlanProceduresTable,
  packagesTable,
  proceduresTable,
  patientsTable,
  appointmentsTable,
  billingRunLogsTable,
} from "@workspace/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { nowBRT, todayBRT, lastDayOfMonth } from "../../../utils/dateUtils.js";
import { resolveItemKind } from "../../clinical/medical-records/treatment-plans.acceptance.js";

export interface MonthlyPlanBillingResult {
  processed: number;
  generated: number;
  gapFilled: number;
  skipped: number;
  errors: number;
  details: Array<{
    planId: number;
    itemId: number;
    monthRef: string;
    action: "generated" | "skipped" | "error";
    reason?: string;
    invoiceId?: number;
    appointmentsLinked?: number;
  }>;
}

export interface RunMonthlyPlanBillingOpts {
  /**
   * Quantos dias ANTES do `billingDay` do pacote já podemos gerar a fatura
   * do mês corrente. Default: 5 (regra Sprint 3 — D-5).
   * Não afeta gap-fill de meses passados (sempre permitido).
   */
  toleranceDays?: number;
  /**
   * Filtros opcionais para execução manual/script.
   */
  clinicId?: number;
  planId?: number;
  /**
   * Override da data atual em BRT (testes).
   */
  now?: { year: number; month: number; day: number };
  /**
   * Marca a origem da execução nos logs (`scheduler` | `manual` | string).
   */
  triggeredBy?: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function monthRefOf(year: number, month: number): string {
  return `${year}-${pad(month)}-01`;
}

/**
 * Itera meses de (yStart, mStart) (inclusivo) até (yEnd, mEnd) (inclusivo)
 * em ordem cronológica.
 */
export function* iterMonths(
  yStart: number,
  mStart: number,
  yEnd: number,
  mEnd: number,
): Generator<{ year: number; month: number; ref: string }> {
  let y = yStart;
  let m = mStart;
  while (y < yEnd || (y === yEnd && m <= mEnd)) {
    yield { year: y, month: m, ref: monthRefOf(y, m) };
    if (m === 12) {
      y += 1;
      m = 1;
    } else {
      m += 1;
    }
  }
}

/**
 * Decide se já podemos gerar a fatura do mês corrente:
 *  - meses passados (mês de competência < mês corrente): sempre `true`.
 *  - mês corrente: somente se `today.day >= max(1, billingDay - toleranceDays)`.
 */
export function isMonthDue(
  monthYear: number,
  monthMonth: number,
  today: { year: number; month: number; day: number },
  billingDay: number,
  toleranceDays: number,
): boolean {
  if (monthYear < today.year) return true;
  if (monthYear === today.year && monthMonth < today.month) return true;
  if (monthYear !== today.year || monthMonth !== today.month) return false;
  const lastDay = lastDayOfMonth(today.year, today.month);
  const effectiveBilling = Math.min(billingDay, lastDay);
  const threshold = Math.max(1, effectiveBilling - toleranceDays);
  return today.day >= threshold;
}

interface PlanItemRow {
  planId: number;
  patientId: number;
  clinicId: number | null;
  planStatus: string;
  acceptedAt: Date | null;
  startDate: string | null;
  endDate: string | null;
  durationMonths: number | null;
  itemId: number;
  procedureId: number | null;
  packageId: number | null;
  kind: string | null;
  unitMonthlyPrice: string | null;
  discount: string | null;
  packageType: string | null;
  packageBillingDay: number | null;
  packageProcedureId: number | null;
  packageName: string | null;
}

async function loadEligibleItems(filters: {
  clinicId?: number;
  planId?: number;
}): Promise<PlanItemRow[]> {
  const conds: any[] = [
    sql`${treatmentPlansTable.acceptedAt} IS NOT NULL`,
    sql`${treatmentPlansTable.status} IN ('vigente','ativo')`,
  ];
  if (filters.clinicId) {
    conds.push(eq(treatmentPlansTable.clinicId, filters.clinicId));
  }
  if (filters.planId) {
    conds.push(eq(treatmentPlansTable.id, filters.planId));
  }

  const rows = await db
    .select({
      planId: treatmentPlansTable.id,
      patientId: treatmentPlansTable.patientId,
      clinicId: treatmentPlansTable.clinicId,
      planStatus: treatmentPlansTable.status,
      acceptedAt: treatmentPlansTable.acceptedAt,
      startDate: treatmentPlansTable.startDate,
      endDate: treatmentPlansTable.endDate,
      durationMonths: treatmentPlansTable.durationMonths,
      itemId: treatmentPlanProceduresTable.id,
      procedureId: treatmentPlanProceduresTable.procedureId,
      packageId: treatmentPlanProceduresTable.packageId,
      kind: treatmentPlanProceduresTable.kind,
      unitMonthlyPrice: treatmentPlanProceduresTable.unitMonthlyPrice,
      discount: treatmentPlanProceduresTable.discount,
      packageType: packagesTable.packageType,
      packageBillingDay: packagesTable.billingDay,
      packageProcedureId: packagesTable.procedureId,
      packageName: packagesTable.name,
    })
    .from(treatmentPlansTable)
    .innerJoin(
      treatmentPlanProceduresTable,
      eq(treatmentPlanProceduresTable.treatmentPlanId, treatmentPlansTable.id),
    )
    .leftJoin(packagesTable, eq(packagesTable.id, treatmentPlanProceduresTable.packageId))
    .where(and(...conds));

  // Filtra apenas os recorrentes mensais (com derivação para itens legados sem `kind`).
  return rows.filter((r) => {
    const kind = resolveItemKind({
      kind: r.kind,
      packageId: r.packageId,
      packageType: r.packageType,
    });
    return kind === "recorrenteMensal";
  });
}

/**
 * Mês de competência mais antigo a considerar para o item: o MAIOR entre
 *   • mês de `acceptedAt`
 *   • mês de `startDate` (se preenchido)
 * — porque um plano pode ser aceito antes de iniciar.
 */
function firstMonthForItem(item: PlanItemRow): { year: number; month: number } | null {
  const accepted = item.acceptedAt;
  if (!accepted) return null;
  const acceptedTzParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(accepted);
  const ay = Number(acceptedTzParts.find((p) => p.type === "year")?.value);
  const am = Number(acceptedTzParts.find((p) => p.type === "month")?.value);

  let y = ay;
  let m = am;
  if (item.startDate) {
    const [sy, sm] = item.startDate.split("-").map(Number);
    if (sy > y || (sy === y && sm > m)) {
      y = sy;
      m = sm;
    }
  }
  return { year: y, month: m };
}

/**
 * Mês máximo (inclusivo) a faturar — não passa do `endDate` do plano.
 */
function maxMonthForItem(
  item: PlanItemRow,
  today: { year: number; month: number },
): { year: number; month: number } {
  if (!item.endDate) return today;
  const [ey, em, ed] = item.endDate.split("-").map(Number);
  // endDate inclusive: se cair antes do mês corrente, limita.
  if (ey < today.year || (ey === today.year && em < today.month)) {
    return { year: ey, month: em };
  }
  return today;
}

/**
 * Adquire um lock advisory por (itemId, year*100+month) com namespace
 * distinto do `withPackageBillingLock`
 * (usa offset negativo no primeiro slot).
 */
async function withMonthlyPlanItemLock<T>(
  itemId: number,
  year: number,
  month: number,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // -1_000_000 - itemId garante chave única e fora dos namespaces existentes.
    const first = -1_000_000 - Math.abs(itemId);
    const second = year * 100 + month;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${first}::int, ${second}::int)`);
    return fn(tx);
  });
}

/**
 * Gera (se faltar) a `faturaPlano` para o mês de competência informado
 * dentro de uma transação com lock advisory. Idempotente.
 *
 * Retorna `{ created, invoiceId, appointmentsLinked }`.
 */
async function ensureMonthlyInvoice(
  item: PlanItemRow,
  patientName: string,
  procedureName: string,
  procedureCategory: string | null,
  procedurePrice: string | null,
  effectiveProcedureId: number,
  monthYear: number,
  monthMonth: number,
): Promise<{
  created: boolean;
  invoiceId: number | null;
  appointmentsLinked: number;
}> {
  const monthRef = monthRefOf(monthYear, monthMonth);
  const billingDay = item.packageBillingDay ?? 10;
  const lastDay = lastDayOfMonth(monthYear, monthMonth);
  const dueDay = Math.min(billingDay, lastDay);
  const dueDate = `${monthYear}-${pad(monthMonth)}-${pad(dueDay)}`;
  const monthlyAmount = Math.max(
    0,
    Number(item.unitMonthlyPrice ?? 0) - Number(item.discount ?? 0),
  );
  if (monthlyAmount <= 0) {
    return { created: false, invoiceId: null, appointmentsLinked: 0 };
  }

  return withMonthlyPlanItemLock(item.itemId, monthYear, monthMonth, async (tx) => {
    // Idempotência forte (mesma triple de acceptPlanFinancials e materialize).
    const [exists] = await tx
      .select({ id: financialRecordsTable.id })
      .from(financialRecordsTable)
      .where(
        and(
          eq(financialRecordsTable.treatmentPlanId, item.planId),
          eq(financialRecordsTable.treatmentPlanProcedureId, item.itemId),
          eq(financialRecordsTable.transactionType, "faturaPlano"),
          eq(financialRecordsTable.planMonthRef, monthRef),
        ),
      )
      .limit(1);

    if (exists) {
      return { created: false, invoiceId: exists.id, appointmentsLinked: 0 };
    }

    const monthLabel = monthRef.slice(0, 7);
    const [invoice] = await tx
      .insert(financialRecordsTable)
      .values({
        type: "receita",
        amount: monthlyAmount.toFixed(2),
        description: `Plano #${item.planId} — ${procedureName} — ${patientName} — ${monthLabel}`,
        category: procedureCategory,
        patientId: item.patientId,
        procedureId: effectiveProcedureId,
        clinicId: item.clinicId,
        transactionType: "faturaPlano",
        status: "pendente",
        dueDate,
        treatmentPlanId: item.planId,
        treatmentPlanProcedureId: item.itemId,
        planMonthRef: monthRef,
        priceSource: "plano_mensal_proporcional",
        originalUnitPrice: procedurePrice,
      })
      .returning({ id: financialRecordsTable.id });

    // Back-link: appointments materializados deste item, dentro do mês,
    // que ainda não tenham `monthlyInvoiceId` apontam para esta nova fatura.
    // Cobre o caso de planos legados materializados onde as faturas
    // futuras foram apagadas pelo cleanup script — os appointments
    // permanecem e voltam a ter vínculo correto após a fatura ser gerada.
    const monthStart = monthRef;
    const monthEnd = `${monthYear}-${pad(monthMonth)}-${pad(lastDay)}`;
    const linked = await tx
      .update(appointmentsTable)
      .set({ monthlyInvoiceId: invoice.id })
      .where(
        and(
          eq(appointmentsTable.treatmentPlanProcedureId, item.itemId),
          isNull(appointmentsTable.monthlyInvoiceId),
          sql`${appointmentsTable.date} BETWEEN ${monthStart}::date AND ${monthEnd}::date`,
        ),
      )
      .returning({ id: appointmentsTable.id });

    return {
      created: true,
      invoiceId: invoice.id,
      appointmentsLinked: linked.length,
    };
  });
}

/**
 * Resolve o nome do paciente em cache simples (a chamada acontece muitas
 * vezes em loop — acumular por patientId).
 */
async function buildPatientCache(items: PlanItemRow[]): Promise<Map<number, string>> {
  const ids = Array.from(new Set(items.map((i) => i.patientId)));
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: patientsTable.id, name: patientsTable.name })
    .from(patientsTable)
    .where(sql`${patientsTable.id} = ANY(${ids})`);
  const map = new Map<number, string>();
  for (const r of rows) map.set(r.id, r.name);
  return map;
}

async function buildProcedureCache(
  procedureIds: number[],
): Promise<
  Map<
    number,
    { name: string; category: string | null; price: string | null }
  >
> {
  const ids = Array.from(new Set(procedureIds));
  const map = new Map<
    number,
    { name: string; category: string | null; price: string | null }
  >();
  if (ids.length === 0) return map;
  const rows = await db
    .select({
      id: proceduresTable.id,
      name: proceduresTable.name,
      category: proceduresTable.category,
      price: proceduresTable.price,
    })
    .from(proceduresTable)
    .where(sql`${proceduresTable.id} = ANY(${ids})`);
  for (const r of rows) {
    map.set(r.id, { name: r.name, category: r.category, price: r.price });
  }
  return map;
}

/**
 * Geração lazy das faturas mensais.
 */
export async function runMonthlyPlanBilling(
  opts: RunMonthlyPlanBillingOpts = {},
): Promise<MonthlyPlanBillingResult> {
  const tolerance = opts.toleranceDays ?? 5;
  const today = opts.now ?? nowBRT();
  const triggeredBy = opts.triggeredBy ?? "scheduler";
  const startedAt = Date.now();

  const result: MonthlyPlanBillingResult = {
    processed: 0,
    generated: 0,
    gapFilled: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  const items = await loadEligibleItems({
    clinicId: opts.clinicId,
    planId: opts.planId,
  });
  result.processed = items.length;

  if (items.length === 0) {
    await persistRunLog(triggeredBy, today, result, Date.now() - startedAt);
    return result;
  }

  const patientCache = await buildPatientCache(items);
  const procedureCache = await buildProcedureCache(
    items
      .map((i) => i.packageProcedureId ?? i.procedureId)
      .filter((id): id is number => id != null),
  );

  for (const item of items) {
    const procedureId = item.packageProcedureId ?? item.procedureId;
    if (!procedureId) {
      result.skipped += 1;
      result.details.push({
        planId: item.planId,
        itemId: item.itemId,
        monthRef: monthRefOf(today.year, today.month),
        action: "skipped",
        reason: "Item sem procedureId",
      });
      continue;
    }
    const procedure = procedureCache.get(procedureId);
    if (!procedure) {
      result.skipped += 1;
      result.details.push({
        planId: item.planId,
        itemId: item.itemId,
        monthRef: monthRefOf(today.year, today.month),
        action: "skipped",
        reason: `Procedimento #${procedureId} não encontrado`,
      });
      continue;
    }
    const patientName = patientCache.get(item.patientId) ?? `paciente#${item.patientId}`;

    const first = firstMonthForItem(item);
    if (!first) {
      result.skipped += 1;
      continue;
    }
    const max = maxMonthForItem(item, today);

    // Itera mês a mês de `first` até `max`, criando o que falta.
    for (const m of iterMonths(first.year, first.month, max.year, max.month)) {
      const isCurrent = m.year === today.year && m.month === today.month;
      const due = isMonthDue(m.year, m.month, today, item.packageBillingDay ?? 10, tolerance);
      if (!due) {
        // Mês corrente ainda não atingiu D-tolerance — para a iteração
        // (próximos meses são todos futuros).
        result.skipped += 1;
        result.details.push({
          planId: item.planId,
          itemId: item.itemId,
          monthRef: m.ref,
          action: "skipped",
          reason: `Aguardando D-${tolerance} de ${item.packageBillingDay ?? 10}`,
        });
        break;
      }
      try {
        const r = await ensureMonthlyInvoice(
          item,
          patientName,
          procedure.name,
          procedure.category,
          procedure.price,
          procedureId,
          m.year,
          m.month,
        );
        if (r.created) {
          if (isCurrent) {
            result.generated += 1;
          } else {
            result.gapFilled += 1;
          }
          result.details.push({
            planId: item.planId,
            itemId: item.itemId,
            monthRef: m.ref,
            action: "generated",
            invoiceId: r.invoiceId ?? undefined,
            appointmentsLinked: r.appointmentsLinked,
          });
        } else {
          result.skipped += 1;
          result.details.push({
            planId: item.planId,
            itemId: item.itemId,
            monthRef: m.ref,
            action: "skipped",
            reason: "Já existia",
            invoiceId: r.invoiceId ?? undefined,
          });
        }
      } catch (err) {
        result.errors += 1;
        result.details.push({
          planId: item.planId,
          itemId: item.itemId,
          monthRef: m.ref,
          action: "error",
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  await persistRunLog(triggeredBy, today, result, Date.now() - startedAt);
  return result;
}

async function persistRunLog(
  triggeredBy: string,
  today: { year: number; month: number; day: number },
  r: MonthlyPlanBillingResult,
  durationMs: number,
): Promise<void> {
  try {
    // O schema atual de `billing_run_logs` é compartilhado por todos os
    // jobs e não tem coluna para distinguir o nome do job nem para
    // payload livre. Para Sprint 3, registramos a execução com a
    // marca `[monthlyPlanBilling]` no `triggeredBy` para que a UI de
    // logs fique distinguível sem alteração de schema.
    void today;
    void durationMs;
    await db.insert(billingRunLogsTable).values({
      triggeredBy: `monthlyPlanBilling:${triggeredBy}`,
      processed: r.processed,
      generated: r.generated + r.gapFilled,
      skipped: r.skipped,
      errors: r.errors,
      dryRun: false,
    });
  } catch (err) {
    // Logging do log não deve quebrar o job.
    console.error("[monthlyPlanBilling] falha ao persistir billingRunLog:", err);
  }
}
