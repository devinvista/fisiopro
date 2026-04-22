import {
  format,
  addDays,
  getDay,
  isSameMonth,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isToday,
} from "date-fns";
import { Lock, Plus, Globe, Ban } from "lucide-react";
import { cn } from "@/utils/utils";
import type { Appointment, BlockedSlot } from "../types";

export function MonthGrid({
  currentDate,
  appointments,
  blockedSlots,
  onDayClick,
  onNewAppointment,
  workingDayNumbers,
}: {
  currentDate: Date;
  appointments: Appointment[];
  blockedSlots: BlockedSlot[];
  onDayClick: (day: Date) => void;
  onNewAppointment: (dateStr: string) => void;
  workingDayNumbers: Set<number> | null;
}) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days: Date[] = [];
  let d = calStart;
  while (d <= calEnd) {
    days.push(d);
    d = addDays(d, 1);
  }

  const weekHeaders = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

  const getDayAppts = (day: Date) =>
    appointments.filter((a) => a.date === format(day, "yyyy-MM-dd"));

  const getDayBlocked = (day: Date) =>
    blockedSlots.filter((b) => b.date === format(day, "yyyy-MM-dd"));

  const STATUS_COLORS: Record<string, string> = {
    agendado: "bg-blue-400",
    confirmado: "bg-emerald-400",
    compareceu: "bg-teal-400",
    concluido: "bg-slate-400",
    cancelado: "bg-red-400",
    faltou: "bg-orange-400",
    remarcado: "bg-purple-400",
  };

  return (
    <div className="flex flex-col h-full">
      {/* Week day headers */}
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/70">
        {weekHeaders.map((h) => (
          <div key={h} className="py-2 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {h}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 flex-1" style={{ gridAutoRows: "minmax(100px, 1fr)" }}>
        {days.map((day, i) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const inMonth = isSameMonth(day, currentDate);
          const today = isToday(day);
          const dayAppts = getDayAppts(day);
          const dayBlocked = getDayBlocked(day);
          const hasBlock = dayBlocked.length > 0;
          const visibleAppts = dayAppts.slice(0, 3);
          const overflow = dayAppts.length - 3;
          const isNonWorkingDay = workingDayNumbers !== null && !workingDayNumbers.has(getDay(day));

          return (
            <div
              key={i}
              className={cn(
                "border-r border-b border-slate-100 p-1.5 cursor-pointer group transition-colors",
                !inMonth && "bg-slate-50/60",
                today && !isNonWorkingDay && "bg-primary/[0.03]",
                hasBlock && inMonth && !isNonWorkingDay && "bg-slate-100/80",
                isNonWorkingDay && inMonth && "bg-slate-100/50 opacity-60",
                "hover:bg-slate-50"
              )}
              onClick={() => inMonth && !isNonWorkingDay && onDayClick(day)}
            >
              {/* Day number row */}
              <div className="flex items-center justify-between mb-1">
                <span
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors",
                    !inMonth && "text-slate-300",
                    inMonth && !today && "text-slate-700",
                    today && "bg-primary text-white"
                  )}
                >
                  {format(day, "d")}
                </span>
                <div className="flex items-center gap-1">
                  {hasBlock && <Lock className="w-3 h-3 text-slate-400" />}
                  {inMonth && (
                    <button
                      className="opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 rounded flex items-center justify-center hover:bg-primary/10 text-primary"
                      onClick={(e) => { e.stopPropagation(); onNewAppointment(dateStr); }}
                      title="Novo agendamento"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Appointment pills */}
              <div className="space-y-0.5">
                {visibleAppts.map((apt) => {
                  const color = STATUS_COLORS[apt.status] || "bg-blue-400";
                  const isOnline = apt.source === "online";
                  return (
                    <div
                      key={apt.id}
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[9px] font-semibold text-white truncate leading-tight flex items-center gap-0.5",
                        color
                      )}
                      title={`${apt.startTime} · ${apt.patient?.name}${isOnline ? " · Online" : ""}`}
                    >
                      {isOnline && <Globe className="w-2 h-2 shrink-0 opacity-90" />}
                      {apt.startTime} {apt.patient?.name?.split(" ")[0]}
                    </div>
                  );
                })}
                {overflow > 0 && (
                  <div className="text-[9px] text-slate-500 font-medium px-1">
                    +{overflow} mais
                  </div>
                )}
                {hasBlock && dayAppts.length === 0 && (
                  <div className="text-[9px] text-slate-400 font-medium px-1 flex items-center gap-0.5">
                    <Ban className="w-2.5 h-2.5" />
                    {dayBlocked[0].reason || "Bloqueado"}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
