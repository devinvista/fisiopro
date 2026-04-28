/**
 * Backfill: materializa todos os planos de tratamento ativos com pacote
 * mensal, regenerando appointments + faturas mensais para todos os
 * pacientes (conforme solicitação: "apaga tudo e gere novamente").
 *
 * Etapas (por plano):
 *  1. Garante `duration_months` (default 12) e `start_date` (default
 *     primeiro dia do mês corrente).
 *  2. Para cada item mensal sem `week_days`/`default_start_time`/
 *     `default_professional_id`, infere os valores a partir do histórico
 *     de appointments do paciente para o(s) procedimento(s) do pacote.
 *  3. Limpa dados antigos no intervalo do plano:
 *      - financial_records pendentes (faturaPlano, faturaConsolidada,
 *        pendenteFatura) ligados ao plano OU paciente+procedimento;
 *      - journal entries vinculados;
 *      - appointments dentro da janela do plano.
 *  4. Reseta `materialized_at = NULL`.
 *  5. Chama `materializeTreatmentPlan(planId)`.
 *
 * Uso:
 *   pnpm tsx scripts/backfill-treatment-plans.ts                  # todos
 *   pnpm tsx scripts/backfill-treatment-plans.ts --dry-run        # simula
 *   pnpm tsx scripts/backfill-treatment-plans.ts --plan=71        # único
 *   pnpm tsx scripts/backfill-treatment-plans.ts --patient=57     # 1 pac
 *   pnpm tsx scripts/backfill-treatment-plans.ts --duration=12    # default
 */
import { db } from "../lib/db/src";
import {
  appointmentsTable,
  financialRecordsTable,
  treatmentPlansTable,
  treatmentPlanProceduresTable,
  packagesTable,
  patientsTable,
  accountingJournalEntriesTable,
  sessionCreditsTable,
} from "../lib/db/src/schema";
import { and, eq, inArray, sql, isNull } from "drizzle-orm";
import {
  materializeTreatmentPlan,
  dematerializeTreatmentPlan,
} from "../artifacts/api-server/src/modules/clinical/medical-records/treatment-plans.materialization";
import { todayBRT } from "../artifacts/api-server/src/utils/dateUtils";

const WEEK_DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

interface Args {
  dryRun: boolean;
  planId: number | null;
  patientId: number | null;
  defaultDuration: number;
}

function parseArgs(): Args {
  const out: Args = { dryRun: false, planId: null, patientId: null, defaultDuration: 12 };
  for (const a of process.argv.slice(2)) {
    if (a === "--dry-run") out.dryRun = true;
    else if (a.startsWith("--plan=")) out.planId = Number(a.split("=")[1]);
    else if (a.startsWith("--patient=")) out.patientId = Number(a.split("=")[1]);
    else if (a.startsWith("--duration=")) out.defaultDuration = Number(a.split("=")[1]);
  }
  return out;
}

function firstDayOfCurrentMonth(): string {
  return todayBRT().slice(0, 8) + "01";
}

function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, d));
  return dt.toISOString().slice(0, 10);
}

interface PlanRow {
  id: number;
  patientId: number;
  patientName: string;
  clinicId: number | null;
  durationMonths: number | null;
  startDate: string | null;
  materializedAt: Date | null;
}

async function findPlans(args: Args): Promise<PlanRow[]> {
  const conds: any[] = [
    eq(treatmentPlansTable.status, "ativo"),
    eq(packagesTable.packageType, "mensal"),
    sql`${treatmentPlanProceduresTable.unitMonthlyPrice}::numeric > 0`,
  ];
  if (args.planId) conds.push(eq(treatmentPlansTable.id, args.planId));
  if (args.patientId) conds.push(eq(treatmentPlansTable.patientId, args.patientId));

  const rows = await db
    .selectDistinct({
      id: treatmentPlansTable.id,
      patientId: treatmentPlansTable.patientId,
      patientName: patientsTable.name,
      clinicId: treatmentPlansTable.clinicId,
      durationMonths: treatmentPlansTable.durationMonths,
      startDate: treatmentPlansTable.startDate,
      materializedAt: treatmentPlansTable.materializedAt,
    })
    .from(treatmentPlanProceduresTable)
    .innerJoin(treatmentPlansTable, eq(treatmentPlansTable.id, treatmentPlanProceduresTable.treatmentPlanId))
    .innerJoin(packagesTable, eq(packagesTable.id, treatmentPlanProceduresTable.packageId))
    .innerJoin(patientsTable, eq(patientsTable.id, treatmentPlansTable.patientId))
    .where(and(...conds))
    .orderBy(treatmentPlansTable.id);

  return rows.map((r) => ({
    ...r,
    startDate: r.startDate ?? null,
    materializedAt: r.materializedAt ?? null,
  }));
}

interface PlanItem {
  id: number;
  procedureId: number | null;
  packageId: number | null;
  packageProcedureId: number | null;
  packageType: string | null;
  unitMonthlyPrice: string | null;
  sessionsPerWeek: number | null;
  weekDays: string | null;
  defaultStartTime: string | null;
  defaultProfessionalId: number | null;
}

async function loadItems(planId: number): Promise<PlanItem[]> {
  return db
    .select({
      id: treatmentPlanProceduresTable.id,
      procedureId: treatmentPlanProceduresTable.procedureId,
      packageId: treatmentPlanProceduresTable.packageId,
      packageProcedureId: packagesTable.procedureId,
      packageType: packagesTable.packageType,
      unitMonthlyPrice: treatmentPlanProceduresTable.unitMonthlyPrice,
      sessionsPerWeek: treatmentPlanProceduresTable.sessionsPerWeek,
      weekDays: treatmentPlanProceduresTable.weekDays,
      defaultStartTime: treatmentPlanProceduresTable.defaultStartTime,
      defaultProfessionalId: treatmentPlanProceduresTable.defaultProfessionalId,
    })
    .from(treatmentPlanProceduresTable)
    .leftJoin(packagesTable, eq(packagesTable.id, treatmentPlanProceduresTable.packageId))
    .where(eq(treatmentPlanProceduresTable.treatmentPlanId, planId));
}

interface Inferred {
  weekDays: string[];
  startTime: string | null;
  professionalId: number | null;
  sourceCount: number;
}

/**
 * Infere week_days, default_start_time e default_professional_id a partir
 * do histórico de appointments do paciente para o procedimento (do item ou
 * do pacote). Retorna `sourceCount = 0` se não houver histórico.
 */
async function inferFromHistory(
  patientId: number,
  procedureId: number,
  sessionsPerWeek: number,
): Promise<Inferred> {
  const past = await db
    .select({
      date: appointmentsTable.date,
      startTime: appointmentsTable.startTime,
      professionalId: appointmentsTable.professionalId,
    })
    .from(appointmentsTable)
    .where(
      and(
        eq(appointmentsTable.patientId, patientId),
        eq(appointmentsTable.procedureId, procedureId),
        sql`${appointmentsTable.status} NOT IN ('cancelado', 'remarcado')`,
      ),
    );

  if (past.length === 0) {
    return { weekDays: [], startTime: null, professionalId: null, sourceCount: 0 };
  }

  // Distribuição por dia da semana
  const dowCount = new Map<number, number>();
  const timeCount = new Map<string, number>();
  const profCount = new Map<number, number>();

  for (const a of past) {
    const d = new Date(`${a.date}T12:00:00Z`).getUTCDay();
    dowCount.set(d, (dowCount.get(d) ?? 0) + 1);
    if (a.startTime) timeCount.set(a.startTime, (timeCount.get(a.startTime) ?? 0) + 1);
    if (a.professionalId != null) profCount.set(a.professionalId, (profCount.get(a.professionalId) ?? 0) + 1);
  }

  const topDows = Array.from(dowCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(1, sessionsPerWeek))
    .map(([dow]) => WEEK_DAY_NAMES[dow]);

  const topTime = Array.from(timeCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const topProf = Array.from(profCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    weekDays: topDows,
    startTime: topTime,
    professionalId: topProf,
    sourceCount: past.length,
  };
}

async function ensurePlanFields(plan: PlanRow, defaultDuration: number, dryRun: boolean): Promise<{
  durationMonths: number;
  startDate: string;
  changed: boolean;
}> {
  let changed = false;
  let durationMonths = plan.durationMonths ?? defaultDuration;
  let startDate = plan.startDate ?? firstDayOfCurrentMonth();
  if (plan.durationMonths == null) changed = true;
  if (plan.startDate == null) changed = true;

  if (changed && !dryRun) {
    await db
      .update(treatmentPlansTable)
      .set({ durationMonths, startDate, endDate: addMonths(startDate, durationMonths) })
      .where(eq(treatmentPlansTable.id, plan.id));
  }
  return { durationMonths, startDate, changed };
}

async function ensureItemFields(
  item: PlanItem,
  patientId: number,
  dryRun: boolean,
): Promise<{ ok: boolean; reason?: string; inferred?: Inferred }> {
  const procId = item.procedureId ?? item.packageProcedureId;
  if (!procId) return { ok: false, reason: "item sem procedimento" };

  let weekDays: string[] = [];
  if (item.weekDays) {
    try {
      const arr = JSON.parse(item.weekDays);
      if (Array.isArray(arr)) weekDays = arr.map(String);
    } catch {
      weekDays = item.weekDays.split(",").map((s) => s.trim());
    }
  }
  let startTime = item.defaultStartTime;
  let professionalId = item.defaultProfessionalId;

  // Sempre tenta inferir do histórico — útil para preencher campos
  // ausentes mesmo quando já há alguns valores configurados (ex.: dias
  // e horário existem mas profissional padrão está nulo).
  const needsInference =
    weekDays.length === 0 || !startTime || !professionalId;

  let inferred: Inferred = {
    weekDays: [],
    startTime: null,
    professionalId: null,
    sourceCount: 0,
  };

  if (needsInference) {
    inferred = await inferFromHistory(patientId, procId, item.sessionsPerWeek ?? 1);
  } else {
    return { ok: true };
  }

  // Fallback de profissional: usa o profissional mais frequente do
  // paciente em qualquer procedimento, se a inferência específica falhar.
  let fallbackProf: number | null = inferred.professionalId;
  if (!professionalId && !fallbackProf) {
    const recent = await db
      .select({
        professionalId: appointmentsTable.professionalId,
      })
      .from(appointmentsTable)
      .where(
        and(
          eq(appointmentsTable.patientId, patientId),
          sql`${appointmentsTable.professionalId} IS NOT NULL`,
        ),
      )
      .orderBy(sql`${appointmentsTable.date} DESC`)
      .limit(50);
    const counts = new Map<number, number>();
    for (const r of recent) {
      if (r.professionalId == null) continue;
      counts.set(r.professionalId, (counts.get(r.professionalId) ?? 0) + 1);
    }
    let best: number | null = null;
    let max = 0;
    for (const [p, n] of counts) if (n > max) { max = n; best = p; }
    fallbackProf = best;
  }

  const newWeekDays = weekDays.length > 0 ? weekDays : inferred.weekDays;
  const newStartTime = startTime ?? inferred.startTime;
  const newProfId = professionalId ?? fallbackProf;

  if (newWeekDays.length === 0 || !newStartTime) {
    return { ok: false, reason: "inferência incompleta (sem dias/horário)", inferred };
  }
  if (!newProfId) {
    return { ok: false, reason: "sem profissional inferível", inferred };
  }

  if (!dryRun) {
    await db
      .update(treatmentPlanProceduresTable)
      .set({
        weekDays: JSON.stringify(newWeekDays),
        defaultStartTime: newStartTime,
        defaultProfessionalId: newProfId,
      })
      .where(eq(treatmentPlanProceduresTable.id, item.id));
  }
  return { ok: true, inferred };
}

interface CleanResult {
  appointmentsDeleted: number;
  invoicesDeleted: number;
  entriesDeleted: number;
  creditsDeleted: number;
}

/**
 * Limpa dados antigos do plano: appointments na janela, faturas pendentes,
 * journal entries vinculados, créditos de sessão gerados a partir de
 * appointments dentro da janela.
 */
async function cleanupPlan(
  plan: PlanRow,
  items: PlanItem[],
  startDate: string,
  endDate: string,
  dryRun: boolean,
): Promise<CleanResult> {
  const result: CleanResult = {
    appointmentsDeleted: 0,
    invoicesDeleted: 0,
    entriesDeleted: 0,
    creditsDeleted: 0,
  };

  const itemIds = items.map((i) => i.id);
  const procedureIds = Array.from(
    new Set(
      items
        .map((i) => i.procedureId ?? i.packageProcedureId)
        .filter((x): x is number => typeof x === "number"),
    ),
  );

  // 1) Faturas pendentes ligadas ao plano OU paciente+procedimento dentro da janela.
  const planLinkedInvoices = itemIds.length
    ? await db
        .select({ id: financialRecordsTable.id })
        .from(financialRecordsTable)
        .where(
          and(
            inArray(financialRecordsTable.treatmentPlanProcedureId, itemIds),
            inArray(financialRecordsTable.status, ["pendente", "vencido"]),
          ),
        )
    : [];

  const looseInvoices = procedureIds.length
    ? await db
        .select({ id: financialRecordsTable.id })
        .from(financialRecordsTable)
        .where(
          and(
            eq(financialRecordsTable.patientId, plan.patientId),
            inArray(financialRecordsTable.procedureId, procedureIds),
            inArray(financialRecordsTable.status, ["pendente", "vencido"]),
            inArray(financialRecordsTable.transactionType, [
              "faturaPlano",
              "faturaConsolidada",
              "pendenteFatura",
              "creditoAReceber",
            ]),
          ),
        )
    : [];

  const invoiceIds = Array.from(new Set([...planLinkedInvoices, ...looseInvoices].map((r) => r.id)));

  if (invoiceIds.length > 0) {
    if (!dryRun) {
      // Apaga journal entries (por id direto + sourceType polimórfico)
      const linked = await db
        .select({ id: financialRecordsTable.id, accountingEntryId: financialRecordsTable.accountingEntryId, recognizedEntryId: financialRecordsTable.recognizedEntryId })
        .from(financialRecordsTable)
        .where(inArray(financialRecordsTable.id, invoiceIds));
      const entryIds = linked.flatMap((r) => [r.accountingEntryId, r.recognizedEntryId]).filter((x): x is number => typeof x === "number");
      if (entryIds.length > 0) {
        const del = await db
          .delete(accountingJournalEntriesTable)
          .where(inArray(accountingJournalEntriesTable.id, entryIds))
          .returning({ id: accountingJournalEntriesTable.id });
        result.entriesDeleted += del.length;
      }
      const orph = await db
        .delete(accountingJournalEntriesTable)
        .where(
          and(
            eq(accountingJournalEntriesTable.sourceType, "financial_record"),
            inArray(accountingJournalEntriesTable.sourceId, invoiceIds),
          ),
        )
        .returning({ id: accountingJournalEntriesTable.id });
      result.entriesDeleted += orph.length;

      await db.delete(financialRecordsTable).where(inArray(financialRecordsTable.id, invoiceIds));
    }
    result.invoicesDeleted = invoiceIds.length;
  }

  // 2) Appointments dentro da janela: deleta apenas os "seguros" — sem
  //    evolução clínica, sem lançamento contábil, sem financial_record
  //    pago associado. Os realizados (concluido/compareceu/faltou) com
  //    histórico ficam preservados; o materializer fará UPDATE neles para
  //    vincular ao novo item/fatura. Os "agendado/confirmado" puros são
  //    apagados e regenerados.
  if (procedureIds.length > 0) {
    const safeApts = await db.execute(sql`
      SELECT a.id FROM appointments a
      WHERE a.patient_id = ${plan.patientId}
        AND a.procedure_id = ANY(${sql.raw(`ARRAY[${procedureIds.join(",")}]::int[]`)})
        AND a.date >= ${startDate}::date
        AND a.date < ${endDate}::date
        AND NOT EXISTS (SELECT 1 FROM evolutions e WHERE e.appointment_id = a.id)
        AND NOT EXISTS (SELECT 1 FROM accounting_journal_entries je WHERE je.appointment_id = a.id)
        AND NOT EXISTS (
          SELECT 1 FROM financial_records fr
          WHERE fr.appointment_id = a.id AND fr.status IN ('pago','parcialmenteAbatido','abatido')
        )
    `);
    const aptIds = (safeApts as any).rows.map((r: any) => Number(r.id));
    if (aptIds.length > 0) {
      if (!dryRun) {
        const credDel = await db
          .delete(sessionCreditsTable)
          .where(inArray(sessionCreditsTable.sourceAppointmentId, aptIds))
          .returning({ id: sessionCreditsTable.id });
        result.creditsDeleted = credDel.length;

        // Limpa financial_records pendentes restantes ligados a esses appointments.
        await db
          .delete(financialRecordsTable)
          .where(
            and(
              inArray(financialRecordsTable.appointmentId, aptIds),
              inArray(financialRecordsTable.status, ["pendente", "vencido"]),
            ),
          );

        await db.delete(appointmentsTable).where(inArray(appointmentsTable.id, aptIds));
      }
      result.appointmentsDeleted = aptIds.length;
    }
  }

  // 3) Reseta materializedAt
  if (!dryRun && plan.materializedAt) {
    await db
      .update(treatmentPlansTable)
      .set({ materializedAt: null })
      .where(eq(treatmentPlansTable.id, plan.id));
  }

  return result;
}

async function processPlan(plan: PlanRow, args: Args): Promise<{
  ok: boolean;
  msg: string;
  cleanup?: CleanResult;
  materialize?: { appointmentsCreated: number; invoicesCreated: number };
}> {
  const items = await loadItems(plan.id);
  if (items.length === 0) return { ok: false, msg: "plano sem itens" };

  const { durationMonths, startDate, changed } = await ensurePlanFields(plan, args.defaultDuration, args.dryRun);
  const endDate = addMonths(startDate, durationMonths);

  const monthlyItems = items.filter(
    (i) => i.packageType === "mensal" && Number(i.unitMonthlyPrice ?? 0) > 0,
  );
  if (monthlyItems.length === 0) return { ok: false, msg: "sem itens mensais" };

  const fieldNotes: string[] = [];
  for (const it of monthlyItems) {
    const r = await ensureItemFields(it, plan.patientId, args.dryRun);
    if (!r.ok) {
      return { ok: false, msg: `item #${it.id}: ${r.reason}` };
    }
    if (r.inferred && r.inferred.sourceCount > 0) {
      fieldNotes.push(
        `item #${it.id} inferido de ${r.inferred.sourceCount} appts → ${JSON.stringify(r.inferred.weekDays)} ${r.inferred.startTime} prof=${r.inferred.professionalId ?? "—"}`,
      );
    }
  }

  // Cleanup
  const cleanup = await cleanupPlan(plan, items, startDate, endDate, args.dryRun);

  // Materialize
  let mat: { appointmentsCreated: number; invoicesCreated: number } | undefined;
  if (!args.dryRun) {
    const res = await materializeTreatmentPlan(plan.id);
    mat = { appointmentsCreated: res.appointmentsCreated, invoicesCreated: res.invoicesCreated };
  }

  const parts: string[] = [];
  if (changed) parts.push(`fields[duration=${durationMonths},start=${startDate}]`);
  if (fieldNotes.length) parts.push(...fieldNotes);
  return {
    ok: true,
    msg: parts.join(" | ") || "OK",
    cleanup,
    materialize: mat,
  };
}

async function main() {
  const args = parseArgs();
  console.log(
    `\n[backfill] ${args.dryRun ? "(DRY RUN) " : ""}default-duration=${args.defaultDuration}` +
      (args.planId ? ` plan=${args.planId}` : "") +
      (args.patientId ? ` patient=${args.patientId}` : ""),
  );

  const plans = await findPlans(args);
  console.log(`[backfill] ${plans.length} plano(s) candidato(s).\n`);

  let okCount = 0,
    failCount = 0;
  let totalAppt = 0,
    totalInv = 0,
    totalDelAppt = 0,
    totalDelInv = 0;

  for (const plan of plans) {
    const tag = `plano #${plan.id} — ${plan.patientName} (paciente #${plan.patientId})`;
    try {
      const r = await processPlan(plan, args);
      if (r.ok) {
        okCount++;
        if (r.cleanup) {
          totalDelAppt += r.cleanup.appointmentsDeleted;
          totalDelInv += r.cleanup.invoicesDeleted;
        }
        if (r.materialize) {
          totalAppt += r.materialize.appointmentsCreated;
          totalInv += r.materialize.invoicesCreated;
        }
        console.log(
          `  ✓ ${tag} — wipe[appts=${r.cleanup?.appointmentsDeleted ?? 0},invs=${r.cleanup?.invoicesDeleted ?? 0},entries=${r.cleanup?.entriesDeleted ?? 0}]` +
            (r.materialize
              ? ` materialize[appts=${r.materialize.appointmentsCreated},invs=${r.materialize.invoicesCreated}]`
              : "") +
            (r.msg && r.msg !== "OK" ? `\n      ${r.msg}` : ""),
        );
      } else {
        failCount++;
        console.log(`  ✗ ${tag} — ${r.msg}`);
      }
    } catch (e) {
      failCount++;
      console.log(`  ✗ ${tag} — erro: ${(e as Error).message}`);
    }
  }

  console.log(
    `\n[backfill] ${args.dryRun ? "(DRY RUN) " : ""}Concluído: ` +
      `${okCount} ok, ${failCount} falha(s). ` +
      `Wipe: ${totalDelAppt} appts, ${totalDelInv} invs. ` +
      `Materialize: +${totalAppt} appts, +${totalInv} invs.\n`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("[backfill] ERRO FATAL:", e);
  process.exit(1);
});
