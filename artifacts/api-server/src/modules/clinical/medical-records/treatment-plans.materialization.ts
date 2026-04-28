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
} from "@workspace/db";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  postReceivableRevenue,
  resolveAccountCodeById,
} from "../../shared/accounting/accounting.service.js";

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
  procedureId: number | null;
  packageId: number | null;
  unitMonthlyPrice: string | null;
  discount: string | null;
  weekDays: string | null;
  defaultStartTime: string | null;
  defaultProfessionalId: number | null;
  sessionDurationMinutes: number | null;
  packageType: string | null;
  packageBillingDay: number | null;
  packageProcedureId: number | null;
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
      procedureId: treatmentPlanProceduresTable.procedureId,
      packageId: treatmentPlanProceduresTable.packageId,
      unitMonthlyPrice: treatmentPlanProceduresTable.unitMonthlyPrice,
      discount: treatmentPlanProceduresTable.discount,
      weekDays: treatmentPlanProceduresTable.weekDays,
      defaultStartTime: treatmentPlanProceduresTable.defaultStartTime,
      defaultProfessionalId: treatmentPlanProceduresTable.defaultProfessionalId,
      sessionDurationMinutes: treatmentPlanProceduresTable.sessionDurationMinutes,
      packageType: packagesTable.packageType,
      packageBillingDay: packagesTable.billingDay,
      packageProcedureId: packagesTable.procedureId,
    })
    .from(treatmentPlanProceduresTable)
    .leftJoin(packagesTable, eq(packagesTable.id, treatmentPlanProceduresTable.packageId))
    .where(eq(treatmentPlanProceduresTable.treatmentPlanId, planId));
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

  // Validação dos itens mensais.
  const monthlyItems = items.filter(
    (i) =>
      i.packageId != null &&
      i.packageType === "mensal" &&
      Number(i.unitMonthlyPrice ?? 0) > 0,
  );
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

  const scheduleId = await defaultScheduleId(plan.clinicId ?? null);

  let appointmentsCreated = 0;
  let invoicesCreated = 0;
  let monthsCoveredCount = 0;
  let totalContracted = 0;

  await db.transaction(async (tx) => {
    for (const item of monthlyItems) {
      const procedureId = item.packageProcedureId ?? item.procedureId;
      if (!procedureId) continue;

      const [procedure] = await tx
        .select({
          name: proceduresTable.name,
          category: proceduresTable.category,
          price: proceduresTable.price,
          accountingAccountId: (proceduresTable as any).accountingAccountId,
        })
        .from(proceduresTable)
        .where(eq(proceduresTable.id, procedureId))
        .limit(1);
      if (!procedure) continue;

      const monthlyAmount = Math.max(
        0,
        Number(item.unitMonthlyPrice ?? 0) - Number(item.discount ?? 0),
      );
      const billingDay = item.packageBillingDay ?? 10;
      const weekDays = parseWeekDays(item.weekDays);
      const duration = item.sessionDurationMinutes ?? 60;

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

        const dueDay = Math.min(billingDay, lastDay);
        const dueDate = `${my}-${String(mm).padStart(2, "0")}-${String(dueDay).padStart(2, "0")}`;

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

        // Reconhece a receita acumulada (a receber) — competência = primeiro
        // dia do mês para refletir o regime de competência mensal.
        const accEntry = await postReceivableRevenue({
          clinicId: plan.clinicId,
          entryDate: monthStart,
          amount: monthlyAmount,
          description: `Receita mensal contratada — plano #${planId} — ${patientName} — ${monthStart.slice(0, 7)}`,
          sourceType: "financial_record",
          sourceId: invoice.id,
          patientId: plan.patientId,
          procedureId,
          financialRecordId: invoice.id,
          revenueAccountCode: accountCode,
        });

        await tx
          .update(financialRecordsTable)
          .set({ recognizedEntryId: accEntry.id, accountingEntryId: accEntry.id })
          .where(eq(financialRecordsTable.id, invoice.id));

        // 2) Cria os appointments do mês, vinculados à fatura.
        for (const date of dates) {
          await tx.insert(appointmentsTable).values({
            patientId: plan.patientId,
            procedureId,
            professionalId: item.defaultProfessionalId,
            date,
            startTime: item.defaultStartTime!,
            endTime: addMinutesToTime(item.defaultStartTime!, duration),
            status: "agendado",
            clinicId: plan.clinicId,
            scheduleId,
            treatmentPlanProcedureId: item.id,
            monthlyInvoiceId: invoice.id,
            source: "presencial",
          });
          appointmentsCreated++;
        }
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
