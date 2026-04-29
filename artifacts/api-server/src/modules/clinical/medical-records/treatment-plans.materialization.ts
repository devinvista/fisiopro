/**
 * Materialização de Plano de Tratamento.
 *
 * O plano de tratamento é o **único contrato comercial** do paciente. Quando
 * o usuário "materializa" um plano, o sistema gera de uma vez:
 *
 *  - Todas as **consultas** (`appointments`) previstas, segundo:
 *    - dias da semana definidos no item do plano (`weekDays`)
 *    - horário, profissional e duração configurados (`defaultStartTime` etc.)
 *    - janela `startDate → startDate + durationMonths`
 *  - Todas as **faturas mensais** (`financial_records.transactionType =
 *    "faturaPlano"`) — uma por mês de competência, com `amount` igual ao
 *    `unit_monthly_price - discount` do item, vencimento no `billing_day`
 *    do pacote, status `pendente`.
 *
 * Cada `appointment` recebe `treatmentPlanProcedureId` (vínculo com o item)
 * e `monthlyInvoiceId` (vínculo com a fatura do mês). O `applyBillingRules`
 * passa a ser **NO-OP** para appointments com esses vínculos: nada de
 * cobrança avulsa, nada de pendenteFatura.
 *
 * Idempotência: `treatment_plans.materializedAt` indica que o plano já foi
 * materializado. Tentar materializar de novo lança erro a menos que se
 * passe `{ force: true }`. Para regenerar, chamar primeiro
 * `dematerializeTreatmentPlan`.
 */
import { db } from "@workspace/db";
import {
  appointmentsTable,
  financialRecordsTable,
  treatmentPlansTable,
  treatmentPlanProceduresTable,
  packagesTable,
  proceduresTable,
  patientsTable,
  schedulesTable,
  accountingJournalEntriesTable,
  sessionCreditsTable,
} from "@workspace/db";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  postReceivableRevenue,
  resolveAccountCodeById,
} from "../../shared/accounting/accounting.service.js";
import { planInstallmentDueDate } from "./treatment-plans.billing-dates.js";

// ─── Sprint 1/2 — Resolução de política de crédito do plano ─────────────────
//
// Hierarquia para `paymentMode` e `monthlyCreditValidityDays`:
//   1. override no `treatment_plans` (campo do plano)
//   2. valor do `packages` referenciado pelo item
//   3. fallback do sistema ("postpago" / 30 dias)
function resolvePaymentMode(
  planOverride: string | null | undefined,
  packageMode: string | null | undefined,
): "prepago" | "postpago" {
  const v = (planOverride || packageMode || "postpago") as string;
  return v === "prepago" ? "prepago" : "postpago";
}

function resolveMonthlyValidityDays(
  planOverride: number | null | undefined,
  packageDays: number | null | undefined,
): number {
  if (typeof planOverride === "number") return Math.max(0, planOverride);
  if (typeof packageDays === "number") return Math.max(0, packageDays);
  return 30;
}

const WEEK_DAY_INDEX: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

export interface MaterializeOptions {
  force?: boolean;
  /** Override do `start_date` do plano (formato YYYY-MM-DD). */
  startDate?: string;
  /** Override do `duration_months` do plano. */
  durationMonths?: number;
}

export interface MaterializeResult {
  planId: number;
  appointmentsCreated: number;
  invoicesCreated: number;
  monthsCovered: number;
  totalContractedAmount: string;
}

interface PlanItem {
  id: number;
  kind: string | null;
  procedureId: number | null;
  packageId: number | null;
  unitPrice: string | null;
  unitMonthlyPrice: string | null;
  discount: string | null;
  totalSessions: number | null;
  weekDays: string | null;
  defaultStartTime: string | null;
  defaultProfessionalId: number | null;
  scheduleId: number | null;
  sessionDurationMinutes: number | null;
  packageType: string | null;
  packageBillingDay: number | null;
  packageProcedureId: number | null;
  // Pacote mensalidade: valor mensal contratado vive em `packages.monthly_price`.
  // Usado como fallback quando o item não tem `unitMonthlyPrice` próprio.
  packageMonthlyPrice: string | null;
  // Sprint 1/2 — política de crédito do pacote (defaults para o pool mensal)
  packagePaymentMode: string | null;
  packageMonthlyCreditValidityDays: number | null;
}

/**
 * Resolve o tipo (kind) efetivo do item, derivando dos campos legados quando
 * o `kind` ainda não foi preenchido (planos pré-Sprint 2). Mantido em paralelo
 * com `treatment-plans.acceptance.ts/resolveItemKind` para evitar import
 * circular.
 */
function resolveItemKind(
  item: Pick<PlanItem, "kind" | "packageId" | "packageType">,
): "recorrenteMensal" | "pacoteSessoes" | "avulso" {
  if (item.kind === "recorrenteMensal") return "recorrenteMensal";
  if (item.kind === "pacoteSessoes") return "pacoteSessoes";
  if (item.kind === "avulso") return "avulso";
  if (item.packageId != null) {
    if (item.packageType === "mensal" || item.packageType === "faturaConsolidada") {
      return "recorrenteMensal";
    }
    return "pacoteSessoes";
  }
  return "avulso";
}

function parseWeekDays(raw: string | null): number[] {
  if (!raw) return [];
  let arr: any;
  try {
    arr = JSON.parse(raw);
  } catch {
    arr = raw.split(",").map((s) => s.trim());
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((d) => WEEK_DAY_INDEX[String(d).toLowerCase()])
    .filter((n): n is number => typeof n === "number");
}

function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, d));
  return dt.toISOString().slice(0, 10);
}

function monthFirstDay(dateStr: string): string {
  return dateStr.slice(0, 8) + "01";
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMinutesToTime(time: string, mins: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + mins;
  const hh = String(Math.floor(total / 60) % 24).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Enumera todas as datas (YYYY-MM-DD) entre `startDate` (inclusivo) e
 * `endDate` (exclusivo) que caem em algum dos `weekDayIndexes` (0=domingo).
 */
function enumerateDates(
  startDate: string,
  endDate: string,
  weekDayIndexes: number[],
): string[] {
  if (weekDayIndexes.length === 0) return [];
  const out: string[] = [];
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const cur = new Date(Date.UTC(sy, sm - 1, sd));
  const [ey, em, ed] = endDate.split("-").map(Number);
  const end = new Date(Date.UTC(ey, em - 1, ed));
  while (cur < end) {
    if (weekDayIndexes.includes(cur.getUTCDay())) {
      out.push(cur.toISOString().slice(0, 10));
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

async function loadPlanItems(planId: number): Promise<PlanItem[]> {
  return db
    .select({
      id: treatmentPlanProceduresTable.id,
      kind: treatmentPlanProceduresTable.kind,
      procedureId: treatmentPlanProceduresTable.procedureId,
      packageId: treatmentPlanProceduresTable.packageId,
      unitPrice: treatmentPlanProceduresTable.unitPrice,
      unitMonthlyPrice: treatmentPlanProceduresTable.unitMonthlyPrice,
      discount: treatmentPlanProceduresTable.discount,
      totalSessions: treatmentPlanProceduresTable.totalSessions,
      weekDays: treatmentPlanProceduresTable.weekDays,
      defaultStartTime: treatmentPlanProceduresTable.defaultStartTime,
      defaultProfessionalId: treatmentPlanProceduresTable.defaultProfessionalId,
      scheduleId: treatmentPlanProceduresTable.scheduleId,
      sessionDurationMinutes: treatmentPlanProceduresTable.sessionDurationMinutes,
      packageType: packagesTable.packageType,
      packageBillingDay: packagesTable.billingDay,
      packageProcedureId: packagesTable.procedureId,
      packagePaymentMode: packagesTable.paymentMode,
      packageMonthlyCreditValidityDays: packagesTable.monthlyCreditValidityDays,
      packageMonthlyPrice: packagesTable.monthlyPrice,
    })
    .from(treatmentPlanProceduresTable)
    .leftJoin(packagesTable, eq(packagesTable.id, treatmentPlanProceduresTable.packageId))
    .where(eq(treatmentPlanProceduresTable.treatmentPlanId, planId));
}

/**
 * Enumera as primeiras N datas (YYYY-MM-DD) entre `startDate` (inclusivo) e
 * `endDate` (exclusivo) que caem em algum dos `weekDayIndexes` (0=domingo).
 * Diferente de `enumerateDates`, para no `take`-ésimo match.
 */
function enumerateFirstN(
  startDate: string,
  endDate: string,
  weekDayIndexes: number[],
  take: number,
): string[] {
  if (weekDayIndexes.length === 0 || take <= 0) return [];
  const out: string[] = [];
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const cur = new Date(Date.UTC(sy, sm - 1, sd));
  const [ey, em, ed] = endDate.split("-").map(Number);
  const end = new Date(Date.UTC(ey, em - 1, ed));
  while (cur < end && out.length < take) {
    if (weekDayIndexes.includes(cur.getUTCDay())) {
      out.push(cur.toISOString().slice(0, 10));
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

async function defaultScheduleId(clinicId: number | null): Promise<number> {
  // Materialização precisa de um schedule_id válido para o appointment.
  // Pega o primeiro schedule ativo da clínica (ou global). Se não houver,
  // cria erro — o admin precisa configurar uma agenda padrão.
  const conds: any[] = [eq(schedulesTable.isActive, true)];
  if (clinicId) conds.push(eq(schedulesTable.clinicId, clinicId));
  const [sch] = await db
    .select({ id: schedulesTable.id })
    .from(schedulesTable)
    .where(and(...conds))
    .limit(1);
  if (!sch) {
    throw new Error(
      `Não há agenda ativa configurada${clinicId ? ` para a clínica #${clinicId}` : ""}. ` +
        `Crie uma agenda em Configurações → Agendas antes de materializar planos.`,
    );
  }
  return sch.id;
}

/**
 * Materializa o plano de tratamento.
 */
export async function materializeTreatmentPlan(
  planId: number,
  opts: MaterializeOptions = {},
): Promise<MaterializeResult> {
  const [plan] = await db
    .select()
    .from(treatmentPlansTable)
    .where(eq(treatmentPlansTable.id, planId))
    .limit(1);
  if (!plan) throw new Error(`Plano #${planId} não encontrado`);
  if (plan.materializedAt && !opts.force) {
    throw new Error(
      `Plano #${planId} já foi materializado em ${plan.materializedAt.toISOString()}. ` +
        `Use dematerializeTreatmentPlan antes ou passe { force: true }.`,
    );
  }

  const startDate = opts.startDate ?? plan.startDate;
  const durationMonths = opts.durationMonths ?? plan.durationMonths ?? 12;
  if (!startDate) {
    throw new Error(`Plano #${planId} sem start_date — preencha antes de materializar.`);
  }
  const endDate = addMonths(startDate, durationMonths);

  const items = await loadPlanItems(planId);
  if (items.length === 0) {
    throw new Error(`Plano #${planId} sem itens — adicione procedimentos/pacotes antes.`);
  }

  // ── Particiona itens por kind efetivo ─────────────────────────────────────
  // Mensais: comportamento existente (faturas mensais + pool de créditos +
  //   appointments recorrentes durante toda a vigência do plano).
  // Pacotes/avulsos: somente geramos appointments se o usuário configurou
  //   agenda + dias + horário no editor de aceite. Não criamos faturas/pool
  //   adicionais — o aceite (`acceptPlanFinancials`) já tratou a parte
  //   financeira (vendaPacote + créditos para pacote; nada para avulso).
  // Para itens "recorrenteMensal" o valor mensal pode vir do próprio item
  // (`unitMonthlyPrice`, comum em mensalidade de procedimento avulso) ou do
  // pacote (`packages.monthly_price`, padrão para "pacote mensalidade" onde
  // o valor é fixo no catálogo). A regra é a mesma para os dois casos: o
  // pool de créditos é recalculado mês a mês conforme os dias da semana.
  const monthlyItems = items.filter(
    (i) =>
      resolveItemKind(i) === "recorrenteMensal" &&
      Number(i.unitMonthlyPrice ?? i.packageMonthlyPrice ?? 0) > 0,
  );
  const oneShotItems = items.filter((i) => {
    const k = resolveItemKind(i);
    return k === "pacoteSessoes" || k === "avulso";
  });
  for (const it of monthlyItems) {
    const wd = parseWeekDays(it.weekDays);
    if (wd.length === 0) {
      throw new Error(
        `Item #${it.id} (pacote mensal) sem dias da semana definidos. ` +
          `Configure week_days antes de materializar.`,
      );
    }
    if (!it.defaultStartTime) {
      throw new Error(`Item #${it.id} (pacote mensal) sem horário padrão.`);
    }
  }

  const [patient] = await db
    .select({ name: patientsTable.name })
    .from(patientsTable)
    .where(eq(patientsTable.id, plan.patientId))
    .limit(1);
  const patientName = patient?.name ?? `paciente#${plan.patientId}`;

  const fallbackScheduleId = await defaultScheduleId(plan.clinicId ?? null);

  let appointmentsCreated = 0;
  let invoicesCreated = 0;
  let monthsCoveredCount = 0;
  let totalContracted = 0;

  // Sprint 2 — política de crédito efetiva (plano sobrescreve pacote).
  const effectivePaymentMode = resolvePaymentMode(
    plan.paymentMode,
    null, // resolvido por item abaixo (cada item pode ter pacote diferente)
  );
  const planMonthlyValidityOverride = plan.monthlyCreditValidityDays;

  await db.transaction(async (tx) => {
    for (const item of monthlyItems) {
      const procedureId = item.packageProcedureId ?? item.procedureId;
      if (!procedureId) continue;

      const [procedure] = await tx
        .select({
          name: proceduresTable.name,
          category: proceduresTable.category,
          price: proceduresTable.price,
          durationMinutes: proceduresTable.durationMinutes,
          accountingAccountId: (proceduresTable as any).accountingAccountId,
        })
        .from(proceduresTable)
        .where(eq(proceduresTable.id, procedureId))
        .limit(1);
      if (!procedure) continue;

      // Mesmo fallback usado no filter acima: pacote mensalidade pode ter o
      // valor mensal vivo apenas em `packages.monthly_price`.
      const effectiveMonthly = Number(
        item.unitMonthlyPrice ?? item.packageMonthlyPrice ?? 0,
      );
      const monthlyAmount = Math.max(
        0,
        effectiveMonthly - Number(item.discount ?? 0),
      );
      const billingDay = item.packageBillingDay ?? 10;
      const weekDays = parseWeekDays(item.weekDays);
      // Duração: override do item > duração cadastrada do procedimento > 60 min.
      const duration = item.sessionDurationMinutes ?? procedure.durationMinutes ?? 60;

      // Política específica deste item (override do plano > pacote > default).
      const itemPaymentMode = resolvePaymentMode(plan.paymentMode, item.packagePaymentMode);
      const itemMonthlyValidityDays = resolveMonthlyValidityDays(
        planMonthlyValidityOverride,
        item.packageMonthlyCreditValidityDays,
      );

      // 1) Para cada mês de competência, gera 1 fatura + N appointments.
      for (let m = 0; m < durationMonths; m++) {
        const monthStart = addMonths(monthFirstDay(startDate), m);
        const [my, mm] = monthStart.split("-").map(Number);
        const lastDay = lastDayOfMonth(my, mm);
        const monthEnd = `${my}-${String(mm).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

        // No primeiro mês, começa do startDate; no último, vai até endDate.
        const winStart = m === 0 ? startDate : monthStart;
        const winEnd =
          m === durationMonths - 1
            ? (endDate < monthEnd ? endDate : addMonths(monthEnd, 0))
            : addMonths(monthEnd, 0);

        // enumerateDates é exclusivo no fim — somar 1 dia ao endpoint.
        const winEndExclusive = (() => {
          const [y, mo, d] = winEnd.split("-").map(Number);
          const dt = new Date(Date.UTC(y, mo - 1, d + 1));
          return dt.toISOString().slice(0, 10);
        })();
        const dates = enumerateDates(winStart, winEndExclusive, weekDays);

        if (dates.length === 0) continue;

        const accountCode = await resolveAccountCodeById(
          (procedure as any).accountingAccountId ?? null,
          "4.1.1",
          plan.clinicId ?? null,
        );

        // 1ª parcela vence na próxima ocorrência de `billingDay` em ou após
        // `startDate`; demais parcelas seguem mês a mês a partir daí.
        const dueDate = planInstallmentDueDate(startDate, billingDay, m);

        // Cria fatura mensal.
        const [invoice] = await tx
          .insert(financialRecordsTable)
          .values({
            type: "receita",
            amount: monthlyAmount.toFixed(2),
            description: `Plano #${planId} — ${procedure.name} — ${patientName} — ${monthStart.slice(0, 7)}`,
            category: procedure.category,
            patientId: plan.patientId,
            procedureId,
            transactionType: "faturaPlano",
            status: "pendente",
            dueDate,
            clinicId: plan.clinicId,
            priceSource: "plano_mensal_proporcional",
            originalUnitPrice: procedure.price,
            treatmentPlanId: planId,
            treatmentPlanProcedureId: item.id,
            planMonthRef: monthStart,
          })
          .returning({ id: financialRecordsTable.id });
        invoicesCreated++;
        monthsCoveredCount++;
        totalContracted += monthlyAmount;

        // ── Reconhecimento de receita: NÃO ocorre na materialização ────────
        // Conforme regime de competência por entrega:
        //   • A fatura mensal nasce `pendente`, sem journal entry.
        //   • A receita só é reconhecida na **1ª confirmação de sessão** do
        //     mês (em `applyBillingRules`, ramo de plano materializado).
        //   • Para fatura prepago paga antes da 1ª sessão, o pagamento gera
        //     `Adiantamento de Cliente` (passivo); a receita é reconhecida
        //     no consumo (D: Adiantamentos / C: Receita).
        // O `accountCode` continua resolvido para uso no momento do
        // reconhecimento futuro (passado via lookup pela fatura).
        void accountCode;

        // 2) Cria os appointments do mês, vinculados à fatura.
        // Estratégia em lote (1 SELECT + 1 UPDATE em massa + 1 INSERT em
        // massa) para evitar latência por data:
        //   a) Busca todos os appointments existentes nesses slots
        //      (mesmo paciente, data, horário, status ativo).
        //   b) Vincula os existentes ao item/fatura preservando histórico.
        //   c) Insere em massa as datas restantes.
        if (dates.length === 0) continue;

        const existingRows = await tx
          .select({
            id: appointmentsTable.id,
            date: appointmentsTable.date,
          })
          .from(appointmentsTable)
          .where(
            and(
              eq(appointmentsTable.patientId, plan.patientId),
              inArray(appointmentsTable.date, dates),
              eq(appointmentsTable.startTime, item.defaultStartTime!),
              sql`${appointmentsTable.status} NOT IN ('cancelado','faltou','remarcado')`,
            ),
          );

        const existingDates = new Set<string>();
        const existingIds: number[] = [];
        for (const row of existingRows) {
          existingDates.add(row.date);
          existingIds.push(row.id);
        }

        if (existingIds.length > 0) {
          await tx
            .update(appointmentsTable)
            .set({
              treatmentPlanProcedureId: item.id,
              monthlyInvoiceId: invoice.id,
            })
            .where(inArray(appointmentsTable.id, existingIds));
          appointmentsCreated += existingIds.length;
        }

        const datesToInsert = dates.filter((d) => !existingDates.has(d));
        if (datesToInsert.length > 0) {
          const endTime = addMinutesToTime(item.defaultStartTime!, duration);
          const rows = datesToInsert.map((date) => ({
            patientId: plan.patientId,
            procedureId,
            professionalId: item.defaultProfessionalId,
            date,
            startTime: item.defaultStartTime!,
            endTime,
            status: "agendado" as const,
            clinicId: plan.clinicId,
            scheduleId: item.scheduleId ?? fallbackScheduleId,
            treatmentPlanProcedureId: item.id,
            monthlyInvoiceId: invoice.id,
            source: "presencial" as const,
          }));
          await tx.insert(appointmentsTable).values(rows);
          appointmentsCreated += datesToInsert.length;
        }

        // ── Sprint 2 — Pool mensal de créditos ────────────────────────────
        // Cria 1 linha em session_credits para representar o saldo
        // contratado deste mês×item. Quantity = nº de sessões previstas.
        // Status:
        //   • postpago → `disponivel` (pode consumir imediatamente)
        //   • prepago  → `pendentePagamento` (libera ao pagar a fatura)
        // Validade = último dia do mês + monthlyCreditValidityDays.
        // Idempotência: 1 linha por (treatmentPlanProcedureId, monthRef).
        // Em re-materialização (force=true) o cleanup de dematerialize já
        // apagou os pools anteriores não consumidos.
        const poolValidUntil = (() => {
          const d = new Date(`${monthEnd}T00:00:00Z`);
          d.setUTCDate(d.getUTCDate() + itemMonthlyValidityDays);
          return d.toISOString().slice(0, 10);
        })();
        const poolStatus = itemPaymentMode === "prepago" ? "pendentePagamento" : "disponivel";
        const existingPool = await tx
          .select({ id: sessionCreditsTable.id })
          .from(sessionCreditsTable)
          .where(
            and(
              eq(sessionCreditsTable.patientId, plan.patientId),
              eq(sessionCreditsTable.procedureId, procedureId),
              eq(sessionCreditsTable.origin, "mensal"),
              eq(sessionCreditsTable.monthRef, monthStart),
              eq(sessionCreditsTable.financialRecordId, invoice.id),
            ),
          )
          .limit(1);
        if (existingPool.length === 0) {
          await tx.insert(sessionCreditsTable).values({
            patientId: plan.patientId,
            procedureId,
            quantity: dates.length,
            usedQuantity: 0,
            clinicId: plan.clinicId,
            origin: "mensal",
            status: poolStatus,
            monthRef: monthStart,
            validUntil: poolValidUntil,
            financialRecordId: invoice.id,
            notes:
              `Pool mensal — plano #${planId} — ${monthStart.slice(0, 7)} — ` +
              `${dates.length} sessão(ões) ${itemPaymentMode === "prepago" ? "(aguardando pagamento)" : "contratada(s)"}. ` +
              `Validade até ${poolValidUntil}.`,
          });
        }
      }
    }

    // ── 3) Pacotes de sessões e avulsos ──────────────────────────────────────
    // Geramos appointments apenas se o usuário configurou agenda + dias +
    // horário no editor de aceite. Nada de faturas ou pool extras: o aceite
    // já criou `vendaPacote` + créditos para pacotes; avulsos são cobrados
    // por sessão pelo `applyBillingRules`.
    //
    // Limites por kind:
    //   • pacoteSessoes → no máximo `totalSessions` consultas (série fechada)
    //   • avulso        → `totalSessions ?? 1` consultas
    //
    // Janela de busca: do `startDate` até o `endDate` do plano. Itens com
    // mais sessões do que cabem na janela ficam parcialmente materializados
    // (o usuário pode estender a vigência e remateralizar com `force: true`).
    for (const item of oneShotItems) {
      const wd = parseWeekDays(item.weekDays);
      if (wd.length === 0 || !item.defaultStartTime || !item.scheduleId) {
        // Item sem configuração de agenda — preserva comportamento legado:
        // o usuário marcará as sessões manualmente. Não falha.
        continue;
      }

      const procedureId = item.packageProcedureId ?? item.procedureId;
      if (!procedureId) continue;

      const [procedure] = await tx
        .select({
          name: proceduresTable.name,
          category: proceduresTable.category,
          price: proceduresTable.price,
          durationMinutes: proceduresTable.durationMinutes,
        })
        .from(proceduresTable)
        .where(eq(proceduresTable.id, procedureId))
        .limit(1);
      if (!procedure) continue;

      const kind = resolveItemKind(item);
      const cap =
        kind === "pacoteSessoes"
          ? Math.max(0, item.totalSessions ?? 0)
          : Math.max(1, item.totalSessions ?? 1);
      if (cap === 0) continue;

      // Duração: override do item > duração cadastrada do procedimento > 60 min.
      const duration = item.sessionDurationMinutes ?? procedure.durationMinutes ?? 60;
      const winEndExclusive = (() => {
        const [y, mo, d] = endDate.split("-").map(Number);
        const dt = new Date(Date.UTC(y, mo - 1, d));
        return dt.toISOString().slice(0, 10);
      })();
      const dates = enumerateFirstN(startDate, winEndExclusive, wd, cap);
      if (dates.length === 0) continue;

      // Idempotência: vincula appointments já existentes nesses slots ao item
      // (mesmo paciente, datas, horário, status ativo). Evita duplicar quando
      // a materialização é re-executada com `{ force: true }` ou quando o
      // usuário já marcou consultas manualmente.
      const existingRows = await tx
        .select({
          id: appointmentsTable.id,
          date: appointmentsTable.date,
        })
        .from(appointmentsTable)
        .where(
          and(
            eq(appointmentsTable.patientId, plan.patientId),
            inArray(appointmentsTable.date, dates),
            eq(appointmentsTable.startTime, item.defaultStartTime),
            sql`${appointmentsTable.status} NOT IN ('cancelado','faltou','remarcado')`,
          ),
        );

      const existingDates = new Set<string>();
      const existingIds: number[] = [];
      for (const row of existingRows) {
        existingDates.add(row.date);
        existingIds.push(row.id);
      }

      if (existingIds.length > 0) {
        await tx
          .update(appointmentsTable)
          .set({ treatmentPlanProcedureId: item.id })
          .where(inArray(appointmentsTable.id, existingIds));
        appointmentsCreated += existingIds.length;
      }

      const datesToInsert = dates.filter((d) => !existingDates.has(d));
      if (datesToInsert.length > 0) {
        const endTime = addMinutesToTime(item.defaultStartTime, duration);
        const rows = datesToInsert.map((date) => ({
          patientId: plan.patientId,
          procedureId,
          professionalId: item.defaultProfessionalId,
          date,
          startTime: item.defaultStartTime!,
          endTime,
          status: "agendado" as const,
          clinicId: plan.clinicId,
          scheduleId: item.scheduleId ?? fallbackScheduleId,
          treatmentPlanProcedureId: item.id,
          // Pacotes consomem do pool de créditos (criado no aceite).
          // Avulsos seguem o fluxo padrão de cobrança por sessão.
          monthlyInvoiceId: null,
          source: "presencial" as const,
        }));
        await tx.insert(appointmentsTable).values(rows);
        appointmentsCreated += datesToInsert.length;
      }
    }

    // 2b) Atualiza o plano com end_date e materializedAt.
    await tx
      .update(treatmentPlansTable)
      .set({
        durationMonths,
        endDate,
        materializedAt: new Date(),
      })
      .where(eq(treatmentPlansTable.id, planId));
  });

  return {
    planId,
    appointmentsCreated,
    invoicesCreated,
    monthsCovered: monthsCoveredCount,
    totalContractedAmount: totalContracted.toFixed(2),
  };
}

/**
 * Desfaz a materialização: apaga appointments futuros (status = `agendado`),
 * faturas pendentes (status = `pendente`) e seus journal entries
 * relacionados. Appointments com status diferente (compareceu, concluido,
 * faltou, etc.) são preservados — mas têm `monthlyInvoiceId`/
 * `treatmentPlanProcedureId` zerados se a fatura for apagada (para evitar
 * referência órfã).
 */
export async function dematerializeTreatmentPlan(
  planId: number,
): Promise<{ appointmentsDeleted: number; invoicesDeleted: number; appointmentsUnlinked: number }> {
  let appointmentsDeleted = 0;
  let invoicesDeleted = 0;
  let appointmentsUnlinked = 0;

  await db.transaction(async (tx) => {
    const items = await tx
      .select({ id: treatmentPlanProceduresTable.id })
      .from(treatmentPlanProceduresTable)
      .where(eq(treatmentPlanProceduresTable.treatmentPlanId, planId));
    const itemIds = items.map((i) => i.id);
    if (itemIds.length === 0) return;

    // Faturas pendentes vinculadas
    const pendingInvoices = await tx
      .select({ id: financialRecordsTable.id })
      .from(financialRecordsTable)
      .where(
        and(
          inArray(financialRecordsTable.treatmentPlanProcedureId, itemIds),
          eq(financialRecordsTable.status, "pendente"),
        ),
      );
    const pendingIds = pendingInvoices.map((r) => r.id);

    // Appointments agendados (não realizados) ligados ao plano
    const futureAppts = await tx
      .select({ id: appointmentsTable.id, monthlyInvoiceId: appointmentsTable.monthlyInvoiceId })
      .from(appointmentsTable)
      .where(
        and(
          inArray(appointmentsTable.treatmentPlanProcedureId, itemIds),
          eq(appointmentsTable.status, "agendado"),
        ),
      );

    if (futureAppts.length > 0) {
      await tx
        .delete(appointmentsTable)
        .where(inArray(appointmentsTable.id, futureAppts.map((a) => a.id)));
      appointmentsDeleted = futureAppts.length;
    }

    // Apaga journal entries das faturas pendentes (originais + estornos),
    // depois as faturas. Como as faturas estão pendentes (não pagas), os
    // entries são apenas reconhecimento de receita futura — apagar não
    // afeta caixa.
    if (pendingIds.length > 0) {
      // Sprint 2 — Limpa o pool mensal vinculado às faturas que serão
      // apagadas. Apenas créditos que NUNCA foram consumidos (usedQuantity=0
      // E sem appointment vinculado) podem ser removidos. Os demais são
      // marcados como `estornado` para preservar histórico contábil.
      const poolRows = await tx
        .select({
          id: sessionCreditsTable.id,
          usedQuantity: sessionCreditsTable.usedQuantity,
          consumedByAppointmentId: sessionCreditsTable.consumedByAppointmentId,
        })
        .from(sessionCreditsTable)
        .where(
          and(
            eq(sessionCreditsTable.origin, "mensal"),
            inArray(sessionCreditsTable.financialRecordId, pendingIds),
          ),
        );
      const deletableIds: number[] = [];
      const reversibleIds: number[] = [];
      for (const r of poolRows) {
        if (r.usedQuantity === 0 && r.consumedByAppointmentId == null) {
          deletableIds.push(r.id);
        } else {
          reversibleIds.push(r.id);
        }
      }
      if (deletableIds.length > 0) {
        await tx
          .delete(sessionCreditsTable)
          .where(inArray(sessionCreditsTable.id, deletableIds));
      }
      if (reversibleIds.length > 0) {
        await tx
          .update(sessionCreditsTable)
          .set({
            status: "estornado",
            financialRecordId: null,
            notes: sql`COALESCE(${sessionCreditsTable.notes}, '') || E'\n[estornado: dematerialize do plano]'`,
          })
          .where(inArray(sessionCreditsTable.id, reversibleIds));
      }

      await tx
        .delete(accountingJournalEntriesTable)
        .where(
          and(
            eq(accountingJournalEntriesTable.sourceType, "financial_record"),
            inArray(accountingJournalEntriesTable.sourceId, pendingIds),
          ),
        );
      await tx
        .delete(financialRecordsTable)
        .where(inArray(financialRecordsTable.id, pendingIds));
      invoicesDeleted = pendingIds.length;
    }

    // Desvincula appointments preservados (compareceu/concluido/faltou) cuja
    // fatura sumiu, para não deixar FK órfã.
    if (pendingIds.length > 0) {
      const result = await tx
        .update(appointmentsTable)
        .set({ monthlyInvoiceId: null })
        .where(inArray(appointmentsTable.monthlyInvoiceId, pendingIds))
        .returning({ id: appointmentsTable.id });
      appointmentsUnlinked = result.length;
    }

    // Reseta materializedAt no plano.
    await tx
      .update(treatmentPlansTable)
      .set({ materializedAt: null })
      .where(eq(treatmentPlansTable.id, planId));
  });

  return { appointmentsDeleted, invoicesDeleted, appointmentsUnlinked };
}

/**
 * Sprint 2 — Trigger pós-pagamento de fatura mensal de plano.
 *
 * Quando uma `financial_records` com `transactionType='faturaPlano'` muda
 * para `status='pago'`, promovemos o pool mensal correspondente:
 *   • `pendentePagamento` → `disponivel`
 *
 * Idempotente: chamar várias vezes para o mesmo `financialRecordId` é
 * inofensivo (apenas linhas com status `pendentePagamento` são afetadas).
 *
 * Retorna o nº de linhas promovidas.
 */
export async function promotePrepaidCreditsForFinancialRecord(
  financialRecordId: number,
): Promise<number> {
  const result = await db
    .update(sessionCreditsTable)
    .set({
      status: "disponivel",
      notes: sql`COALESCE(${sessionCreditsTable.notes}, '') || E'\n[liberado: fatura paga]'`,
    })
    .where(
      and(
        eq(sessionCreditsTable.financialRecordId, financialRecordId),
        eq(sessionCreditsTable.status, "pendentePagamento"),
      ),
    )
    .returning({ id: sessionCreditsTable.id });
  return result.length;
}

/**
 * Sprint 2 — Reverso de pagamento.
 *
 * Quando uma fatura mensal `faturaPlano` é estornada/cancelada após paga,
 * volta o pool de `disponivel` → `pendentePagamento` apenas para créditos
 * que ainda não foram consumidos.
 */
export async function revertPrepaidCreditsForFinancialRecord(
  financialRecordId: number,
): Promise<number> {
  const result = await db
    .update(sessionCreditsTable)
    .set({
      status: "pendentePagamento",
      notes: sql`COALESCE(${sessionCreditsTable.notes}, '') || E'\n[bloqueado: pagamento estornado]'`,
    })
    .where(
      and(
        eq(sessionCreditsTable.financialRecordId, financialRecordId),
        eq(sessionCreditsTable.status, "disponivel"),
        eq(sessionCreditsTable.usedQuantity, 0),
      ),
    )
    .returning({ id: sessionCreditsTable.id });
  return result.length;
}
