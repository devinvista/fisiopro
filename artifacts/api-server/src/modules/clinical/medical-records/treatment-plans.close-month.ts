/**
 * Fechamento mensal de itens avulsos do plano de tratamento.
 *
 * Suporta dois fluxos distintos:
 *
 * 1. Fluxo legado (sessões cobradas individualmente via billing de agendamento):
 *    Cada sessão realizada gera um lançamento `creditoAReceber`/`pendenteFatura`.
 *    O fechar-mês agrupa esses lançamentos em uma `faturaMensalAvulso`.
 *
 * 2. Fluxo pré-gerado (aceite contábil antecipado — Sprint Financeiro 13/P4):
 *    O aceite cria faturas estimadas `faturaPlanoAvulsoMensal` (1/mês por item).
 *    O fechar-mês atualiza essas faturas com a contagem REAL de sessões
 *    confirmadas nos agendamentos do mês, corrigindo o valor estimado.
 *
 * Idempotência: re-chamar fechar-mês para um mês já fechado retorna a fatura
 * existente sem criar/atualizar nada.
 */
import { db } from "@workspace/db";
import {
  appointmentsTable,
  financialRecordsTable,
  treatmentPlansTable,
  treatmentPlanProceduresTable,
  patientsTable,
  clinicsTable,
} from "@workspace/db";
import { and, eq, isNull, sql } from "drizzle-orm";

export interface CloseMonthResult {
  planId: number;
  monthRef: string;
  invoiceId: number;
  itemsConsolidated: number;
  sessionsCount: number;
  totalAmount: string;
  alreadyClosed: boolean;
  mode: "pregen_updated" | "consolidated" | "already_closed";
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthBounds(monthRef: string): { start: string; end: string } {
  const [y, m] = monthRef.slice(0, 7).split("-").map(Number);
  if (!y || !m) throw new Error(`monthRef inválido: ${monthRef}`);
  const last = lastDayOfMonth(y, m);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    start: `${y}-${pad(m)}-01`,
    end: `${y}-${pad(m)}-${pad(last)}`,
  };
}

/**
 * Fecha o mês de avulsos de um plano. `monthRef` no formato `YYYY-MM`.
 */
export async function closeAvulsoMonth(
  planId: number,
  monthRef: string,
): Promise<CloseMonthResult> {
  const [plan] = await db
    .select()
    .from(treatmentPlansTable)
    .where(eq(treatmentPlansTable.id, planId))
    .limit(1);
  if (!plan) throw new Error(`Plano #${planId} não encontrado`);

  const { start: monthStart, end: monthEnd } = monthBounds(monthRef);
  const normalizedRef = monthStart;

  return await db.transaction(async (tx) => {
    // ─── Idempotência global: faturaMensalAvulso já existe? ───────────────────
    const [existingConsolidated] = await tx
      .select()
      .from(financialRecordsTable)
      .where(
        and(
          eq(financialRecordsTable.transactionType, "faturaMensalAvulso"),
          eq(financialRecordsTable.treatmentPlanId, planId),
          sql`${financialRecordsTable.planMonthRef} = ${normalizedRef}::date`,
        ),
      )
      .limit(1);

    if (existingConsolidated) {
      const [{ count: childCount }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(financialRecordsTable)
        .where(eq(financialRecordsTable.parentRecordId, existingConsolidated.id));
      return {
        planId,
        monthRef: normalizedRef,
        invoiceId: existingConsolidated.id,
        itemsConsolidated: Number(childCount),
        sessionsCount: Number(childCount),
        totalAmount: String(existingConsolidated.amount),
        alreadyClosed: true,
        mode: "already_closed",
      };
    }

    // ─── Idempotência pré-gerado: mês já foi fechado (fechar_mes_confirmado)? ─
    const pregenAlreadyClosed = await tx
      .select()
      .from(financialRecordsTable)
      .where(
        and(
          eq(financialRecordsTable.transactionType, "faturaPlanoAvulsoMensal"),
          eq(financialRecordsTable.treatmentPlanId, planId),
          sql`${financialRecordsTable.planMonthRef} = ${normalizedRef}::date`,
          sql`${financialRecordsTable.priceSource} = 'fechar_mes_confirmado'`,
        ),
      );

    if (pregenAlreadyClosed.length > 0) {
      const totalAmount = pregenAlreadyClosed.reduce((s, r) => s + Number(r.amount ?? 0), 0);
      const totalSessions = pregenAlreadyClosed.reduce((s, r) => s + Number(r.recognitionCreditsTotal ?? 0), 0);
      return {
        planId,
        monthRef: normalizedRef,
        invoiceId: pregenAlreadyClosed[0].id,
        itemsConsolidated: pregenAlreadyClosed.length,
        sessionsCount: totalSessions,
        totalAmount: totalAmount.toFixed(2),
        alreadyClosed: true,
        mode: "already_closed",
      };
    }

    // ─── Fluxo pré-gerado: faturaPlanoAvulsoMensal existe para este mês? ─────
    // Verifica se o aceite criou faturas estimadas. Se sim, atualiza com a
    // contagem REAL de sessões confirmadas nos agendamentos.
    const pregenEstimates = await tx
      .select()
      .from(financialRecordsTable)
      .where(
        and(
          eq(financialRecordsTable.transactionType, "faturaPlanoAvulsoMensal"),
          eq(financialRecordsTable.treatmentPlanId, planId),
          sql`${financialRecordsTable.planMonthRef} = ${normalizedRef}::date`,
          sql`${financialRecordsTable.status} NOT IN ('pago','cancelado','estornado')`,
        ),
      );

    if (pregenEstimates.length > 0) {
      let totalRealAmount = 0;
      let totalConfirmedSessions = 0;

      for (const est of pregenEstimates) {
        // Conta sessões REAIS confirmadas para este item do plano neste mês.
        // Usa treatmentPlanProcedureId para correlacionar ao item correto.
        const sessionRows = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(appointmentsTable)
          .where(
            and(
              eq(appointmentsTable.treatmentPlanProcedureId, est.treatmentPlanProcedureId!),
              sql`${appointmentsTable.date} BETWEEN ${monthStart}::date AND ${monthEnd}::date`,
              sql`${appointmentsTable.status} IN ('compareceu','concluido')`,
            ),
          );
        const confirmedSessions = Number(sessionRows[0]?.count ?? 0);

        // Recupera unitEffective a partir dos dados armazenados.
        // amount = unitEffective × recognitionCreditsTotal (estimado).
        // Se recognitionCreditsTotal é null/0, usa amount como valor fixo.
        const estimatedCredits = Number(est.recognitionCreditsTotal ?? 0);
        const storedAmount = Number(est.amount ?? 0);
        const unitEffective = estimatedCredits > 0
          ? storedAmount / estimatedCredits
          : storedAmount;

        // Usa ao menos 1 sessão para não zerar a fatura (sessões reais podem
        // ser 0 se nenhuma foi realizada ainda — nesse caso mantém a estimativa).
        const realCredits = confirmedSessions > 0 ? confirmedSessions : estimatedCredits;
        const newTotal = Math.max(1, realCredits);
        const realAmount = unitEffective * newTotal;

        // consumed não pode superar o novo total (constraint DB).
        // recognized_amount deve ser proporcional ao consumed.
        const prevConsumed = Number(est.recognitionCreditsConsumed ?? 0);
        const newConsumed = Math.min(prevConsumed, newTotal);
        const newRecognized = unitEffective * newConsumed;

        await tx
          .update(financialRecordsTable)
          .set({
            amount: realAmount.toFixed(2),
            recognitionCreditsTotal: newTotal,
            recognitionCreditsConsumed: newConsumed,
            recognizedAmount: newRecognized.toFixed(2),
            priceSource: confirmedSessions > 0 ? "fechar_mes_confirmado" : "plano_avulso_estimado",
          } as any)
          .where(eq(financialRecordsTable.id, est.id));

        totalRealAmount += realAmount;
        totalConfirmedSessions += confirmedSessions;
      }

      // Retorna a primeira fatura atualizada como referência (todas são por item).
      return {
        planId,
        monthRef: normalizedRef,
        invoiceId: pregenEstimates[0].id,
        itemsConsolidated: pregenEstimates.length,
        sessionsCount: totalConfirmedSessions,
        totalAmount: totalRealAmount.toFixed(2),
        alreadyClosed: false,
        mode: "pregen_updated",
      };
    }

    // ─── Fluxo legado: consolida lançamentos de sessões individuais ───────────
    // Busca registros `creditoAReceber`/`pendenteFatura` (billing de agendamento)
    // pendentes e sem parent para o plano neste mês.
    const candidatesRows = await tx
      .select({
        record: financialRecordsTable,
      })
      .from(financialRecordsTable)
      .leftJoin(
        appointmentsTable,
        eq(appointmentsTable.id, financialRecordsTable.appointmentId),
      )
      .where(
        and(
          eq(financialRecordsTable.treatmentPlanId, planId),
          eq(financialRecordsTable.status, "pendente"),
          isNull(financialRecordsTable.parentRecordId),
          sql`${financialRecordsTable.transactionType} IN ('creditoAReceber','pendenteFatura')`,
          sql`(
            (${financialRecordsTable.planMonthRef} = ${normalizedRef}::date)
            OR (
              ${financialRecordsTable.planMonthRef} IS NULL
              AND ${appointmentsTable.date} BETWEEN ${monthStart}::date AND ${monthEnd}::date
            )
          )`,
        ),
      );
    const candidates = candidatesRows.map((r) => r.record);

    if (candidates.length === 0) {
      throw new Error(
        `Nenhum lançamento avulso pendente para consolidar no plano #${planId} em ${monthRef}.`,
      );
    }

    const total = candidates.reduce((s, r) => s + Number(r.amount ?? 0), 0);

    const [patient] = await tx
      .select({ name: patientsTable.name })
      .from(patientsTable)
      .where(eq(patientsTable.id, plan.patientId))
      .limit(1);
    const patientName = patient?.name ?? `paciente#${plan.patientId}`;

    // Resolve dia de vencimento.
    const [y, m] = normalizedRef.split("-").map(Number);
    const lastDay = lastDayOfMonth(y, m);
    const billingDay = plan.avulsoBillingDay ?? null;
    let dueDay = billingDay;
    if (dueDay == null && plan.clinicId) {
      const [clinic] = await tx
        .select({ defaultDueDays: clinicsTable.defaultDueDays })
        .from(clinicsTable)
        .where(eq(clinicsTable.id, plan.clinicId))
        .limit(1);
      dueDay = clinic?.defaultDueDays ?? 10;
    }
    if (dueDay == null) dueDay = 10;
    const dueDayClamped = Math.min(Math.max(1, dueDay), lastDay);
    const dueY = m === 12 ? y + 1 : y;
    const dueM = m === 12 ? 1 : m + 1;
    const dueLastDay = lastDayOfMonth(dueY, dueM);
    const realDueDay = Math.min(dueDayClamped, dueLastDay);
    const dueDate = `${dueY}-${String(dueM).padStart(2, "0")}-${String(realDueDay).padStart(2, "0")}`;

    const childCategories = Array.from(
      new Set(candidates.map((c) => c.category).filter(Boolean) as string[]),
    );
    const aggregatedCategory = childCategories.length === 1
      ? childCategories[0]
      : "Fatura mensal";

    const [invoice] = await tx
      .insert(financialRecordsTable)
      .values({
        type: "receita",
        amount: total.toFixed(2),
        description: `Fatura mensal de avulsos — ${patientName} — ${normalizedRef.slice(0, 7)}`,
        category: aggregatedCategory,
        patientId: plan.patientId,
        transactionType: "faturaMensalAvulso",
        status: "pendente",
        dueDate,
        clinicId: plan.clinicId,
        treatmentPlanId: planId,
        planMonthRef: normalizedRef,
      })
      .returning({ id: financialRecordsTable.id });

    const childIds = candidates.map((r) => r.id);
    await tx
      .update(financialRecordsTable)
      .set({ parentRecordId: invoice.id })
      .where(sql`${financialRecordsTable.id} = ANY(${childIds})`);

    return {
      planId,
      monthRef: normalizedRef,
      invoiceId: invoice.id,
      itemsConsolidated: candidates.length,
      sessionsCount: candidates.length,
      totalAmount: total.toFixed(2),
      alreadyClosed: false,
      mode: "consolidated",
    };
  });
}
