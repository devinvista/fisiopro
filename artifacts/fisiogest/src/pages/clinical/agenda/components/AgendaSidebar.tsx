import { MiniCalendar } from "./MiniCalendar";
import { STATUS_CONFIG } from "../constants";
import type { ScheduleOption } from "../types";

interface Props {
  currentDate: Date;
  miniCalMonth: Date;
  onMiniCalMonthChange: (d: Date) => void;
  onSelectDate: (d: Date) => void;
  weekDays: Date[];
  activeSchedules: ScheduleOption[];
}

export function AgendaSidebar({
  currentDate,
  miniCalMonth,
  onMiniCalMonthChange,
  onSelectDate,
  weekDays,
  activeSchedules,
}: Props) {
  return (
    <div className="hidden lg:flex flex-col gap-4 w-[200px] shrink-0">
      <MiniCalendar
        value={currentDate}
        month={miniCalMonth}
        onMonthChange={onMiniCalMonthChange}
        onSelectDate={onSelectDate}
        weekDays={weekDays}
      />

      <div className="bg-white rounded-2xl border border-slate-200 p-3 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
          Legenda
        </p>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />
            <span className="text-xs text-slate-600">
              {cfg.label}
              {key === "compareceu" && (
                <span className="ml-1 text-[9px] text-teal-600 font-semibold">• gera cobrança</span>
              )}
              {key === "concluido" && (
                <span className="ml-1 text-[9px] text-slate-400 font-semibold">• encerrado</span>
              )}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-violet-500" />
          <span className="text-xs text-slate-600">Sessão em grupo</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-slate-300" />
          <span className="text-xs text-slate-600">Bloqueado</span>
        </div>
        {activeSchedules.length >= 2 && (
          <div className="border-t border-slate-100 mt-2 pt-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              Agendas
            </p>
            {activeSchedules.map((s) => (
              <div key={s.id} className="flex items-center gap-2 mb-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: s.color }}
                />
                <span className="text-xs text-slate-600 truncate">{s.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
