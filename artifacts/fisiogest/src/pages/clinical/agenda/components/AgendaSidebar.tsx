import { cn } from "@/lib/utils";
import { MiniCalendar } from "./MiniCalendar";
import { STATUS_FILTER_OPTIONS } from "../constants";

interface Props {
  currentDate: Date;
  miniCalMonth: Date;
  onMiniCalMonthChange: (d: Date) => void;
  onSelectDate: (d: Date) => void;
  weekDays: Date[];
  selectedStatuses: string[];
  onToggleStatus: (status: string) => void;
  onClearStatuses: () => void;
}

export function AgendaSidebar({
  currentDate,
  miniCalMonth,
  onMiniCalMonthChange,
  onSelectDate,
  weekDays,
  selectedStatuses,
  onToggleStatus,
  onClearStatuses,
}: Props) {
  const hasFilter = selectedStatuses.length > 0;

  return (
    <div className="hidden lg:flex flex-col gap-3 w-[188px] shrink-0">
      <MiniCalendar
        value={currentDate}
        month={miniCalMonth}
        onMonthChange={onMiniCalMonthChange}
        onSelectDate={onSelectDate}
        weekDays={weekDays}
      />

      {/* Status filter chips */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-2.5">
        <div className="flex items-center justify-between mb-1 px-0.5">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Filtrar</span>
          {hasFilter && (
            <button
              onClick={onClearStatuses}
              className="text-[10px] font-semibold text-slate-400 hover:text-slate-600 transition-colors"
            >
              Limpar
            </button>
          )}
        </div>
        <div className="flex flex-col gap-0.5">
          {STATUS_FILTER_OPTIONS.map(({ value, label, color }) => {
            const active = selectedStatuses.includes(value);
            return (
              <button
                key={value}
                onClick={() => onToggleStatus(value)}
                className={cn(
                  "flex items-center gap-1.5 w-full h-6 px-2 rounded-md text-[11px] font-medium transition-all duration-150 text-left",
                  active
                    ? "text-white"
                    : "text-slate-600 hover:bg-slate-50",
                )}
                style={active ? { backgroundColor: color } : undefined}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: active ? "rgba(255,255,255,0.7)" : color }}
                />
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
