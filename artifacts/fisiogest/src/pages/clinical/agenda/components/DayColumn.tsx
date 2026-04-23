import { format, isToday, getDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Ban, Pencil, Loader2, CheckCircle, Globe, Calendar as CalIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Appointment } from "@workspace/api-client-react";
import { CurrentTimeLine } from "./CurrentTimeLine";
import { STATUS_CONFIG, SLOT_HEIGHT } from "../constants";
import { timeToMinutes, minutesToTop, minutesToHeight, positionAppointments } from "../utils";
import type { BlockedSlot, ScheduleOption } from "../types";

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
        "border-r border-slate-200 last:border-r-0 relative",
        today && !isNonWorkingDayCol && "bg-primary/[0.02]",
        isNonWorkingDayCol && "bg-slate-50",
      )}
      style={{ height: activeTotalHours * SLOT_HEIGHT }}
    >
      {isNonWorkingDayCol && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 select-none cursor-not-allowed bg-slate-50/90">
          <CalIcon className="w-10 h-10 text-slate-200 mb-3" />
          <p className="text-sm font-semibold text-slate-400">
            {effectiveSchedules && effectiveSchedules.length === 1
              ? `${effectiveSchedules[0].name} não opera neste dia`
              : "Nenhuma agenda opera neste dia"}
          </p>
          <p className="text-xs text-slate-300 mt-1 capitalize">
            {format(day, "EEEE, d 'de' MMMM", { locale: ptBR })}
          </p>
        </div>
      )}

      {hours.map((h) => (
        <div
          key={h}
          className="absolute left-0 right-0 border-b border-slate-100"
          style={{ top: (h - activeHourStart) * SLOT_HEIGHT, height: SLOT_HEIGHT }}
        >
          {Array.from({ length: slotsPerHour }).map((_, si) => {
            const offsetMin = si * slotDuration;
            const mm = String(offsetMin).padStart(2, "0");
            return (
              <div key={si}>
                {si > 0 && (
                  <div
                    className="absolute left-0 right-0 border-b border-slate-100/60"
                    style={{ top: si * slotPxHeight, height: 0 }}
                  />
                )}
                <div
                  className="absolute left-0 right-0 cursor-pointer hover:bg-primary/5 transition-colors group/slot"
                  style={{ top: si * slotPxHeight, height: slotPxHeight }}
                  onClick={() => onSlotClick(day, h, offsetMin)}
                >
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/slot:opacity-100 transition-opacity pointer-events-none">
                    <span className="text-[9px] font-semibold text-primary/60 bg-primary/10 rounded px-1">
                      +{String(h).padStart(2, "0")}:{mm}
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
            className="absolute left-0 right-0 z-[5] bg-slate-200/80 border border-slate-300 border-dashed rounded overflow-hidden cursor-pointer hover:bg-slate-300/80 group transition-colors"
            style={{ top: top + 1, height: height - 2 }}
            onClick={(e) => {
              e.stopPropagation();
              onEditBlock(block);
            }}
            title="Clique para editar o bloqueio"
          >
            <div className="flex items-center justify-between gap-1 px-1.5 py-0.5 h-full">
              <div className="flex items-center gap-1 min-w-0">
                <Ban className="w-3 h-3 text-slate-500 shrink-0" />
                {!short && (
                  <span className="text-[9px] font-semibold text-slate-500 truncate">
                    {block.reason || "Bloqueado"} · {block.startTime}–{block.endTime}
                  </span>
                )}
              </div>
              {!short && (
                <Pencil className="w-2.5 h-2.5 text-slate-400 opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
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

          const allCompareceuOrDone = grpApts.every((a) =>
            ["compareceu", "concluido"].includes(a.status),
          );
          const allConfirmedOrHigher = grpApts.every((a) =>
            ["confirmado", "compareceu", "concluido"].includes(a.status),
          );
          const grpBg = allCompareceuOrDone
            ? "bg-teal-500"
            : allConfirmedOrHigher
              ? "bg-emerald-500"
              : "bg-violet-500";

          return (
            <div
              key={`group-${item.procedureId}-${startTime}`}
              className={`absolute rounded-xl overflow-hidden cursor-pointer z-10 transition-all duration-150 hover:brightness-95 hover:shadow-xl hover:z-20 ${grpBg}`}
              style={{
                top: top + 2,
                height: height - 4,
                left: `${leftPct + 1}%`,
                width: `${widthPct - 2}%`,
              }}
              onClick={(e) => {
                e.stopPropagation();
                onAppointmentClick(firstApt.id);
              }}
            >
              {grpScheduleColor && (
                <div
                  className="absolute top-0 right-0 bottom-0 w-1 rounded-r-xl"
                  style={{ backgroundColor: grpScheduleColor }}
                  title={schedules.find((s) => s.id === firstApt.scheduleId)?.name}
                />
              )}
              <div className="px-2.5 py-2 h-full flex flex-col text-white gap-0.5">
                {tiny ? (
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-[9px] font-bold leading-none truncate">{startTime}</p>
                    <span className="text-[8px] font-bold bg-white/20 rounded-full px-1.5 py-0.5 leading-none shrink-0">
                      {occupancy}/{maxCapacity}
                    </span>
                  </div>
                ) : short ? (
                  <>
                    <div className="flex items-start justify-between gap-1 min-w-0">
                      <p className="text-[10px] font-bold truncate leading-tight flex-1 min-w-0">
                        {firstApt.procedure?.name}
                      </p>
                      <span
                        className={cn(
                          "text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 leading-none",
                          spotsLeft > 0
                            ? "bg-white/20 text-white"
                            : "bg-red-200/80 text-red-900",
                        )}
                      >
                        {occupancy}/{maxCapacity}
                      </span>
                    </div>
                    <p className="text-[9px] opacity-70 leading-none">
                      {startTime} – {endTime}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-1 min-w-0">
                      <p className="text-[10px] font-bold leading-tight flex-1 min-w-0 truncate">
                        {firstApt.procedure?.name} · {startTime}
                      </p>
                      <span
                        className={cn(
                          "text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 leading-none",
                          spotsLeft > 0
                            ? "bg-white/20 text-white"
                            : "bg-red-200/80 text-red-900",
                        )}
                      >
                        {occupancy}/{maxCapacity}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1 min-w-0 content-start overflow-hidden">
                      {grpApts.map((a) => (
                        <span
                          key={a.id}
                          className="text-[9px] font-semibold bg-white/25 rounded-full px-1.5 py-0.5 leading-none whitespace-nowrap"
                          title={a.patient?.name}
                        >
                          {a.patient?.name?.split(" ")[0]}
                        </span>
                      ))}
                      {spotsLeft > 0 && (
                        <span className="text-[9px] font-semibold bg-white/10 rounded-full px-1.5 py-0.5 leading-none opacity-80 whitespace-nowrap shrink-0">
                          {spotsLeft} livre{spotsLeft > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        }

        const { appointment: apt, col, totalCols } = item;
        const startMin = timeToMinutes(apt.startTime);
        const endMin = timeToMinutes(apt.endTime);
        const top = toTop(startMin);
        const height = Math.max(minutesToHeight(endMin - startMin), 28);
        const cfg = STATUS_CONFIG[apt.status] || STATUS_CONFIG.agendado;
        const widthPct = 100 / totalCols;
        const leftPct = col * widthPct;
        const short = height < 48;
        const tiny = height < 36;

        const canQuickCheckIn = apt.status === "agendado" || apt.status === "confirmado";
        const isCheckingIn = quickCheckInId === apt.id;
        const showScheduleIndicator = !selectedScheduleId && activeSchedules.length >= 2;
        const aptScheduleColor = apt.scheduleId
          ? scheduleColorMap.get(apt.scheduleId)
          : undefined;

        return (
          <div
            key={apt.id}
            className={cn(
              "absolute rounded-xl overflow-hidden cursor-pointer z-10 transition-all duration-150 hover:brightness-95 hover:shadow-xl hover:z-20 group/card",
              cfg.cardBg,
            )}
            style={{
              top: top + 2,
              height: height - 4,
              left: `${leftPct + 1}%`,
              width: `${widthPct - 2}%`,
            }}
            onClick={(e) => {
              e.stopPropagation();
              onAppointmentClick(apt.id);
            }}
          >
            {showScheduleIndicator && aptScheduleColor && (
              <div
                className="absolute top-0 right-0 bottom-0 w-1 rounded-r-xl"
                style={{ backgroundColor: aptScheduleColor }}
                title={schedules.find((s) => s.id === apt.scheduleId)?.name}
              />
            )}
            <div className="px-2.5 py-2 h-full flex flex-col text-white gap-0.5">
              {tiny ? (
                <p className="text-[9px] font-bold leading-none truncate">
                  {apt.patient?.name?.split(" ")[0]}
                </p>
              ) : short ? (
                <>
                  <div className="flex items-center gap-1">
                    {apt.source === "online" && (
                      <Globe className="w-2.5 h-2.5 shrink-0 opacity-80" />
                    )}
                    <p className="text-[10px] font-bold truncate leading-tight flex-1">
                      {apt.patient?.name?.split(" ")[0]}
                    </p>
                  </div>
                  <p className={cn("text-[9px] truncate leading-none", cfg.cardSub)}>
                    {apt.procedure?.name}
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-1 min-w-0">
                    <p className="text-[11px] font-bold truncate leading-tight flex-1 min-w-0">
                      {apt.patient?.name}
                    </p>
                    {apt.source === "online" && (
                      <Globe className="w-3 h-3 shrink-0 mt-0.5 opacity-80" />
                    )}
                  </div>
                  <p className={cn("text-[10px] truncate leading-tight", cfg.cardSub)}>
                    {apt.procedure?.name}
                  </p>
                  <p className={cn("text-[9px] tabular-nums", cfg.cardSub)}>
                    {apt.startTime} – {apt.endTime}
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
                  className="flex items-center gap-1 bg-white/25 hover:bg-white/40 text-white text-[9px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm transition-colors"
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
