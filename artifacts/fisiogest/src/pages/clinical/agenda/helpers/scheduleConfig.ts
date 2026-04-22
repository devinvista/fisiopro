import { getDay } from "date-fns";
import type { ScheduleOption } from "../types";
import { HOUR_START, HOUR_END, SLOT_HEIGHT } from "../constants";

const VALID_SLOT_DURATIONS = [15, 20, 30, 45, 60, 90];

export interface ScheduleConfig {
  effectiveSchedules: ScheduleOption[] | null;
  activeHourStart: number;
  activeHourEnd: number;
  slotDuration: number;
  slotsPerHour: number;
  slotPxHeight: number;
  activeTotalHours: number;
  hours: number[];
  workingDayNumbers: Set<number> | null;
}

/**
 * Deriva configuração ativa do calendário a partir das agendas habilitadas
 * e da agenda selecionada (filtro), determinando faixa horária visível,
 * granularidade do slot e dias úteis.
 */
export function computeScheduleConfig(
  schedules: ScheduleOption[],
  selectedScheduleId: number | null,
): ScheduleConfig {
  const activeSchedules = schedules.filter((s) => s.isActive);
  const selectedSchedule = selectedScheduleId
    ? schedules.find((s) => s.id === selectedScheduleId) ?? null
    : null;

  const effectiveSchedules = selectedSchedule
    ? [selectedSchedule]
    : activeSchedules.length > 0
      ? activeSchedules
      : null;

  const activeHourStart = effectiveSchedules
    ? Math.min(...effectiveSchedules.map((s) => parseInt(s.startTime.split(":")[0])))
    : HOUR_START;

  const activeHourEnd = effectiveSchedules
    ? Math.max(
        ...effectiveSchedules.map((s) => {
          const h = parseInt(s.endTime.split(":")[0]);
          const m = parseInt(s.endTime.split(":")[1]);
          return m > 0 ? h + 1 : h;
        }),
      )
    : HOUR_END;

  const activeSlotDuration = effectiveSchedules
    ? Math.min(...effectiveSchedules.map((s) => s.slotDurationMinutes))
    : 30;
  const slotDuration = VALID_SLOT_DURATIONS.includes(activeSlotDuration) ? activeSlotDuration : 30;
  const slotsPerHour = Math.round(60 / slotDuration);
  const slotPxHeight = SLOT_HEIGHT / slotsPerHour;

  const activeTotalHours = activeHourEnd - activeHourStart;
  const hours = Array.from({ length: activeTotalHours }).map((_, i) => activeHourStart + i);

  let workingDayNumbers: Set<number> | null = null;
  if (effectiveSchedules) {
    const set = new Set<number>();
    effectiveSchedules.forEach((s) => {
      s.workingDays
        .split(",")
        .map((d) => parseInt(d.trim(), 10))
        .filter((n) => !isNaN(n) && n >= 0 && n <= 6)
        .forEach((d) => set.add(d));
    });
    workingDayNumbers = set.size > 0 ? set : null;
  }

  return {
    effectiveSchedules,
    activeHourStart,
    activeHourEnd,
    slotDuration,
    slotsPerHour,
    slotPxHeight,
    activeTotalHours,
    hours,
    workingDayNumbers,
  };
}

export const isWorkingDay = (day: Date, workingDayNumbers: Set<number> | null): boolean =>
  workingDayNumbers === null || workingDayNumbers.has(getDay(day));
