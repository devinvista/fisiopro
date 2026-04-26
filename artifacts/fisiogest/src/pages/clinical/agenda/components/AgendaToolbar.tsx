import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Loader2,
  CheckCircle,
  Lock,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <div className="mb-3 space-y-2 lg:space-y-0 lg:flex lg:items-center lg:justify-between lg:gap-2 lg:flex-wrap">
      {/* ── Filters (no redundant title — page already shows "Agenda") ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {activeSchedules.length >= 2 && (
          <div className="flex items-center gap-1.5 min-w-0">
            <select
              value={selectedScheduleId ?? ""}
              onChange={(e) => onSelectScheduleId(e.target.value ? Number(e.target.value) : null)}
              className="h-9 max-w-[60vw] sm:max-w-none rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 cursor-pointer truncate"
            >
              <option value="">Todas as agendas</option>
              {activeSchedules.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.type === "professional" && s.professional ? ` — ${s.professional.name}` : ""}
                </option>
              ))}
            </select>
            {selectedSchedule && (
              <span
                className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: selectedSchedule.color }}
              />
            )}
          </div>
        )}
        {canFilterByProfessional && calendarProfessionals.length >= 2 && (
          <div className="flex items-center gap-1.5 min-w-0">
            <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={selectedProfessionalId ?? ""}
              onChange={(e) =>
                onSelectProfessionalId(e.target.value ? Number(e.target.value) : null)
              }
              className="h-9 max-w-[55vw] sm:max-w-none rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 cursor-pointer truncate"
            >
              <option value="">Todos os profissionais</option>
              {calendarProfessionals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ── Date navigation + label (mobile: own row) ── */}
      <div className="flex items-center gap-2 lg:gap-2">
        <Button
          variant="outline"
          size="sm"
          className="rounded-lg h-9 px-3 text-sm shrink-0"
          onClick={goToday}
        >
          Hoje
        </Button>

        <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden shrink-0">
          <button className="p-2 hover:bg-slate-100 transition-colors" onClick={goPrev} aria-label="Anterior">
            <ChevronLeft className="w-4 h-4 text-slate-600" />
          </button>
          <button className="p-2 hover:bg-slate-100 transition-colors" onClick={goNext} aria-label="Próximo">
            <ChevronRight className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        <span
          className={cn(
            "text-xs sm:text-sm font-semibold text-slate-700 truncate flex-1 lg:flex-none",
            view === "day" ? "capitalize lg:min-w-[220px]" : "lg:min-w-[180px]",
          )}
        >
          {weekLabel}
        </span>
      </div>

      {/* ── View toggle + actions ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden text-xs font-medium flex-1 sm:flex-none">
          {(["day", "fullweek", "month"] as ViewMode[]).map((v, idx) => (
            <button
              key={v}
              className={cn(
                "flex-1 sm:flex-none px-3 h-9 transition-colors",
                idx > 0 && "border-l border-slate-200",
                view === v ? "bg-primary text-white" : "hover:bg-slate-100 text-slate-600",
              )}
              onClick={() => setView(v)}
            >
              {v === "day" ? "Dia" : v === "fullweek" ? "Semana" : "Mês"}
            </button>
          ))}
        </div>

        {todayCompareceuCount > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="h-9 px-3 rounded-lg border-teal-300 text-teal-700 hover:bg-teal-50 gap-1.5 text-xs"
            onClick={onBatchComplete}
            disabled={batchCompleting}
          >
            {batchCompleting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCircle className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">Concluir todos </span>
            <span>({todayCompareceuCount})</span>
          </Button>
        )}

        <Button
          size="sm"
          variant="outline"
          className="hidden sm:inline-flex h-9 px-3 rounded-lg border-slate-300 text-slate-600 hover:bg-slate-100 text-xs font-semibold gap-1.5"
          onClick={onOpenBlock}
        >
          <Lock className="w-3.5 h-3.5 shrink-0" /> Bloquear
        </Button>

        <Button
          size="sm"
          className="hidden sm:inline-flex h-9 px-3 rounded-lg shadow-md shadow-primary/20 text-xs font-semibold gap-1.5"
          onClick={onOpenNew}
        >
          <Plus className="w-3.5 h-3.5 shrink-0" /> Novo
        </Button>
      </div>

      {/* ── Mobile-only primary actions ── */}
      <div className="grid grid-cols-2 gap-2 sm:hidden">
        <Button
          size="sm"
          variant="outline"
          className="w-full h-10 px-3 rounded-xl border-slate-300 text-slate-600 hover:bg-slate-100 text-sm font-semibold gap-1.5"
          onClick={onOpenBlock}
        >
          <Lock className="w-4 h-4 shrink-0" /> Bloquear
        </Button>

        <Button
          size="sm"
          className="w-full h-10 px-3 rounded-xl shadow-md shadow-primary/20 text-sm font-semibold gap-1.5"
          onClick={onOpenNew}
        >
          <Plus className="w-4 h-4 shrink-0" /> Agendar
        </Button>
      </div>
    </div>
  );
}
