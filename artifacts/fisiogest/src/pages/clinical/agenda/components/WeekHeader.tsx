import { format, getDay, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { ScheduleOption } from "../types";
import type { Appointment } from "@workspace/api-client-react";

interface Props {
  weekDays: Date[];
  daysCount: number;
  appointments: Appointment[];
  selectedScheduleId: number | null;
  activeSchedules: ScheduleOption[];
}

export function WeekHeader({
  weekDays,
  daysCount,
  appointments,
  selectedScheduleId,
  activeSchedules,
}: Props) {
  return (
    <div
      className="grid border-b border-slate-200 bg-slate-50/70"
      style={{
        gridTemplateColumns: `56px repeat(${daysCount}, minmax(96px, 1fr))`,
        minWidth: daysCount > 1 ? `${56 + daysCount * 96}px` : undefined,
      }}
    >
      <div className="border-r border-slate-200" />
      {weekDays.map((day, i) => {
        const dayStr = format(day, "yyyy-MM-dd");
        const dayAppts = appointments.filter((a) => a.date === dayStr);
        const today = isToday(day);
        const dayNum = getDay(day);
        const schedulesOnDay =
          !selectedScheduleId && activeSchedules.length >= 2
            ? activeSchedules.filter((s) =>
                s.workingDays
                  .split(",")
                  .map((d) => parseInt(d.trim(), 10))
                  .includes(dayNum),
              )
            : [];
        return (
          <div
            key={i}
            className={cn(
              "py-2 px-2 text-center border-r border-slate-200 last:border-r-0 min-w-0",
              today && "bg-primary/5",
            )}
            title={dayAppts.length > 0 ? `${dayAppts.length} consulta${dayAppts.length !== 1 ? "s" : ""}` : undefined}
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {format(day, "EEE", { locale: ptBR })}
            </p>
            <div className="flex items-center justify-center gap-1.5 mt-0.5">
              <span
                className={cn(
                  "min-w-7 h-7 px-1.5 rounded-full inline-flex items-center justify-center text-base font-bold transition-colors",
                  today ? "bg-primary text-white" : "text-slate-800",
                )}
              >
                {format(day, "d")}
              </span>
              {schedulesOnDay.length > 0 && (
                <div className="flex items-center gap-0.5">
                  {schedulesOnDay.map((s) => (
                    <span
                      key={s.id}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: s.color }}
                      title={s.name}
                    />
                  ))}
                </div>
              )}
              {dayAppts.length > 0 && (
                <span className="text-[10px] font-semibold text-slate-400 tabular-nums">
                  {dayAppts.length}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
