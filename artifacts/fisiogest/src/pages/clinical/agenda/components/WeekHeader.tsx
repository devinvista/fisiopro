import { format, isToday } from "date-fns";
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
}: Props) {
  return (
    <div
      className="grid border-b border-slate-100 bg-white"
      style={{
        gridTemplateColumns: `52px repeat(${daysCount}, minmax(96px, 1fr))`,
        minWidth: daysCount > 1 ? `${52 + daysCount * 96}px` : undefined,
      }}
    >
      <div className="border-r border-slate-100" />
      {weekDays.map((day, i) => {
        const today = isToday(day);
        return (
          <div
            key={i}
            className={cn(
              "py-2 px-1 text-center border-r border-slate-100 last:border-r-0 flex flex-col items-center justify-center gap-0.5",
              today && "bg-primary/[0.03]",
            )}
          >
            <span className={cn(
              "text-[10px] font-bold uppercase tracking-wider leading-none",
              today ? "text-primary" : "text-slate-400",
            )}>
              {format(day, "EEE", { locale: ptBR })}
            </span>
            <span className={cn(
              "text-sm font-bold tabular-nums w-7 h-7 rounded-full inline-flex items-center justify-center shrink-0",
              today
                ? "bg-primary text-white shadow-sm shadow-primary/30"
                : "text-slate-700",
            )}>
              {format(day, "d")}
            </span>
          </div>
        );
      })}
    </div>
  );
}
