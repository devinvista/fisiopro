import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalIcon,
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

  showRemarcado: boolean;
  setShowRemarcado: (v: boolean | ((prev: boolean) => boolean)) => void;

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
  showRemarcado,
  setShowRemarcado,
  onOpenBlock,
  onOpenNew,
}: Props) {
  return (
    <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <CalIcon className="w-5 h-5 text-primary" />
          <span className="text-lg font-bold font-display text-slate-800">Calendário</span>
        </div>
        {activeSchedules.length >= 2 && (
          <div className="flex items-center gap-1.5">
            <select
              value={selectedScheduleId ?? ""}
              onChange={(e) => onSelectScheduleId(e.target.value ? Number(e.target.value) : null)}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 cursor-pointer"
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
          <div className="flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={selectedProfessionalId ?? ""}
              onChange={(e) =>
                onSelectProfessionalId(e.target.value ? Number(e.target.value) : null)
              }
              className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 cursor-pointer"
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

      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          className="rounded-lg h-9 px-3 text-sm"
          onClick={goToday}
        >
          Hoje
        </Button>

        <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
          <button className="p-2 hover:bg-slate-100 transition-colors" onClick={goPrev}>
            <ChevronLeft className="w-4 h-4 text-slate-600" />
          </button>
          <button className="p-2 hover:bg-slate-100 transition-colors" onClick={goNext}>
            <ChevronRight className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        <span
          className={cn(
            "text-sm font-semibold text-slate-700",
            view === "day" ? "capitalize min-w-[260px]" : "min-w-[200px]",
          )}
        >
          {weekLabel}
        </span>

        <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden text-xs font-medium">
          {(["day", "fullweek", "month"] as ViewMode[]).map((v, idx) => (
            <button
              key={v}
              className={cn(
                "px-3 h-9 transition-colors",
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
            className="h-9 px-3 rounded-lg border-teal-300 text-teal-700 hover:bg-teal-50 gap-1.5"
            onClick={onBatchComplete}
            disabled={batchCompleting}
          >
            {batchCompleting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCircle className="w-3.5 h-3.5" />
            )}
            Concluir todos ({todayCompareceuCount})
          </Button>
        )}

        <button
          className={cn(
            "h-9 px-3 rounded-lg text-xs font-medium border transition-colors",
            showRemarcado
              ? "border-purple-300 bg-purple-50 text-purple-700"
              : "border-slate-200 text-slate-400 hover:bg-slate-50",
          )}
          onClick={() => setShowRemarcado((v) => !v)}
          title={showRemarcado ? "Ocultar remarcados" : "Mostrar remarcados"}
        >
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-purple-400 shrink-0" />
            Remarcados
          </span>
        </button>

        <Button
          size="sm"
          variant="outline"
          className="h-9 px-3 rounded-lg border-slate-300 text-slate-600 hover:bg-slate-100"
          onClick={onOpenBlock}
        >
          <Lock className="w-3.5 h-3.5 mr-1.5" /> Bloquear
        </Button>

        <Button
          size="sm"
          className="h-9 px-4 rounded-lg shadow-md shadow-primary/20"
          onClick={onOpenNew}
        >
          <Plus className="w-4 h-4 mr-1.5" /> Novo
        </Button>
      </div>
    </div>
  );
}
