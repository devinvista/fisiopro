import {
  format,
  addDays,
  startOfWeek,
  isSameDay,
  isSameMonth,
  startOfMonth,
  endOfMonth,
  endOfWeek,
  addMonths,
  subMonths,
  isToday,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/utils/utils";

export function MiniCalendar({
  value,
  month,
  onMonthChange,
  onSelectDate,
  weekDays,
}: {
  value: Date;
  month: Date;
  onMonthChange: (d: Date) => void;
  onSelectDate: (d: Date) => void;
  weekDays: Date[];
}) {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days: Date[] = [];
  let d = calStart;
  while (d <= calEnd) {
    days.push(d);
    d = addDays(d, 1);
  }

  const dayHeaders = ["S", "T", "Q", "Q", "S", "S", "D"];

  const isInWeek = (day: Date) => weekDays.some((wd) => isSameDay(wd, day));

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-3">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-2">
        <button
          className="p-1 rounded hover:bg-slate-100 transition-colors"
          onClick={() => onMonthChange(subMonths(month, 1))}
        >
          <ChevronLeft className="w-3.5 h-3.5 text-slate-500" />
        </button>
        <span className="text-xs font-semibold text-slate-700 capitalize">
          {format(month, "MMMM yyyy", { locale: ptBR })}
        </span>
        <button
          className="p-1 rounded hover:bg-slate-100 transition-colors"
          onClick={() => onMonthChange(addMonths(month, 1))}
        >
          <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {dayHeaders.map((h, i) => (
          <div key={i} className="text-center text-[9px] font-bold text-slate-400 py-0.5">
            {h}
          </div>
        ))}
      </div>

      {/* Days */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((day, i) => {
          const sameMonth = isSameMonth(day, month);
          const today = isToday(day);
          const selected = isSameDay(day, value);
          const inWeek = isInWeek(day);

          return (
            <button
              key={i}
              className={cn(
                "h-6 w-full rounded text-[10px] font-medium transition-colors",
                !sameMonth && "text-slate-300",
                sameMonth && !today && !selected && "text-slate-600 hover:bg-slate-100",
                today && !selected && "text-primary font-bold",
                selected && "bg-primary text-white",
                inWeek && !selected && sameMonth && "bg-primary/10 text-primary"
              )}
              onClick={() => onSelectDate(day)}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}
