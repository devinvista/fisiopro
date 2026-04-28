/**
 * Sprint 4 — Fechamento mensal de itens avulsos do plano de tratamento.
 *
 * Quando um item do plano usa `avulsoBillingMode='mensalConsolidado'`,
 * cada sessão realizada gera um lançamento detalhado pendente
 * (`creditoAReceber` ou similar) com `treatmentPlanId` preenchido. No
 * fechamento do mês (manual ou automático), agrupamos todos os
 * lançamentos pendentes do plano dentro do mês de competência em uma
 * única `faturaMensalAvulso` (parent), e linkamos os itens via
 * `parent_record_id`.
 *
 * A fatura agrupadora (`parentRecordId = null`, `transactionType =
 * 'faturaMensalAvulso'`) tem:
 *   - `amount` = SUM(filhos.amount)
 *   - `dueDate` = `avulsoBillingDay` do plano (ou padrão da clínica)
 *   - `status` = 'pendente'
 *   - `description` = "Fatura mensal de avulsos — paciente — YYYY-MM"
 *
 * Idempotência: se já existe `faturaMensalAvulso` para o plano no mês
 * referenciado, retorna a fatura existente sem criar duplicada.
 */
import { db } from "@workspace/db";
import {
  financialRecordsTable,
  treatmentPlansTable,
  patientsTable,
  clinicsTable,
} from "@workspace/db";
import { and, eq, isNull, sql } from "drizzle-orm";

export interface CloseMonthResult {
  planId: number;
  monthRef: string; // YYYY-MM-01
  invoiceId: number;
  itemsConsolidated: number;
  totalAmount: string;
  alreadyClosed: boolean;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthBounds(monthRef: string): { start: string; end: string } {
  // monthRef esperado YYYY-MM ou YYYY-MM-DD; sempre normalizamos para o
  // primeiro dia do mês.
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
    // Idempotência: já existe fatura agrupadora para este plano/mês?
    const [existing] = await tx
      .select()
      .from(financialRecordsTable)
      .where(
        and(
          eq(financialRecordsTable.transactionType, "faturaMensalAvulso"),
          eq(financialRecordsTable.treatmentPlanId, planId),
          eq(financialRecordsTable.planMonthRef, normalizedRef),
        ),
      )
      .limit(1);

    if (existing) {
      // Conta filhos vinculados para retorno informativo.
      const [{ count: childCount }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(financialRecordsTable)
        .where(eq(financialRecordsTable.parentRecordId, existing.id));
      return {
        planId,
        monthRef: normalizedRef,
        invoiceId: existing.id,
        itemsConsolidated: Number(childCount),
        totalAmount: String(existing.amount),
        alreadyClosed: true,
      };
    }

    // Pega lançamentos pendentes/avulsos do plano no mês:
    //  - vinculados ao plano (treatmentPlanId)
    //  - status='pendente'
    //  - sem parent (não consolidados ainda)
    //  - tipo crédito a receber/pendenteFatura (sessão avulsa)
    //  - dueDate dentro do mês de competência (ou planMonthRef se preenchido)
    const candidates = await tx
      .select()
      .from(financialRecordsTable)
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
              AND ${financialRecordsTable.dueDate} BETWEEN ${monthStart}::date AND ${monthEnd}::date
            )
          )`,
        ),
      );

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
      // fallback: dia 10 do mês seguinte
      dueDay = 10;
    }
    if (dueDay == null) dueDay = 10;
    const dueDayClamped = Math.min(Math.max(1, dueDay), lastDay);
    // Vencimento no mês SEGUINTE ao mês de competência.
    const dueY = m === 12 ? y + 1 : y;
    const dueM = m === 12 ? 1 : m + 1;
    const dueLastDay = lastDayOfMonth(dueY, dueM);
    const realDueDay = Math.min(dueDayClamped, dueLastDay);
    const dueDate = `${dueY}-${String(dueM).padStart(2, "0")}-${String(realDueDay).padStart(2, "0")}`;

    // Cria a fatura agrupadora.
    const [invoice] = await tx
      .insert(financialRecordsTable)
      .values({
        type: "receita",
        amount: total.toFixed(2),
        description: `Fatura mensal de avulsos — ${patientName} — ${normalizedRef.slice(0, 7)}`,
        category: candidates[0].category,
        patientId: plan.patientId,
        transactionType: "faturaMensalAvulso",
        status: "pendente",
        dueDate,
        clinicId: plan.clinicId,
        treatmentPlanId: planId,
        planMonthRef: normalizedRef,
      })
      .returning({ id: financialRecordsTable.id });

    // Vincula os filhos. NÃO mudamos o status dos filhos (continuam
    // contabilmente válidos como recebíveis individuais), apenas marcamos
    // o `parentRecordId`. Quando a fatura agrupadora for paga, o handler
    // de pagamento marcará os filhos como pagos em cascata.
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
      totalAmount: total.toFixed(2),
      alreadyClosed: false,
    };
  });
}
