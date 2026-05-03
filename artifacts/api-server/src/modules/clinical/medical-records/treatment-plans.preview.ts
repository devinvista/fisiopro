/**
 * Preview de appointments do plano de tratamento.
 *
 * Função pura/read-only que enumera todas as consultas que seriam criadas
 * por `materializeTreatmentPlan` SEM persistir nada. Reutiliza os helpers
 * de enumeração da materialização para garantir que o preview e o resultado
 * real sejam idênticos (uma única fonte de verdade para datas/horários).
 *
 * Usos:
 *   - Snapshot público (`loadPublicPlanSnapshot`): paciente vê a agenda
 *     completa antes de assinar o contrato.
 *   - Endpoint autenticado `/preview-appointments`: editor do plano mostra
 *     o calendário em tempo real conforme a agenda é configurada.
 */
import { db } from "@workspace/db";
import {
  treatmentPlansTable,
  treatmentPlanProceduresTable,
  packagesTable,
  proceduresTable,
  usersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { resolveItemKind } from "./treatment-plans.acceptance.js";
import {
  parseWeekDays,
  parseStartTimesByDay,
  enumerateDates,
  enumerateFirstN,
  addMonths,
  monthFirstDay,
  lastDayOfMonth,
  addMinutesToTime,
  resolveStartTimeForDate,
} from "./treatment-plans.materialization.js";

export interface AppointmentPreviewRow {
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM */
  startTime: string;
  /** HH:MM */
  endTime: string;
  procedureName: string;
  /** Nome do profissional padrão do item, ou null se não definido. */
  professionalName: string | null;
  /** YYYY-MM-01 — primeiro dia do mês de competência (para agrupar na UI). */
  monthRef: string;
  /** ID do `treatment_plan_procedures` que originou esta consulta. */
  itemId: number;
  /** Tipo do item — útil para a UI separar mensal de pacote. */
  itemKind: "recorrenteMensal" | "pacoteSessoes" | "avulso";
}

export interface AppointmentPreviewResult {
  appointments: AppointmentPreviewRow[];
  /** Quantidade total de consultas (= appointments.length). */
  totalCount: number;
  /** Distintos meses cobertos pela enumeração. */
  monthsCovered: number;
  /**
   * Itens do plano que NÃO produziram consultas porque a agenda ainda não
   * foi configurada (sem dias da semana, sem horário, ou sem `scheduleId`
   * nos pacotes/avulsos). Útil para a UI explicar por que certas linhas
   * do plano não aparecem no calendário.
   */
  itemsWithoutSchedule: number[];
}

interface PlanItemForPreview {
  id: number;
  kind: string | null;
  procedureId: number | null;
  packageId: number | null;
  totalSessions: number | null;
  weekDays: string | null;
  defaultStartTime: string | null;
  startTimesByDay: string | null;
  defaultProfessionalId: number | null;
  scheduleId: number | null;
  packageType: string | null;
  packageProcedureId: number | null;
  procedureName: string | null;
  procedureDuration: number | null;
  professionalName: string | null;
}

/**
 * Enumera as consultas que serão criadas ao materializar o plano. Não
 * persiste nada — toda a lógica é pura e read-only (apenas SELECTs).
 *
 * Itens sem agenda configurada (recorrentes sem dias/horário, ou
 * pacotes/avulsos sem `scheduleId`) são silenciosamente ignorados na
 * lista de `appointments` mas reportados em `itemsWithoutSchedule`.
 */
export async function enumeratePlanAppointments(
  planId: number,
): Promise<AppointmentPreviewResult> {
  const [plan] = await db
    .select({
      id: treatmentPlansTable.id,
      startDate: treatmentPlansTable.startDate,
      durationMonths: treatmentPlansTable.durationMonths,
    })
    .from(treatmentPlansTable)
    .where(eq(treatmentPlansTable.id, planId))
    .limit(1);
  if (!plan || !plan.startDate) {
    return { appointments: [], totalCount: 0, monthsCovered: 0, itemsWithoutSchedule: [] };
  }
  const startDate = plan.startDate;
  const durationMonths = plan.durationMonths ?? 12;
  const endDate = addMonths(startDate, durationMonths);

  const items: PlanItemForPreview[] = await db
    .select({
      id: treatmentPlanProceduresTable.id,
      kind: treatmentPlanProceduresTable.kind,
      procedureId: treatmentPlanProceduresTable.procedureId,
      packageId: treatmentPlanProceduresTable.packageId,
      totalSessions: treatmentPlanProceduresTable.totalSessions,
      weekDays: treatmentPlanProceduresTable.weekDays,
      defaultStartTime: treatmentPlanProceduresTable.defaultStartTime,
      startTimesByDay: treatmentPlanProceduresTable.startTimesByDay,
      defaultProfessionalId: treatmentPlanProceduresTable.defaultProfessionalId,
      scheduleId: treatmentPlanProceduresTable.scheduleId,
      packageType: packagesTable.packageType,
      packageProcedureId: packagesTable.procedureId,
      procedureName: proceduresTable.name,
      procedureDuration: proceduresTable.durationMinutes,
      professionalName: usersTable.name,
    })
    .from(treatmentPlanProceduresTable)
    .leftJoin(packagesTable, eq(packagesTable.id, treatmentPlanProceduresTable.packageId))
    .leftJoin(
      proceduresTable,
      eq(
        proceduresTable.id,
        // Mesma resolução usada na materialização: pacote ganha do item.
        // (drizzle não tem COALESCE inline simples num join — usamos a chave
        // do pacote quando disponível; quando não, recorremos ao join via
        // procedureId do item abaixo via fallback no JS.)
        // Para esta consulta usamos o procedureId do item; o nome de pacotes
        // sem item-procedure será resolvido via packageProcedureId no map.
        treatmentPlanProceduresTable.procedureId,
      ),
    )
    .leftJoin(usersTable, eq(usersTable.id, treatmentPlanProceduresTable.defaultProfessionalId))
    .where(eq(treatmentPlanProceduresTable.treatmentPlanId, planId));

  // Para itens onde o procedureId vem do pacote (e o item não tem procedureId
  // próprio), o join acima retorna procedureName=null. Resolvemos numa 2ª
  // query consolidada.
  const missingProcedureIds = Array.from(
    new Set(
      items
        .filter((it) => !it.procedureName && it.packageProcedureId)
        .map((it) => it.packageProcedureId as number),
    ),
  );
  const procedureNameById = new Map<number, { name: string; duration: number | null }>();
  if (missingProcedureIds.length > 0) {
    const rows = await db
      .select({
        id: proceduresTable.id,
        name: proceduresTable.name,
        duration: proceduresTable.durationMinutes,
      })
      .from(proceduresTable);
    for (const r of rows) {
      if (missingProcedureIds.includes(r.id)) {
        procedureNameById.set(r.id, { name: r.name, duration: r.duration ?? null });
      }
    }
  }

  const appointments: AppointmentPreviewRow[] = [];
  const itemsWithoutSchedule: number[] = [];
  const monthsSeen = new Set<string>();

  for (const item of items) {
    const kind = resolveItemKind({
      kind: item.kind,
      packageId: item.packageId,
      packageType: item.packageType,
    });
    const procedureId = item.packageProcedureId ?? item.procedureId;
    if (!procedureId) continue;

    const procedureName =
      item.procedureName ??
      procedureNameById.get(procedureId)?.name ??
      "Procedimento";
    const duration =
      item.procedureDuration ??
      procedureNameById.get(procedureId)?.duration ??
      60;

    const wd = parseWeekDays(item.weekDays);
    const stMap = parseStartTimesByDay(item.startTimesByDay);
    const hasAnyStartTime =
      !!item.defaultStartTime || Object.keys(stMap).length > 0;

    if (kind === "recorrenteMensal") {
      // Mensal: enumera todas as datas dentro de cada mês de competência.
      // Sem dias/horário → item ainda não configurado.
      if (wd.length === 0 || !hasAnyStartTime) {
        itemsWithoutSchedule.push(item.id);
        continue;
      }

      for (let m = 0; m < durationMonths; m++) {
        const monthStart = addMonths(monthFirstDay(startDate), m);
        const [my, mm] = monthStart.split("-").map(Number);
        const lastDay = lastDayOfMonth(my, mm);
        const monthEnd = `${my}-${String(mm).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

        const winStart = m === 0 ? startDate : monthStart;
        const winEnd =
          m === durationMonths - 1
            ? (endDate < monthEnd ? endDate : monthEnd)
            : monthEnd;
        // enumerateDates é exclusivo no fim — soma 1 dia.
        const winEndExclusive = (() => {
          const [y, mo, d] = winEnd.split("-").map(Number);
          const dt = new Date(Date.UTC(y, mo - 1, d + 1));
          return dt.toISOString().slice(0, 10);
        })();
        const dates = enumerateDates(winStart, winEndExclusive, wd);
        for (const date of dates) {
          const startTime = resolveStartTimeForDate(date, stMap, item.defaultStartTime);
          if (!startTime) continue; // sem horário resolvível para este dia
          appointments.push({
            date,
            startTime,
            endTime: addMinutesToTime(startTime, duration),
            procedureName,
            professionalName: item.professionalName ?? null,
            monthRef: monthStart,
            itemId: item.id,
            itemKind: kind,
          });
          monthsSeen.add(monthStart);
        }
      }
      continue;
    }

    // pacoteSessoes / avulso: requer schedule + dias + horário.
    if (wd.length === 0 || !hasAnyStartTime || !item.scheduleId) {
      itemsWithoutSchedule.push(item.id);
      continue;
    }
    const cap =
      kind === "pacoteSessoes"
        ? Math.max(0, item.totalSessions ?? 0)
        : Math.max(1, item.totalSessions ?? 1);
    if (cap === 0) continue;

    // enumerateFirstN é exclusivo no fim — endDate vem do addMonths que já
    // representa o dia seguinte ao último útil; passamos direto.
    const dates = enumerateFirstN(startDate, endDate, wd, cap);
    for (const date of dates) {
      const startTime = resolveStartTimeForDate(date, stMap, item.defaultStartTime);
      if (!startTime) continue;
      const monthRef = monthFirstDay(date);
      appointments.push({
        date,
        startTime,
        endTime: addMinutesToTime(startTime, duration),
        procedureName,
        professionalName: item.professionalName ?? null,
        monthRef,
        itemId: item.id,
        itemKind: kind,
      });
      monthsSeen.add(monthRef);
    }
  }

  // Ordena por data + horário para a UI consumir direto.
  appointments.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.startTime < b.startTime ? -1 : 1;
  });

  return {
    appointments,
    totalCount: appointments.length,
    monthsCovered: monthsSeen.size,
    itemsWithoutSchedule,
  };
}
