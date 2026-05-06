/**
 * Aceitação financeira de plano de tratamento.
 *
 * Quando o paciente aceita formalmente o plano, gera APENAS o necessário
 * para "fechar a venda":
 *
 *   - Itens `pacoteSessoes` (kind ou packageType="sessoes"): cria uma
 *     `vendaPacote` em `financial_records` (status=pendente) + N créditos
 *     em `session_credits` (status=`disponivel` ou `pendentePagamento`
 *     conforme paymentMode do plano/pacote).
 *
 *   - Itens `recorrenteMensal` (kind ou packageType="mensal"): cria a
 *     `faturaPlano` do MÊS CORRENTE apenas; as seguintes são geradas
 *     pelo job diário `monthlyPlanBilling`. Status `pendente`, dueDate no
 *     billingDay do pacote (clamped ao último dia do mês).
 *
 *   - Itens `avulso` (sem packageId): nenhum efeito — cobrança ocorre
 *     na conclusão de cada atendimento.
 *
 * NÃO cria `appointments`. A geração da agenda é feita pelo orquestrador
 * atômico `acceptAndMaterializePlan`.
 *
 * Idempotente: invocar duas vezes com o plano já aceito não duplica registros.
 */
import { db } from "@workspace/db";
import {
  financialRecordsTable,
  treatmentPlanProceduresTable,
  treatmentPlansTable,
  packagesTable,
  proceduresTable,
  patientsTable,
  sessionCreditsTable,
  accountingJournalEntriesTable,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import {
  planInstallmentDueDate,
  planMonthRefOf,
  resolveMonthlyDueDay,
} from "./treatment-plans.billing-dates.js";
import {
  postDeferredReceivable,
  resolveAccountCodeById,
} from "../../shared/accounting/accounting.service.js";

export interface AcceptPlanFinancialsResult {
  planId: number;
  invoicesCreated: number;
  creditsCreated: number;
  totalImmediateCharge: string;
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
  sessionsPerWeek: number | null;
  // Dias da semana configurados pelo usuário na etapa de agenda (ex: ["monday","wednesday"]).
  // Quando presentes, permite contar sessões reais por mês de calendário.
  weekDays: string | null;
  packageType: string | null;
  packageBillingDay: number | null;
  packageProcedureId: number | null;
  packagePaymentMode: string | null;
  packageName: string | null;
  // Pacote mensalidade: valor mensal contratado vive em `packages.monthly_price`.
  // Usado como fallback quando o item não tem `unitMonthlyPrice` próprio.
  packageMonthlyPrice: string | null;
}

/**
 * Resolve o tipo (kind) de um item, derivando dos campos legados quando
 * `kind` não está preenchido (retrocompatibilidade).
 */
export function resolveItemKind(item: {
  kind: string | null;
  packageId: number | null;
  packageType: string | null;
}): "recorrenteMensal" | "pacoteSessoes" | "avulso" {
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

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function todayBRT(): { y: number; m: number; d: number; iso: string } {
  // Para fins de aceite, usamos a data atual em BRT — o teste de unidade
  // pode passar a data como override pelo callsite (acceptPlanFinancials).
  const tz = "America/Sao_Paulo";
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value);
  const d = Number(parts.find((p) => p.type === "day")!.value);
  return { y, m, d, iso: `${y}-${pad(m)}-${pad(d)}` };
}

async function loadAcceptanceItems(planId: number): Promise<PlanItem[]> {
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
      sessionsPerWeek: treatmentPlanProceduresTable.sessionsPerWeek,
      weekDays: treatmentPlanProceduresTable.weekDays,
      packageType: packagesTable.packageType,
      packageBillingDay: packagesTable.billingDay,
      packageProcedureId: packagesTable.procedureId,
      packagePaymentMode: packagesTable.paymentMode,
      packageName: packagesTable.name,
      packageMonthlyPrice: packagesTable.monthlyPrice,
    })
    .from(treatmentPlanProceduresTable)
    .leftJoin(packagesTable, eq(packagesTable.id, treatmentPlanProceduresTable.packageId))
    .where(eq(treatmentPlanProceduresTable.treatmentPlanId, planId));
}

/**
 * Conta quantas ocorrências dos `weekDays` caem no intervalo [startISO, endExclISO).
 * Usado para calcular sessões reais por mês de calendário em avulsos.
 */
function countSessionsInRange(
  startISO: string,
  endExclISO: string,
  weekDays: string[],
): number {
  if (weekDays.length === 0) return 0;
  const WEEKDAY_INDEX: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6,
  };
  const targets = new Set(
    weekDays.map((d) => WEEKDAY_INDEX[d]).filter((n) => n !== undefined),
  );
  if (targets.size === 0) return 0;

  const [sy, sm, sd] = startISO.split("-").map(Number);
  const [ey, em, ed] = endExclISO.split("-").map(Number);
  const start = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));

  let count = 0;
  const cur = new Date(start);
  while (cur < end) {
    if (targets.has(cur.getUTCDay())) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

/**
 * Gera o efeito financeiro do aceite. Idempotente por desenho: a função
 * deve ser chamada apenas no momento do aceite (acceptedAt → not null).
 *
 * Retorna contagens para auditoria/UX.
 */
export async function acceptPlanFinancials(
  planId: number,
  opts: { now?: { y: number; m: number; d: number; iso: string } } = {},
): Promise<AcceptPlanFinancialsResult> {
  const [plan] = await db
    .select()
    .from(treatmentPlansTable)
    .where(eq(treatmentPlansTable.id, planId))
    .limit(1);
  if (!plan) throw new Error(`Plano #${planId} não encontrado`);

  const items = await loadAcceptanceItems(planId);
  if (items.length === 0) {
    return {
      planId,
      invoicesCreated: 0,
      creditsCreated: 0,
      totalImmediateCharge: "0.00",
    };
  }

  const [patient] = await db
    .select({ name: patientsTable.name })
    .from(patientsTable)
    .where(eq(patientsTable.id, plan.patientId))
    .limit(1);
  const patientName = patient?.name ?? `paciente#${plan.patientId}`;

  const now = opts.now ?? todayBRT();
  const planPaymentMode = (plan.paymentMode || "postpago") as "prepago" | "postpago";

  let invoicesCreated = 0;
  let creditsCreated = 0;
  let totalImmediateCharge = 0;

  await db.transaction(async (tx) => {
    for (const item of items) {
      const kind = resolveItemKind(item);

      // ─── Avulso ──────────────────────────────────────────────────────────
      // Há dois modos de cobrança para itens avulso (plan.avulsoBillingMode):
      //
      //   "porSessao"       — nenhum efeito no aceite. A fatura é gerada
      //                       individualmente quando cada atendimento é
      //                       concluído (via applyBillingRules → priority 2).
      //
      //   "mensalConsolidado" — aceite contábil antecipado: estimamos
      //                       `sessões/mês` e criamos 1 fatura mensal por
      //                       (item, mês de competência) com transactionType =
      //                       'faturaPlanoAvulsoMensal'. A apropriação ocorre
      //                       por sessão consumida via recognizeMonthlyInvoiceRevenuePartial.
      //
      // Itens sem `procedureId` ou `unitPrice` ≤ 0 → skip (input incompleto).
      if (kind === "avulso") {
        // porSessao: sem efeito no aceite — cobrança ocorre por atendimento.
        if ((plan.avulsoBillingMode ?? "porSessao") !== "mensalConsolidado") continue;
        const avulsoProcedureId = item.procedureId;
        if (!avulsoProcedureId) continue;

        const durationMonths = plan.durationMonths ?? 12;
        const unit = Number(item.unitPrice ?? 0);
        // item.discount armazena o desconto TOTAL do plano (desconto/sessão ×
        // sessões totais), NÃO o desconto unitário. Isso é a convenção do
        // formulário de itens (TreatmentPlanItemsSection.tsx). Precisamos
        // recuperar o desconto por sessão antes de calcular o preço efetivo.
        const totalDiscount = Math.max(0, Number(item.discount ?? 0));
        const sessionsPerWeek = Math.max(1, item.sessionsPerWeek ?? 1);
        const planStart = plan.startDate ?? now.iso;
        const planEnd = planMonthRefOf(planStart, durationMonths); // "YYYY-MM-01" do mês após o último

        // Resolve os dias da semana configurados na etapa de agenda.
        // Se `weekDays` estiver preenchido (caso normal do accept-and-materialize),
        // contamos as sessões reais por mês usando o calendário — igual ao que
        // `materializeTreatmentPlan` vai criar. Sem weekDays, estimamos via spw × semanas.
        const parsedWeekDays: string[] = (() => {
          if (!item.weekDays) return [];
          try {
            const parsed = JSON.parse(item.weekDays);
            return Array.isArray(parsed) ? parsed : [];
          } catch { return []; }
        })();
        const hasRealWeekDays = parsedWeekDays.length > 0;

        // Sessões totais contratadas — usadas para recuperar o desconto unitário.
        // IMPORTANTE: deve-se usar item.totalSessions (sessões contratadas no plano)
        // como divisor do desconto total, e NÃO o total calculado pelo calendário.
        // O calendário pode retornar mais ocorrências do que as sessões contratadas
        // (ex.: 17 ocorrências seg/qua em 2 meses, mas o plano contrata apenas 10),
        // o que distorce o desconto por sessão e gera valores errados nas faturas.
        const contractedTotalSessions = item.totalSessions != null && item.totalSessions > 0
          ? item.totalSessions
          : (hasRealWeekDays
              ? Math.max(1, countSessionsInRange(planStart, planEnd, parsedWeekDays))
              : (() => {
                  const [psy, psm, psd] = planStart.split("-").map(Number);
                  const planTotalDays =
                    (Date.UTC(psy, psm - 1 + durationMonths, psd) - Date.UTC(psy, psm - 1, psd)) /
                    (1000 * 60 * 60 * 24);
                  return Math.max(1, Math.round(sessionsPerWeek * planTotalDays / 7));
                })());
        const unitDiscount = totalDiscount / contractedTotalSessions;
        const unitEffective = Math.max(0, unit - unitDiscount);
        if (unitEffective <= 0) continue;

        const [avulsoProcedure] = await tx
          .select({
            name: proceduresTable.name,
            category: proceduresTable.category,
            price: proceduresTable.price,
            accountingAccountId: (proceduresTable as any).accountingAccountId,
          } as any)
          .from(proceduresTable)
          .where(eq(proceduresTable.id, avulsoProcedureId))
          .limit(1);
        if (!avulsoProcedure) continue;

        const billingDay = resolveMonthlyDueDay({
          planMonthlyDueDay: plan.avulsoBillingDay ?? plan.monthlyDueDay,
          packageBillingDay: null,
        });

        // Para avulsos usamos a conta de receita por sessão (4.1.1) por
        // padrão, com fallback se o procedimento tiver sub-conta dedicada.
        const revenueAccountCode = await resolveAccountCodeById(
          (avulsoProcedure as any).accountingAccountId ?? null,
          "4.1.1",
          plan.clinicId ?? null,
          tx as any,
        );

        // Controla o saldo de sessões ainda não faturadas. O faturamento mensal
        // nunca deve ultrapassar o total contratado — ex.: plano de 10 sessões
        // em 2 meses com seg/qua teria 17 ocorrências no calendário, mas a soma
        // das faturas deve ser exatamente 10 × preço_efetivo.
        let remainingSessions = contractedTotalSessions;

        for (let m = 0; m < durationMonths; m++) {
          // Saldo zerado: todas as sessões contratadas já foram faturadas.
          if (remainingSessions <= 0) break;

          const itemMonthRef = planMonthRefOf(planStart, m);
          const nextMonthRef = planMonthRefOf(planStart, m + 1);
          const dueDate = planInstallmentDueDate(planStart, billingDay, m);

          // Sessões reais do mês: usa os weekDays configurados na etapa de agenda
          // para contar exatamente quantas ocorrências caem neste mês do calendário —
          // clipadas ao período real do plano. Sem weekDays (raro), recai na estimativa.
          const monthStart = itemMonthRef > planStart ? itemMonthRef : planStart;
          const monthEnd = nextMonthRef < planEnd ? nextMonthRef : planEnd;
          const rawSessionsInMonth = hasRealWeekDays
            ? Math.max(1, countSessionsInRange(monthStart, monthEnd, parsedWeekDays))
            : (() => {
                const [mY, mM] = itemMonthRef.split("-").map(Number);
                const daysInMonth = new Date(Date.UTC(mY, mM, 0)).getUTCDate();
                return Math.max(1, Math.round(sessionsPerWeek * daysInMonth / 7));
              })();
          // Cap: nunca faturar mais do que o saldo remanescente de sessões contratadas.
          const sessionsInMonth = Math.min(rawSessionsInMonth, remainingSessions);
          remainingSessions -= sessionsInMonth;
          const monthlyAmount = unitEffective * sessionsInMonth;

          // Idempotência: 1 fatura por (plano, item, mês de competência).
          const [exists] = await tx
            .select({ id: financialRecordsTable.id })
            .from(financialRecordsTable)
            .where(
              and(
                eq(financialRecordsTable.treatmentPlanId, planId),
                eq(financialRecordsTable.treatmentPlanProcedureId, item.id),
                eq(financialRecordsTable.transactionType, "faturaPlanoAvulsoMensal"),
                eq(financialRecordsTable.planMonthRef, itemMonthRef),
              ),
            )
            .limit(1);

          let invoiceId: number;
          if (exists) {
            invoiceId = exists.id;
          } else {
            const [inserted] = await tx
              .insert(financialRecordsTable)
              .values({
                type: "receita",
                amount: monthlyAmount.toFixed(2),
                description:
                  `Avulsos do plano #${planId} — ${avulsoProcedure.name} — ` +
                  `${patientName} — ${itemMonthRef.slice(0, 7)} ` +
                  `(${sessionsInMonth}× R$${unitEffective.toFixed(2)})`,
                category: avulsoProcedure.category,
                patientId: plan.patientId,
                procedureId: avulsoProcedureId,
                clinicId: plan.clinicId,
                transactionType: "faturaPlanoAvulsoMensal",
                status: "pendente",
                dueDate,
                treatmentPlanId: planId,
                treatmentPlanProcedureId: item.id,
                planMonthRef: itemMonthRef,
                priceSource: "plano_avulso_estimado",
                originalUnitPrice: avulsoProcedure.price,
                recognitionCreditsTotal: sessionsInMonth,
                recognitionCreditsConsumed: 0,
                recognizedAmount: "0",
              })
              .returning({ id: financialRecordsTable.id });
            invoiceId = inserted.id;
            invoicesCreated++;
            // Mês 0 entra no totalImmediateCharge — alinhado com mensalidade.
            if (m === 0) totalImmediateCharge += monthlyAmount;
          }

          // P4: postagem contábil antecipada (idempotente por sourceId).
          const [existingDeferred] = await tx
            .select({ id: accountingJournalEntriesTable.id })
            .from(accountingJournalEntriesTable)
            .where(
              and(
                eq(accountingJournalEntriesTable.sourceType, "financial_record"),
                eq(accountingJournalEntriesTable.sourceId, invoiceId),
                eq(accountingJournalEntriesTable.eventType, "deferred_receivable"),
              ),
            )
            .limit(1);

          if (!existingDeferred) {
            await postDeferredReceivable(
              {
                clinicId: plan.clinicId ?? null,
                entryDate: now.iso,
                amount: monthlyAmount,
                description:
                  `Aceite contábil antecipado (avulso) — fatura #${invoiceId} — ` +
                  `plano #${planId} — ${itemMonthRef.slice(0, 7)}`,
                sourceType: "financial_record",
                sourceId: invoiceId,
                patientId: plan.patientId,
                procedureId: avulsoProcedureId,
                financialRecordId: invoiceId,
                revenueAccountCode,
              } as any,
              tx as any,
            );
          }
        }
        continue;
      }

      const procedureId = item.packageProcedureId ?? item.procedureId;
      if (!procedureId) continue;

      const [procedure] = await tx
        .select({
          name: proceduresTable.name,
          category: proceduresTable.category,
          price: proceduresTable.price,
        })
        .from(proceduresTable)
        .where(eq(proceduresTable.id, procedureId))
        .limit(1);
      if (!procedure) continue;

      // ─── Pacote por sessões: 1 fatura à vista + N créditos ───────────────
      if (kind === "pacoteSessoes") {
        const sessions = item.totalSessions ?? 0;
        if (sessions <= 0) continue;

        const unit = Number(item.unitPrice ?? 0);
        const discount = Math.max(0, Number(item.discount ?? 0));
        const effective = Math.max(0, unit - discount);
        const totalPackagePrice = effective * sessions;

        const itemPaymentMode = (item.packagePaymentMode || planPaymentMode) as
          | "prepago"
          | "postpago";

        // 1) Fatura à vista (status pendente).
        if (totalPackagePrice > 0) {
          // Idempotência: evita criar 2 vendaPacote para o mesmo item do plano.
          const [exists] = await tx
            .select({ id: financialRecordsTable.id })
            .from(financialRecordsTable)
            .where(
              and(
                eq(financialRecordsTable.treatmentPlanId, planId),
                eq(financialRecordsTable.treatmentPlanProcedureId, item.id),
                eq(financialRecordsTable.transactionType, "vendaPacote"),
              ),
            )
            .limit(1);
          if (!exists) {
            await tx.insert(financialRecordsTable).values({
              type: "receita",
              amount: totalPackagePrice.toFixed(2),
              description: `Aceite de plano #${planId} — pacote ${item.packageName ?? procedure.name} — ${patientName}`,
              category: "Pacote",
              patientId: plan.patientId,
              procedureId,
              clinicId: plan.clinicId,
              transactionType: "vendaPacote",
              status: "pendente",
              dueDate: now.iso,
              treatmentPlanId: planId,
              treatmentPlanProcedureId: item.id,
              priceSource: "plano_tratamento",
              originalUnitPrice: procedure.price,
            });
            invoicesCreated++;
            totalImmediateCharge += totalPackagePrice;
          }
        }

        // 2) Créditos de sessão.
        const [creditsExist] = await tx
          .select({ id: sessionCreditsTable.id })
          .from(sessionCreditsTable)
          .where(
            and(
              eq(sessionCreditsTable.patientId, plan.patientId),
              eq(sessionCreditsTable.procedureId, procedureId),
              sql`${sessionCreditsTable.notes} LIKE ${`%plano #${planId}/item ${item.id}%`}`,
            ),
          )
          .limit(1);
        if (!creditsExist) {
          await tx.insert(sessionCreditsTable).values({
            patientId: plan.patientId,
            procedureId,
            quantity: sessions,
            usedQuantity: 0,
            clinicId: plan.clinicId,
            origin: "compraPacote",
            status: itemPaymentMode === "prepago" ? "pendentePagamento" : "disponivel",
            notes: `Créditos do aceite — plano #${planId}/item ${item.id} — pacote ${item.packageName ?? procedure.name}`,
          });
          creditsCreated++;
        }
        continue;
      }

      // ─── Recorrente mensal — Sprint Financeiro 12 (P3) ─────────────────────
      // Antes do P3 só era criada a fatura do MÊS 0 (a "fatura de aceite") e
      // os meses seguintes nasciam lazy via `materializeTreatmentPlan` ou via
      // job mensal. Sob P3, criamos TODAS as faturas da vigência já no aceite
      // E postamos contábil antecipadamente: D 1.1.2 / C 2.1.1 (recebível +
      // adiantamento). A receita continua nascendo só na sessão consumida (P2).
      //
      // O `dueDate` de cada parcela usa `planInstallmentDueDate(start, day, m)`,
      // garantindo que a 1ª nunca seja antes do `startDate` do plano.
      // Idempotência forte por (plano, item, planMonthRef).
      if (kind === "recorrenteMensal") {
        const effectiveMonthly =
          Number(item.unitMonthlyPrice ?? item.packageMonthlyPrice ?? 0);
        const monthlyAmount = Math.max(
          0,
          effectiveMonthly - Number(item.discount ?? 0),
        );
        if (monthlyAmount <= 0) continue;

        // Sprint Financeiro 9 (P1) — vencimento prioriza o que o paciente
        // escolheu no plano (`monthlyDueDay`); se null, herda do pacote.
        const billingDay = resolveMonthlyDueDay({
          planMonthlyDueDay: plan.monthlyDueDay,
          packageBillingDay: item.packageBillingDay,
        });
        const planStart = plan.startDate ?? now.iso;
        const durationMonths = plan.durationMonths ?? 12;

        // Sub-conta de receita pelo procedimento (4.1.2 default fracionado).
        const revenueAccountCode = await resolveAccountCodeById(
          (procedure as any).accountingAccountId ?? null,
          "4.1.2",
          plan.clinicId ?? null,
          tx as any,
        );

        for (let m = 0; m < durationMonths; m++) {
          const itemMonthRef = planMonthRefOf(planStart, m);
          const dueDate = planInstallmentDueDate(planStart, billingDay, m);

          // Idempotência: 1 fatura por (plano, item, mês de competência).
          const [exists] = await tx
            .select({
              id: financialRecordsTable.id,
              amount: financialRecordsTable.amount,
            })
            .from(financialRecordsTable)
            .where(
              and(
                eq(financialRecordsTable.treatmentPlanId, planId),
                eq(financialRecordsTable.treatmentPlanProcedureId, item.id),
                eq(financialRecordsTable.transactionType, "faturaPlano"),
                eq(financialRecordsTable.planMonthRef, itemMonthRef),
              ),
            )
            .limit(1);

          let invoiceId: number;
          if (exists) {
            invoiceId = exists.id;
          } else {
            const isMonthZero = m === 0;
            const description = isMonthZero
              ? `Aceite de plano #${planId} — ${procedure.name} — ${patientName} — ${itemMonthRef.slice(0, 7)}`
              : `Plano #${planId} — ${procedure.name} — ${patientName} — ${itemMonthRef.slice(0, 7)}`;
            const [inserted] = await tx
              .insert(financialRecordsTable)
              .values({
                type: "receita",
                amount: monthlyAmount.toFixed(2),
                description,
                category: procedure.category,
                patientId: plan.patientId,
                procedureId,
                clinicId: plan.clinicId,
                transactionType: "faturaPlano",
                status: "pendente",
                dueDate,
                treatmentPlanId: planId,
                treatmentPlanProcedureId: item.id,
                planMonthRef: itemMonthRef,
                priceSource: "plano_mensal_proporcional",
                originalUnitPrice: procedure.price,
              })
              .returning({ id: financialRecordsTable.id });
            invoiceId = inserted.id;
            invoicesCreated++;
            // Apenas o mês 0 conta como "cobrança imediata" para o aceite —
            // os demais são contas-a-receber futuras.
            if (isMonthZero) totalImmediateCharge += monthlyAmount;
          }

          // ── P3: postagem contábil antecipada (idempotente por sourceId) ──
          // Verifica se já existe um deferred_receivable para esta fatura.
          // Importante: NÃO desconta entries reversed — se foi estornado por
          // cancelamento, religar exigiria re-aceite, fora de escopo.
          const [existingDeferred] = await tx
            .select({ id: accountingJournalEntriesTable.id })
            .from(accountingJournalEntriesTable)
            .where(
              and(
                eq(accountingJournalEntriesTable.sourceType, "financial_record"),
                eq(accountingJournalEntriesTable.sourceId, invoiceId),
                eq(accountingJournalEntriesTable.eventType, "deferred_receivable"),
              ),
            )
            .limit(1);

          if (!existingDeferred) {
            await postDeferredReceivable(
              {
                clinicId: plan.clinicId ?? null,
                entryDate: now.iso,
                amount: monthlyAmount,
                description:
                  `Aceite contábil antecipado — fatura #${invoiceId} — ` +
                  `plano #${planId} — ${itemMonthRef.slice(0, 7)}`,
                sourceType: "financial_record",
                sourceId: invoiceId,
                patientId: plan.patientId,
                procedureId,
                financialRecordId: invoiceId,
                revenueAccountCode,
              } as any,
              tx as any,
            );
          }
        }
      }
    }
  });

  return {
    planId,
    invoicesCreated,
    creditsCreated,
    totalImmediateCharge: totalImmediateCharge.toFixed(2),
  };
}
