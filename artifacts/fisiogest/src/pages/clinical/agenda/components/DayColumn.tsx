import { format, isToday, getDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Ban, Pencil, Loader2, CheckCircle, Globe, Calendar as CalIcon, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Appointment } from "@workspace/api-client-react";
import { CurrentTimeLine } from "./CurrentTimeLine";
import { STATUS_CONFIG, SLOT_HEIGHT } from "../constants";
import { timeToMinutes, minutesToTop, minutesToHeight, positionAppointments } from "../utils";
import type { BlockedSlot, ScheduleOption } from "../types";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";

interface Props {
  day: Date;
  view: import("../types").ViewMode;
  appointments: Appointment[];
  blockedSlots: BlockedSlot[];
  schedules: ScheduleOption[];
  activeSchedules: ScheduleOption[];
  selectedScheduleId: number | null;
  scheduleColorMap: Map<number, string>;
  workingDayNumbers: Set<number> | null;
  effectiveSchedules: ScheduleOption[] | null;
  hours: number[];
  activeHourStart: number;
  activeHourEnd: number;
  activeTotalHours: number;
  slotsPerHour: number;
  slotPxHeight: number;
  slotDuration: number;
  quickCheckInId: number | null;
  onSlotClick: (date: Date, hour: number, offsetMin: number) => void;
  onAppointmentClick: (id: number) => void;
  onEditBlock: (block: BlockedSlot) => void;
  onQuickCheckIn: (aptId: number, e: React.MouseEvent) => void;
}

const STATUS_COLORS: Record<string, { bg: string; light: string; border: string }> = {
  agendado:   { bg: "#4ade80", light: "#f0fdf4", border: "#86efac" },
  confirmado: { bg: "#059669", light: "#ecfdf5", border: "#34d399" },
  compareceu: { bg: "#3b82f6", light: "#eff6ff", border: "#93c5fd" },
  concluido:  { bg: "#94a3b8", light: "#f8fafc", border: "#e2e8f0" },
  cancelado:  { bg: "#f87171", light: "#fef2f2", border: "#fecaca" },
  faltou:     { bg: "#e11d48", light: "#fff1f2", border: "#fda4af" },
  remarcado:  { bg: "#facc15", light: "#fefce8", border: "#fde047" },
};

export function DayColumn({
  day,
  view,
  appointments,
  blockedSlots,
  schedules,
  activeSchedules,
  selectedScheduleId,
  scheduleColorMap,
  workingDayNumbers,
  effectiveSchedules,
  hours,
  activeHourStart,
  activeHourEnd,
  activeTotalHours,
  slotsPerHour,
  slotPxHeight,
  slotDuration,
  quickCheckInId,
  onSlotClick,
  onAppointmentClick,
  onEditBlock,
  onQuickCheckIn,
}: Props) {
  const today = isToday(day);
  const positioned = positionAppointments(appointments);
  const toTop = (minutes: number) => minutesToTop(minutes, activeHourStart);

  const isNonWorkingDayCol =
    view === "day" && workingDayNumbers !== null && !workingDayNumbers.has(getDay(day));

  return (
    <div
      className={cn(
        "border-r border-slate-100 last:border-r-0 relative",
        today && !isNonWorkingDayCol && "bg-primary/[0.015]",
        isNonWorkingDayCol && "bg-slate-50/70",
      )}
      style={{ height: activeTotalHours * SLOT_HEIGHT }}
    >
      {isNonWorkingDayCol && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 select-none cursor-not-allowed bg-slate-50/80">
          <CalIcon className="w-8 h-8 text-slate-200 mb-2" />
          <p className="text-xs font-semibold text-slate-400 text-center px-3">
            {effectiveSchedules && effectiveSchedules.length === 1
              ? `${effectiveSchedules[0].name} não opera neste dia`
              : "Sem agenda neste dia"}
          </p>
        </div>
      )}

      {hours.map((h) => (
        <div
          key={h}
          className="absolute left-0 right-0 border-b border-slate-100/80"
          style={{ top: (h - activeHourStart) * SLOT_HEIGHT, height: SLOT_HEIGHT }}
        >
          {Array.from({ length: slotsPerHour }).map((_, si) => {
            const offsetMin = si * slotDuration;
            const mm = String(offsetMin).padStart(2, "0");
            return (
              <div key={si}>
                {si > 0 && (
                  <div
                    className="absolute left-0 right-0 border-b border-dashed border-slate-100/60"
                    style={{ top: si * slotPxHeight, height: 0 }}
                  />
                )}
                <div
                  className="absolute left-0 right-0 cursor-pointer hover:bg-primary/[0.04] transition-colors group/slot"
                  style={{ top: si * slotPxHeight, height: slotPxHeight }}
                  onClick={() => onSlotClick(day, h, offsetMin)}
                >
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/slot:opacity-100 transition-opacity pointer-events-none">
                    <span className="text-[9px] font-bold text-primary/50 bg-primary/8 rounded-md px-1.5 py-0.5">
                      {String(h).padStart(2, "0")}:{mm}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {today && <CurrentTimeLine hourStart={activeHourStart} hourEnd={activeHourEnd} />}

      {blockedSlots.map((block) => {
        const startMin = timeToMinutes(block.startTime);
        const endMin = timeToMinutes(block.endTime);
        const top = toTop(startMin);
        const height = Math.max(minutesToHeight(endMin - startMin), 20);
        const short = height < 40;
        return (
          <div
            key={block.id}
            className="absolute left-0 right-0 z-[5] bg-slate-100 border border-slate-200 border-dashed rounded-lg overflow-hidden cursor-pointer hover:bg-slate-200/70 group transition-colors"
            style={{ top: top + 1, height: height - 2, left: "2%", width: "96%" }}
            onClick={(e) => {
              e.stopPropagation();
              onEditBlock(block);
            }}
          >
            <div className="flex items-center gap-1 px-2 py-1 h-full">
              <Ban className="w-3 h-3 text-slate-400 shrink-0" />
              {!short && (
                <span className="text-[9px] font-semibold text-slate-400 truncate">
                  {block.reason || "Bloqueado"} · {block.startTime}–{block.endTime}
                </span>
              )}
              {!short && (
                <Pencil className="w-2.5 h-2.5 text-slate-300 opacity-0 group-hover:opacity-100 shrink-0 ml-auto transition-opacity" />
              )}
            </div>
          </div>
        );
      })}

      {positioned.map((item) => {
        if (item.type === "group") {
          const {
            appointments: grpApts,
            startTime,
            endTime,
            maxCapacity,
            col,
            totalCols,
          } = item;
          const startMin = timeToMinutes(startTime);
          const endMin = timeToMinutes(endTime);
          const top = toTop(startMin);
          const height = Math.max(minutesToHeight(endMin - startMin), 28);
          const widthPct = 100 / totalCols;
          const leftPct = col * widthPct;
          const short = height < 48;
          const tiny = height < 36;
          const occupancy = grpApts.length;
          const spotsLeft = maxCapacity - occupancy;
          const firstApt = grpApts[0];

          const grpScheduleColor =
            !selectedScheduleId && activeSchedules.length >= 2 && firstApt.scheduleId
              ? scheduleColorMap.get(firstApt.scheduleId)
              : undefined;

          const allConcluido       = grpApts.every((a) => a.status === "concluido");
          const allCompareceuOrDone = grpApts.every((a) => ["compareceu", "concluido"].includes(a.status));
          const allConfirmedOrHigher = grpApts.every((a) => ["confirmado", "compareceu", "concluido"].includes(a.status));
          const anyFaltou          = grpApts.some((a) => a.status === "faltou");
          const anyCancelado       = grpApts.some((a) => a.status === "cancelado");

          const grpColor = allConcluido
            ? STATUS_COLORS.concluido.bg
            : allCompareceuOrDone
            ? STATUS_COLORS.compareceu.bg
            : allConfirmedOrHigher
            ? STATUS_COLORS.confirmado.bg
            : anyFaltou
            ? STATUS_COLORS.faltou.bg
            : anyCancelado
            ? STATUS_COLORS.cancelado.bg
            : STATUS_COLORS.agendado.bg;

          return (
            <HoverCard key={`group-${item.procedureId}-${startTime}`} openDelay={200} closeDelay={80}>
              <HoverCardTrigger asChild>
                <div
                  className="absolute rounded-lg overflow-hidden cursor-pointer z-10 transition-all duration-150 hover:shadow-md hover:z-20 hover:brightness-105"
                  style={{
                    top: top + 2,
                    height: height - 4,
                    left: `${leftPct + 2}%`,
                    width: `${widthPct - 4}%`,
                    backgroundColor: grpColor,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAppointmentClick(firstApt.id);
                  }}
                >
                  {/* schedule color dot */}
                  {grpScheduleColor && !tiny && (
                    <div
                      className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full ring-1 ring-white/40"
                      style={{ backgroundColor: grpScheduleColor }}
                    />
                  )}

                  <div className="px-2 py-1 h-full flex flex-col justify-center text-white gap-0.5">
                    {tiny ? (
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-[9px] font-bold leading-none truncate">{firstApt.procedure?.name?.split(" ")[0]}</p>
                        <span className="text-[8px] font-bold bg-black/20 rounded-full px-1 py-0.5 leading-none shrink-0">
                          {occupancy}/{maxCapacity}
                        </span>
                      </div>
                    ) : short ? (
                      <div className="flex items-center justify-between gap-1 min-w-0">
                        <p className="text-[10px] font-bold truncate leading-tight flex-1 min-w-0 drop-shadow-sm">
                          {firstApt.procedure?.name}
                        </p>
                        <span className={cn(
                          "text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 leading-none",
                          spotsLeft > 0 ? "bg-black/20 text-white" : "bg-red-200/80 text-red-900",
                        )}>
                          {occupancy}/{maxCapacity}
                        </span>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-1 min-w-0">
                          <p className="text-[11px] font-bold leading-tight flex-1 min-w-0 truncate drop-shadow-sm">
                            {firstApt.procedure?.name}
                          </p>
                          <span className={cn(
                            "text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 leading-none",
                            spotsLeft > 0 ? "bg-black/20 text-white" : "bg-red-200/80 text-red-900",
                          )}>
                            {occupancy}/{maxCapacity}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-0.5 min-w-0 content-start overflow-hidden">
                          {grpApts.map((a) => (
                            <span
                              key={a.id}
                              className="text-[9px] font-semibold bg-white/20 rounded-full px-1.5 py-0.5 leading-none whitespace-nowrap"
                            >
                              {a.patient?.name?.split(" ")[0]}
                            </span>
                          ))}
                        </div>
                        {/* occupancy progress bar */}
                        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-black/20 rounded-b-lg overflow-hidden">
                          <div
                            className="h-full rounded-b-lg transition-all"
                            style={{
                              width: `${Math.min((occupancy / maxCapacity) * 100, 100)}%`,
                              backgroundColor: spotsLeft === 0 ? "#fca5a5" : "rgba(255,255,255,0.7)",
                            }}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </HoverCardTrigger>
              <HoverCardContent side="right" align="start" className="w-60 p-3" onClick={(e) => e.stopPropagation()}>
                <div className="mb-2 pb-2 border-b border-slate-100">
                  <p className="text-sm font-bold text-slate-800 leading-tight">{firstApt.procedure?.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                    {startTime} – {endTime} · {occupancy}/{maxCapacity} vagas
                  </p>
                </div>
                <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                  {grpApts.map((a) => {
                    const mCfg = STATUS_CONFIG[a.status] || STATUS_CONFIG.agendado;
                    return (
                      <li key={a.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-slate-700 truncate flex-1 min-w-0">{a.patient?.name}</span>
                        <span className={cn("shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full", mCfg.cardBg, "text-white")}>
                          {mCfg.label}
                        </span>
                      </li>
                    );
                  })}
                  {spotsLeft > 0 && (
                    <li className="text-xs text-slate-400 italic pt-1">
                      {spotsLeft} vaga{spotsLeft > 1 ? "s" : ""} disponíve{spotsLeft > 1 ? "is" : "l"}
                    </li>
                  )}
                </ul>
              </HoverCardContent>
            </HoverCard>
          );
        }

        const { appointment: apt, col, totalCols } = item;
        const startMin = timeToMinutes(apt.startTime);
        const endMin = timeToMinutes(apt.endTime);
        const top = toTop(startMin);
        const height = Math.max(minutesToHeight(endMin - startMin), 28);
        const widthPct = 100 / totalCols;
        const leftPct = col * widthPct;
        const short = height < 48;
        const tiny = height < 36;

        const canQuickCheckIn = apt.status === "agendado" || apt.status === "confirmado";
        const isCheckingIn = quickCheckInId === apt.id;
        const showScheduleIndicator = !selectedScheduleId && activeSchedules.length >= 2;
        const aptScheduleColor = apt.scheduleId ? scheduleColorMap.get(apt.scheduleId) : undefined;

        const colors = STATUS_COLORS[apt.status] ?? STATUS_COLORS.agendado;

        return (
          <div
            key={apt.id}
            className="absolute rounded-lg overflow-hidden cursor-pointer z-10 transition-all duration-150 hover:shadow-md hover:z-20 hover:brightness-105 group/card"
            style={{
              top: top + 2,
              height: height - 4,
              left: `${leftPct + 2}%`,
              width: `${widthPct - 4}%`,
              backgroundColor: colors.bg,
            }}
            onClick={(e) => {
              e.stopPropagation();
              onAppointmentClick(apt.id);
            }}
          >
            {/* schedule color dot */}
            {showScheduleIndicator && aptScheduleColor && !tiny && (
              <div
                className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full ring-1 ring-white/40"
                style={{ backgroundColor: aptScheduleColor }}
                title={schedules.find((s) => s.id === apt.scheduleId)?.name}
              />
            )}

            {((apt as any).rescheduleCount ?? 0) > 0 && !tiny && (
              <div className="absolute top-1 right-1 z-10 flex items-center gap-0.5 text-[8px] font-bold px-1 py-0.5 rounded-full bg-black/20 text-white">
                <Repeat className="w-2 h-2" />
                {(apt as any).rescheduleCount}×
              </div>
            )}

            <div className="px-2 py-1 h-full flex flex-col justify-center gap-0.5 text-white">
              {tiny ? (
                <p className="text-[9px] font-bold leading-none truncate">
                  {apt.patient?.name?.split(" ")[0]}
                </p>
              ) : short ? (
                <>
                  <p className="text-[10px] font-bold leading-tight truncate drop-shadow-sm">
                    {apt.patient?.name?.split(" ")[0]}
                  </p>
                  <p className="text-[9px] leading-none truncate text-white/70">
                    {apt.procedure?.name}
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1 min-w-0">
                    {apt.source === "online" && (
                      <Globe className="w-2.5 h-2.5 shrink-0 text-white/70" />
                    )}
                    <p className="text-[11px] font-bold leading-tight truncate drop-shadow-sm">
                      {apt.patient?.name}
                    </p>
                  </div>
                  <p className="text-[9px] leading-tight truncate text-white/65">
                    {apt.procedure?.name}
                  </p>
                </>
              )}
            </div>

            {canQuickCheckIn && !tiny && (
              <div
                className="absolute bottom-0 left-0 right-0 flex justify-center pb-1 opacity-0 group-hover/card:opacity-100 transition-opacity duration-150"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="flex items-center gap-0.5 bg-white/25 hover:bg-white/40 backdrop-blur-sm text-white text-[9px] font-bold px-2 py-0.5 rounded-full transition-colors"
                  onClick={(e) => onQuickCheckIn(apt.id, e)}
                  disabled={isCheckingIn}
                >
                  {isCheckingIn ? (
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  ) : (
                    <CheckCircle className="w-2.5 h-2.5" />
                  )}
                  Chegou
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
