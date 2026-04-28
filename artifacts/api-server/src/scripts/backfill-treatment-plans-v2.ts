/**
 * backfill-treatment-plans-v2.ts
 *
 * Migra todos os planos de tratamento ATIVOS com itens de pacote mensal para o
 * novo modelo "plano de tratamento como única fonte de receita":
 *
 *   1. Infere `weekDays` a partir dos appointments concluídos passados do
 *      paciente para o mesmo procedimento.
 *   2. Infere `defaultStartTime`, `sessionDurationMinutes` e
 *      `defaultProfessionalId` a partir dos appointments mais recentes (e
 *      cai para o `schedules` ativo da clínica como fallback).
 *   3. Define `durationMonths = 12` (default acordado) e `endDate = startDate + 12m`.
 *   4. Apaga appointments futuros agendados e faturas pendentes não pagas
 *      ligadas ao plano (via dematerializeTreatmentPlan).
 *   5. Materializa o plano (gera consultas + faturas mensais).
 *   6. Cancela `patient_subscriptions` ligadas ao mesmo paciente+procedimento.
 *
 * Execução:
 *
 *   pnpm --filter @workspace/api-server exec tsx src/scripts/backfill-treatment-plans-v2.ts
 *
 * Por padrão executa em modo "real" (não dry-run). Use `--dry-run` para apenas
 * imprimir o plano de execução sem aplicar mudanças.
 */
import { db } from "@workspace/db";
import {
  treatmentPlansTable,
  treatmentPlanProceduresTable,
  packagesTable,
  appointmentsTable,
  patientsTable,
  patientSubscriptionsTable,
  schedulesTable,
  financialRecordsTable,
  accountingJournalEntriesTable,
} from "@workspace/db";
import { and, eq, inArray, sql, isNotNull, isNull, gte } from "drizzle-orm";
import {
  materializeTreatmentPlan,
  dematerializeTreatmentPlan,
} from "../modules/clinical/medical-records/treatment-plans.materialization.js";

// SAFETY: por padrão é DRY-RUN. Para aplicar é obrigatório passar `--apply`.
// O flag legado `--dry-run` continua funcionando como no-op (default já é dry).
const APPLY = process.argv.includes("--apply");
if (APPLY && process.argv.includes("--dry-run")) {
  console.error("ERRO: --apply e --dry-run são mutuamente exclusivos.");
  process.exit(2);
}
const DRY_RUN = !APPLY;
if (DRY_RUN) {
  console.log("[backfill-tp-v2] >>> DRY-RUN (default). Use --apply para gravar mudanças. <<<");
} else {
  console.log("[backfill-tp-v2] >>> APLICANDO MUDANÇAS no banco de dados! <<<");
}
const DEFAULT_DURATION_MONTHS = 12;
const ONLY_PLAN_IDS = (() => {
  const idx = process.argv.indexOf("--only");
  if (idx === -1 || idx + 1 >= process.argv.length) return null;
  return new Set(
    process.argv[idx + 1]
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n)),
  );
})();

process.on("unhandledRejection", (err) => {
  console.error("[backfill-tp-v2] unhandled rejection:", err);
  process.exit(3);
});
process.on("uncaughtException", (err) => {
  console.error("[backfill-tp-v2] uncaught exception:", err);
  process.exit(4);
});
const WEEK_DAY_NAMES = [
  "sunday", "monday", "tuesday", "wednesday",
  "thursday", "friday", "saturday",
] as const;

interface PlanRow {
  planId: number;
  patientId: number;
  startDate: string | null;
  durationMonths: number | null;
  materializedAt: Date | null;
  clinicId: number | null;
}

async function findActivePlansWithMensalItems(): Promise<PlanRow[]> {
  const rows = await db
    .select({
      planId: treatmentPlansTable.id,
      patientId: treatmentPlansTable.patientId,
      startDate: treatmentPlansTable.startDate,
      durationMonths: treatmentPlansTable.durationMonths,
      materializedAt: treatmentPlansTable.materializedAt,
      clinicId: patientsTable.clinicId,
    })
    .from(treatmentPlansTable)
    .innerJoin(patientsTable, eq(treatmentPlansTable.patientId, patientsTable.id))
    .innerJoin(
      treatmentPlanProceduresTable,
      eq(treatmentPlanProceduresTable.treatmentPlanId, treatmentPlansTable.id),
    )
    .innerJoin(packagesTable, eq(treatmentPlanProceduresTable.packageId, packagesTable.id))
    .where(
      and(
        eq(treatmentPlansTable.status, "ativo"),
        eq(packagesTable.packageType, "mensal"),
      ),
    )
    .groupBy(
      treatmentPlansTable.id,
      treatmentPlansTable.patientId,
      treatmentPlansTable.startDate,
      treatmentPlansTable.durationMonths,
      treatmentPlansTable.materializedAt,
      patientsTable.clinicId,
    );
  return rows;
}

interface MensalItem {
  id: number;
  packageId: number;
  procedureId: number; // do package
  weekDays: string | null;
  defaultStartTime: string | null;
  sessionDurationMinutes: number | null;
  defaultProfessionalId: number | null;
}

async function loadMensalItems(planId: number): Promise<MensalItem[]> {
  const rows = await db
    .select({
      id: treatmentPlanProceduresTable.id,
      packageId: treatmentPlanProceduresTable.packageId,
      procedureId: packagesTable.procedureId,
      weekDays: treatmentPlanProceduresTable.weekDays,
      defaultStartTime: treatmentPlanProceduresTable.defaultStartTime,
      sessionDurationMinutes: treatmentPlanProceduresTable.sessionDurationMinutes,
      defaultProfessionalId: treatmentPlanProceduresTable.defaultProfessionalId,
      packageType: packagesTable.packageType,
    })
    .from(treatmentPlanProceduresTable)
    .innerJoin(packagesTable, eq(treatmentPlanProceduresTable.packageId, packagesTable.id))
    .where(
      and(
        eq(treatmentPlanProceduresTable.treatmentPlanId, planId),
        eq(packagesTable.packageType, "mensal"),
      ),
    );
  return rows.map((r) => ({
    id: r.id,
    packageId: r.packageId!,
    procedureId: r.procedureId,
    weekDays: r.weekDays,
    defaultStartTime: r.defaultStartTime,
    sessionDurationMinutes: r.sessionDurationMinutes,
    defaultProfessionalId: r.defaultProfessionalId,
  }));
}

interface InferredAgenda {
  weekDays: string[];
  startTime: string | null;
  durationMinutes: number | null;
  professionalId: number | null;
}

async function inferAgenda(
  patientId: number,
  procedureId: number,
  clinicId: number | null,
): Promise<InferredAgenda> {
  const past = await db
    .select({
      date: appointmentsTable.date,
      startTime: appointmentsTable.startTime,
      endTime: appointmentsTable.endTime,
      professionalId: appointmentsTable.professionalId,
      status: appointmentsTable.status,
    })
    .from(appointmentsTable)
    .where(
      and(
        eq(appointmentsTable.patientId, patientId),
        eq(appointmentsTable.procedureId, procedureId),
        inArray(appointmentsTable.status, ["concluido", "presenca", "agendado", "faltou"]),
      ),
    )
    .orderBy(sql`${appointmentsTable.date} DESC`)
    .limit(40);

  const weekDayCount: Record<string, number> = {};
  const startTimeCount: Record<string, number> = {};
  const profIdCount: Record<number, number> = {};
  let durationSum = 0;
  let durationN = 0;

  function timeToMinutes(t: string): number | null {
    const [h, m] = t.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  }

  for (const a of past) {
    // appointments.date é DATE no formato "YYYY-MM-DD" (ex: "2025-04-21").
    if (!a.date) continue;
    const dateStr = String(a.date);
    const [y, mo, d] = dateStr.split("-").map(Number);
    if (!y || !mo || !d) continue;
    const dt = new Date(Date.UTC(y, mo - 1, d));
    const wd = WEEK_DAY_NAMES[dt.getUTCDay()];
    if (wd) weekDayCount[wd] = (weekDayCount[wd] ?? 0) + 1;

    if (a.startTime) {
      // startTime é texto tipo "18:00".
      const tk = a.startTime.slice(0, 5);
      startTimeCount[tk] = (startTimeCount[tk] ?? 0) + 1;
    }

    if (a.professionalId != null) {
      profIdCount[a.professionalId] = (profIdCount[a.professionalId] ?? 0) + 1;
    }
    if (a.startTime && a.endTime) {
      const sm = timeToMinutes(a.startTime);
      const em = timeToMinutes(a.endTime);
      if (sm != null && em != null && em > sm && em - sm < 6 * 60) {
        durationSum += em - sm;
        durationN += 1;
      }
    }
  }

  // Top dias da semana: pega todos com freq >= 1; se nenhum, fallback à agenda da clínica.
  const weekDays = Object.entries(weekDayCount)
    .sort((a, b) => b[1] - a[1])
    .filter(([, n]) => n >= 1)
    .map(([d]) => d);

  let startTime: string | null = null;
  if (Object.keys(startTimeCount).length > 0) {
    startTime = Object.entries(startTimeCount).sort((a, b) => b[1] - a[1])[0][0];
  }

  let professionalId: number | null = null;
  if (Object.keys(profIdCount).length > 0) {
    professionalId = Number(
      Object.entries(profIdCount).sort((a, b) => b[1] - a[1])[0][0],
    );
  }

  let durationMinutes: number | null = null;
  if (durationN > 0) durationMinutes = Math.round(durationSum / durationN / 5) * 5;

  // Fallback: agenda ativa da clínica.
  if ((weekDays.length === 0 || !startTime) && clinicId != null) {
    const [sched] = await db
      .select()
      .from(schedulesTable)
      .where(and(eq(schedulesTable.clinicId, clinicId), eq(schedulesTable.isActive, true)))
      .limit(1);
    if (sched) {
      if (weekDays.length === 0) {
        // workingDays é "1,2,3,4,5" (1=segunda) — converter.
        const idx = sched.workingDays.split(",").map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n));
        // Já está 0=domingo, 1=segunda no esquema usado pelo materialization.
        for (const i of idx) if (WEEK_DAY_NAMES[i]) weekDays.push(WEEK_DAY_NAMES[i]);
      }
      if (!startTime) startTime = sched.startTime;
      if (!durationMinutes) durationMinutes = sched.slotDurationMinutes;
    }
  }

  if (!durationMinutes) durationMinutes = 60;

  return { weekDays, startTime, durationMinutes, professionalId };
}

async function ensurePlanFields(
  plan: PlanRow,
): Promise<{ updated: boolean; durationMonths: number; startDate: string }> {
  // Para evitar colisão com appointments já realizados (concluido/presenca/faltou)
  // em datas/horários passados, sempre materializamos a partir de hoje.
  const today = new Date().toISOString().slice(0, 10);
  const originalStart = plan.startDate ?? today;
  const startDate = originalStart < today ? today : originalStart;
  const durationMonths = plan.durationMonths ?? DEFAULT_DURATION_MONTHS;
  const endDate = (() => {
    const [y, m, d] = startDate.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1 + durationMonths, d));
    return dt.toISOString().slice(0, 10);
  })();

  const updates: Record<string, any> = {};
  if (plan.startDate == null) updates.startDate = startDate;
  if (plan.durationMonths == null) updates.durationMonths = durationMonths;
  updates.endDate = endDate;

  if (!DRY_RUN && Object.keys(updates).length > 0) {
    await db
      .update(treatmentPlansTable)
      .set(updates)
      .where(eq(treatmentPlansTable.id, plan.planId));
  }

  return { updated: Object.keys(updates).length > 0, durationMonths, startDate };
}

async function ensureItemAgenda(
  item: MensalItem,
  patientId: number,
  clinicId: number | null,
): Promise<{ ok: boolean; reason?: string; agenda?: InferredAgenda }> {
  const hasWeekDays =
    item.weekDays != null &&
    item.weekDays !== "" &&
    item.weekDays !== "[]";
  const hasStartTime = item.defaultStartTime != null && item.defaultStartTime !== "";
  if (hasWeekDays && hasStartTime && item.sessionDurationMinutes && item.defaultProfessionalId) {
    return { ok: true };
  }

  const agenda = await inferAgenda(patientId, item.procedureId, clinicId);
  if (agenda.weekDays.length === 0) {
    return { ok: false, reason: "sem_weekdays_inferiveis", agenda };
  }
  if (!agenda.startTime) {
    return { ok: false, reason: "sem_horario_inferivel", agenda };
  }

  const updates: Record<string, any> = {};
  if (!hasWeekDays) updates.weekDays = JSON.stringify(agenda.weekDays);
  if (!hasStartTime) updates.defaultStartTime = agenda.startTime;
  if (!item.sessionDurationMinutes) updates.sessionDurationMinutes = agenda.durationMinutes;
  if (!item.defaultProfessionalId && agenda.professionalId) {
    updates.defaultProfessionalId = agenda.professionalId;
  }

  if (!DRY_RUN && Object.keys(updates).length > 0) {
    await db
      .update(treatmentPlanProceduresTable)
      .set(updates)
      .where(eq(treatmentPlanProceduresTable.id, item.id));
  }
  return { ok: true, agenda };
}

async function cancelLinkedSubscriptions(
  patientId: number,
  procedureIds: number[],
): Promise<number> {
  if (procedureIds.length === 0) return 0;
  if (DRY_RUN) {
    const rows = await db
      .select({ id: patientSubscriptionsTable.id })
      .from(patientSubscriptionsTable)
      .where(
        and(
          eq(patientSubscriptionsTable.patientId, patientId),
          inArray(patientSubscriptionsTable.procedureId, procedureIds),
          inArray(patientSubscriptionsTable.status, ["ativa", "pendente"]),
        ),
      );
    return rows.length;
  }
  const result = await db
    .update(patientSubscriptionsTable)
    .set({
      status: "cancelada",
      cancelledAt: new Date(),
      notes: sql`COALESCE(${patientSubscriptionsTable.notes}, '') || E'\n[backfill v2] cancelada em favor do plano de tratamento materializado.'`,
    })
    .where(
      and(
        eq(patientSubscriptionsTable.patientId, patientId),
        inArray(patientSubscriptionsTable.procedureId, procedureIds),
        inArray(patientSubscriptionsTable.status, ["ativa", "pendente"]),
      ),
    )
    .returning({ id: patientSubscriptionsTable.id });
  return result.length;
}

/**
 * Apaga appointments futuros do regime antigo (status=`agendado`,
 * `treatment_plan_procedure_id IS NULL`) e faturas pendentes de
 * subscription/avulso para os procedimentos do plano. Isso libera os slots
 * antes da materialização e zera duplicidade financeira.
 */
async function cleanupOldSchedulingForPlan(
  patientId: number,
  procedureIds: number[],
  fromDate: string,
): Promise<{ apptsDeleted: number; recordsDeleted: number }> {
  if (procedureIds.length === 0) return { apptsDeleted: 0, recordsDeleted: 0 };

  if (DRY_RUN) {
    const a = await db
      .select({ id: appointmentsTable.id })
      .from(appointmentsTable)
      .where(
        and(
          eq(appointmentsTable.patientId, patientId),
          inArray(appointmentsTable.procedureId, procedureIds),
          eq(appointmentsTable.status, "agendado"),
          isNull(appointmentsTable.treatmentPlanProcedureId),
          gte(appointmentsTable.date, fromDate),
        ),
      );
    const r = await db
      .select({ id: financialRecordsTable.id })
      .from(financialRecordsTable)
      .where(
        and(
          eq(financialRecordsTable.patientId, patientId),
          inArray(financialRecordsTable.procedureId, procedureIds),
          eq(financialRecordsTable.status, "pendente"),
          isNull(financialRecordsTable.treatmentPlanProcedureId),
        ),
      );
    return { apptsDeleted: a.length, recordsDeleted: r.length };
  }

  let apptsDeleted = 0;
  let recordsDeleted = 0;

  await db.transaction(async (tx) => {
    const appts = await tx
      .select({ id: appointmentsTable.id })
      .from(appointmentsTable)
      .where(
        and(
          eq(appointmentsTable.patientId, patientId),
          inArray(appointmentsTable.procedureId, procedureIds),
          eq(appointmentsTable.status, "agendado"),
          isNull(appointmentsTable.treatmentPlanProcedureId),
          gte(appointmentsTable.date, fromDate),
        ),
      );
    if (appts.length > 0) {
      await tx
        .delete(appointmentsTable)
        .where(inArray(appointmentsTable.id, appts.map((a) => a.id)));
      apptsDeleted = appts.length;
    }

    const records = await tx
      .select({ id: financialRecordsTable.id })
      .from(financialRecordsTable)
      .where(
        and(
          eq(financialRecordsTable.patientId, patientId),
          inArray(financialRecordsTable.procedureId, procedureIds),
          eq(financialRecordsTable.status, "pendente"),
          isNull(financialRecordsTable.treatmentPlanProcedureId),
        ),
      );
    if (records.length > 0) {
      const ids = records.map((r) => r.id);
      await tx
        .delete(accountingJournalEntriesTable)
        .where(
          and(
            eq(accountingJournalEntriesTable.sourceType, "financial_record"),
            inArray(accountingJournalEntriesTable.sourceId, ids),
          ),
        );
      await tx
        .delete(financialRecordsTable)
        .where(inArray(financialRecordsTable.id, ids));
      recordsDeleted = ids.length;
    }
  });

  return { apptsDeleted, recordsDeleted };
}

async function backfillOnePlan(plan: PlanRow): Promise<{
  planId: number;
  ok: boolean;
  appointmentsCreated?: number;
  invoicesCreated?: number;
  subscriptionsCancelled?: number;
  error?: string;
}> {
  process.stdout.write("[ensureFields] ");
  const { durationMonths, startDate } = await ensurePlanFields(plan);

  process.stdout.write("[loadItems] ");
  const items = await loadMensalItems(plan.planId);
  if (items.length === 0) {
    return { planId: plan.planId, ok: false, error: "sem_itens_mensais" };
  }

  process.stdout.write(`[ensureAgenda x${items.length}] `);
  for (const it of items) {
    const r = await ensureItemAgenda(it, plan.patientId, plan.clinicId);
    if (!r.ok) {
      return {
        planId: plan.planId,
        ok: false,
        error: `item ${it.id}: ${r.reason}`,
      };
    }
  }

  process.stdout.write("[cancelSubs] ");
  const procedureIds = [...new Set(items.map((i) => i.procedureId))];
  const subsCancelled = await cancelLinkedSubscriptions(plan.patientId, procedureIds);

  if (DRY_RUN) {
    return {
      planId: plan.planId,
      ok: true,
      appointmentsCreated: 0,
      invoicesCreated: 0,
      subscriptionsCancelled: subsCancelled,
    };
  }

  if (plan.materializedAt) {
    process.stdout.write("[dematerialize] ");
    await dematerializeTreatmentPlan(plan.planId);
  } else {
    process.stdout.write("[dematerialize-safe] ");
    try {
      await dematerializeTreatmentPlan(plan.planId);
    } catch {
      // ignora se nada a remover
    }
  }

  process.stdout.write("[cleanupOldScheduling] ");
  const cleanup = await cleanupOldSchedulingForPlan(
    plan.patientId,
    procedureIds,
    startDate,
  );

  process.stdout.write(`[materialize startDate=${startDate} months=${durationMonths}] `);
  const result = await materializeTreatmentPlan(plan.planId, {
    startDate,
    durationMonths,
    force: true,
  });

  return {
    planId: plan.planId,
    ok: true,
    appointmentsCreated: result.appointmentsCreated,
    invoicesCreated: result.invoicesCreated,
    subscriptionsCancelled: subsCancelled,
  };
}

async function main() {
  console.log(`[backfill-tp-v2] modo: ${DRY_RUN ? "DRY-RUN" : "EXECUÇÃO REAL"}`);
  let plans = await findActivePlansWithMensalItems();
  if (ONLY_PLAN_IDS) {
    plans = plans.filter((p) => ONLY_PLAN_IDS.has(p.planId));
    console.log(`[backfill-tp-v2] filtro --only ativo: ${[...ONLY_PLAN_IDS].join(",")}`);
  }
  console.log(`[backfill-tp-v2] encontrados ${plans.length} plano(s) ativo(s) com pacote mensal`);

  let okCount = 0;
  let failCount = 0;
  let apptsTotal = 0;
  let invoicesTotal = 0;
  let subsTotal = 0;

  for (const plan of plans) {
    process.stdout.write(`  → plano #${plan.planId} (paciente ${plan.patientId}): `);
    try {
      const r = await backfillOnePlan(plan);
      if (r.ok) {
        okCount += 1;
        apptsTotal += r.appointmentsCreated ?? 0;
        invoicesTotal += r.invoicesCreated ?? 0;
        subsTotal += r.subscriptionsCancelled ?? 0;
        console.log(
          `OK — ${r.appointmentsCreated ?? 0} consultas, ${r.invoicesCreated ?? 0} faturas, ${r.subscriptionsCancelled ?? 0} subs canceladas`,
        );
      } else {
        failCount += 1;
        console.log(`SKIP — ${r.error}`);
      }
    } catch (err: any) {
      failCount += 1;
      console.log(`ERRO — ${err.message}`);
    }
  }

  console.log("");
  console.log(`[backfill-tp-v2] resumo:`);
  console.log(`  planos processados com sucesso: ${okCount}`);
  console.log(`  planos pulados / com erro:      ${failCount}`);
  console.log(`  total de consultas geradas:     ${apptsTotal}`);
  console.log(`  total de faturas mensais:       ${invoicesTotal}`);
  console.log(`  assinaturas canceladas:         ${subsTotal}`);

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[backfill-tp-v2] erro fatal:", err);
  process.exit(2);
});
