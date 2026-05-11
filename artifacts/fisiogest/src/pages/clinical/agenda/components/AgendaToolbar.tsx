import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Loader2,
  CheckCircle,
  Lock,
  User,
  CalendarDays,
  Calendar,
  LayoutGrid,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrimaryActionButton } from "@/components/ui/primary-action-button";
import { cn } from "@/lib/utils";
import type { ScheduleOption, ViewMode } from "../types";

interface ProfessionalOption {
  id: number;
  name: string;
}

interface Props {
  activeSchedules: ScheduleOption[];
  selectedScheduleId: number | null;
  onSelectScheduleId: (id: number | null) => void;
  selectedSchedule: ScheduleOption | null;

  canFilterByProfessional: boolean;
  calendarProfessionals: ProfessionalOption[];
  selectedProfessionalId: number | null;
  onSelectProfessionalId: (id: number | null) => void;

  view: ViewMode;
  setView: (v: ViewMode) => void;
  weekLabel: string;
  goToday: () => void;
  goPrev: () => void;
  goNext: () => void;

  todayCompareceuCount: number;
  batchCompleting: boolean;
  onBatchComplete: () => void;

  onOpenBlock: () => void;
  onOpenNew: () => void;
}

const VIEW_OPTIONS: { value: ViewMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "day",      label: "Dia",    icon: Calendar },
  { value: "fullweek", label: "Semana", icon: CalendarDays },
  { value: "month",    label: "Mês",    icon: LayoutGrid },
];

export function AgendaToolbar({
  activeSchedules,
  selectedScheduleId,
  onSelectScheduleId,
  selectedSchedule,
  canFilterByProfessional,
  calendarProfessionals,
  selectedProfessionalId,
  onSelectProfessionalId,
  view,
  setView,
  weekLabel,
  goToday,
  goPrev,
  goNext,
  todayCompareceuCount,
  batchCompleting,
  onBatchComplete,
  onOpenBlock,
  onOpenNew,
}: Props) {
  return (
    <div className="mb-4">
      {/* ── Single unified toolbar row ── */}
      <div className="flex items-center gap-2 flex-wrap">

        {/* View switcher */}
        <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-0.5 shrink-0">
          {VIEW_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setView(value)}
              className={cn(
                "flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-semibold transition-all duration-150",
                view === value
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Date navigation */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={goPrev}
            className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all"
            aria-label="Anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={goNext}
            className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all"
            aria-label="Próximo"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={goToday}
          className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-semibold hover:bg-slate-50 hover:border-slate-300 transition-all shrink-0"
        >
          Hoje
        </button>

        <span className="text-sm font-semibold text-slate-700 truncate flex-1 min-w-0 capitalize hidden sm:block">
          {weekLabel}
        </span>

        {/* Filters */}
        {activeSchedules.length >= 2 && (
          <div className="flex items-center gap-1.5 min-w-0">
            {selectedSchedule && (
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: selectedSchedule.color }}
              />
            )}
            <select
              value={selectedScheduleId ?? ""}
              onChange={(e) => onSelectScheduleId(e.target.value ? Number(e.target.value) : null)}
              className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 cursor-pointer max-w-[140px] truncate"
            >
              <option value="">Todas as agendas</option>
              {activeSchedules.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.type === "professional" && s.professional ? ` — ${s.professional.name}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {canFilterByProfessional && calendarProfessionals.length >= 2 && (
          <div className="flex items-center gap-1.5 min-w-0">
            <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={selectedProfessionalId ?? ""}
              onChange={(e) => onSelectProfessionalId(e.target.value ? Number(e.target.value) : null)}
              className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 cursor-pointer max-w-[140px] truncate"
            >
              <option value="">Todos</option>
              {calendarProfessionals.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Batch complete */}
        {todayCompareceuCount > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="h-9 px-3 rounded-xl border-teal-200 text-teal-700 bg-teal-50 hover:bg-teal-100 gap-1.5 text-xs font-semibold shrink-0"
            onClick={onBatchComplete}
            disabled={batchCompleting}
          >
            {batchCompleting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCircle className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">Concluir</span>
            <span className="bg-teal-200 text-teal-800 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
              {todayCompareceuCount}
            </span>
          </Button>
        )}

        {/* Actions */}
        <Button
          size="sm"
          variant="outline"
          className="h-9 px-3 rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold gap-1.5 shrink-0 hidden sm:inline-flex"
          onClick={onOpenBlock}
        >
          <Lock className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden md:inline">Bloquear</span>
        </Button>

        <PrimaryActionButton
          label="Novo"
          onClick={onOpenNew}
        />
      </div>

      {/* Mobile: date label + action row */}
      <div className="flex items-center justify-between mt-2 sm:hidden">
        <span className="text-sm font-semibold text-slate-700 truncate capitalize">{weekLabel}</span>
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-3 rounded-xl border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold gap-1.5"
          onClick={onOpenBlock}
        >
          <Lock className="w-3.5 h-3.5" /> Bloquear
        </Button>
      </div>

    </div>
  );
}
