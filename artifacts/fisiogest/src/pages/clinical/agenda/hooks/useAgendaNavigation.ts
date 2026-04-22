import { useMemo, useState } from "react";
import {
  format,
  addDays,
  addWeeks,
  subWeeks,
  startOfWeek,
  isSameMonth,
  startOfMonth,
  endOfMonth,
  endOfWeek,
  addMonths,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import type { ViewMode } from "../types";
import { isWorkingDay } from "../helpers/scheduleConfig";

interface Args {
  workingDayNumbers: Set<number> | null;
}

export function useAgendaNavigation({ workingDayNumbers }: Args) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<ViewMode>(() =>
    typeof window !== "undefined" && window.innerWidth < 768 ? "day" : "fullweek",
  );
  const [miniCalMonth, setMiniCalMonth] = useState(new Date());

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const allWeekDays = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

  const weekDays =
    view === "day"
      ? [currentDate]
      : workingDayNumbers
        ? allWeekDays.filter((day) => isWorkingDay(day, workingDayNumbers))
        : allWeekDays;
  const daysCount = weekDays.length;

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);

  const startDate =
    view === "month"
      ? format(startOfWeek(monthStart, { weekStartsOn: 1 }), "yyyy-MM-dd")
      : view === "day"
        ? format(currentDate, "yyyy-MM-dd")
        : format(allWeekDays[0], "yyyy-MM-dd");
  const endDate =
    view === "month"
      ? format(endOfWeek(monthEnd, { weekStartsOn: 1 }), "yyyy-MM-dd")
      : view === "day"
        ? format(currentDate, "yyyy-MM-dd")
        : format(allWeekDays[6], "yyyy-MM-dd");

  const weekLabel = useMemo(() => {
    if (view === "month") return format(currentDate, "MMMM 'de' yyyy", { locale: ptBR });
    if (view === "day")
      return format(currentDate, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
    const s = weekDays[0];
    const e = weekDays[daysCount - 1];
    if (isSameMonth(s, e)) {
      return `${format(s, "d")}–${format(e, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}`;
    }
    return `${format(s, "d MMM", { locale: ptBR })} – ${format(e, "d MMM yyyy", { locale: ptBR })}`;
  }, [weekDays, view, currentDate, daysCount]);

  const goToday = () => {
    setCurrentDate(new Date());
    setMiniCalMonth(new Date());
  };
  const goPrev = () => {
    const next =
      view === "day"
        ? addDays(currentDate, -1)
        : view === "month"
          ? subMonths(currentDate, 1)
          : subWeeks(currentDate, 1);
    setCurrentDate(next);
    setMiniCalMonth(next);
  };
  const goNext = () => {
    const next =
      view === "day"
        ? addDays(currentDate, 1)
        : view === "month"
          ? addMonths(currentDate, 1)
          : addWeeks(currentDate, 1);
    setCurrentDate(next);
    setMiniCalMonth(next);
  };

  return {
    currentDate,
    setCurrentDate,
    view,
    setView,
    miniCalMonth,
    setMiniCalMonth,
    weekDays,
    daysCount,
    startDate,
    endDate,
    weekLabel,
    goToday,
    goPrev,
    goNext,
  };
}
