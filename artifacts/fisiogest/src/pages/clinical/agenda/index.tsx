import { useState, useMemo } from "react";
import { apiFetch } from "@/utils/api";
import { AppLayout } from "@/components/layout/app-layout";
import { useAuth } from "@/utils/use-auth";
import {
  useListAppointments,
  useUpdateAppointment,
  useCompleteAppointment,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import {
  format,
  addDays,
  addWeeks,
  subWeeks,
  startOfWeek,
  getDay,
  isSameMonth,
  startOfMonth,
  endOfMonth,
  endOfWeek,
  addMonths,
  subMonths,
  isToday,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalIcon,
  Loader2,
  CheckCircle,
  Pencil,
  User,
  Lock,
  Ban,
  Globe,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/utils/utils";
import { useIsMobile } from "@/hooks/use-mobile";

import {
  HOUR_START,
  HOUR_END,
  SLOT_HEIGHT,
  STATUS_CONFIG,
} from "./constants";
import type { BlockedSlot, ScheduleOption, ViewMode } from "./types";
import { timeToMinutes, minutesToTop, minutesToHeight, positionAppointments } from "./utils";

import { CurrentTimeLine } from "./components/CurrentTimeLine";
import { MiniCalendar } from "./components/MiniCalendar";
import { MonthGrid } from "./components/MonthGrid";
import { AppointmentDetailModal } from "./components/AppointmentDetailModal";
import { CreateAppointmentForm } from "./components/CreateAppointmentForm";
import { BlockedSlotModal } from "./components/BlockedSlotModal";
import { BlockEditDialog } from "./components/BlockEditDialog";

export default function Agenda() {
  const isMobile = useIsMobile();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<ViewMode>(() =>
    window.innerWidth < 768 ? "day" : "fullweek"
  );
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ date: string; time: string; procedureId?: number } | null>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<number | null>(null);
  const [miniCalMonth, setMiniCalMonth] = useState(new Date());
  const [selectedScheduleId, setSelectedScheduleId] = useState<number | null>(null);
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<number | null>(null);
  const [editingBlock, setEditingBlock] = useState<BlockedSlot | null>(null);
  const [showRemarcado, setShowRemarcado] = useState(false);
  const [quickCheckInId, setQuickCheckInId] = useState<number | null>(null);
  const [batchCompleting, setBatchCompleting] = useState(false);
  const quickUpdateMutation = useUpdateAppointment();
  const quickCompleteMutation = useCompleteAppointment();

  const { toast } = useToast();
  const { hasPermission, hasRole } = useAuth();
  const canFilterByProfessional = hasPermission("users.manage") || hasRole("secretaria");

  const { data: schedules = [] } = useQuery<ScheduleOption[]>({
    queryKey: ["schedules"],
    queryFn: () => apiFetch("/api/schedules").then((r) => r.json()),
    staleTime: 60_000,
  });

  const { data: calendarProfessionals = [] } = useQuery<{ id: number; name: string; roles: string[] }[]>({
    queryKey: ["professionals"],
    queryFn: () => apiFetch("/api/users/professionals", { credentials: "include" }).then((r) => r.json()),
    staleTime: 60_000,
    enabled: canFilterByProfessional,
    select: (data) => data.filter((u) => u.roles.includes("profissional")),
  });

  const activeSchedules = schedules.filter((s) => s.isActive);

  const selectedSchedule = selectedScheduleId
    ? schedules.find((s) => s.id === selectedScheduleId) ?? null
    : null;

  // Determine visible hour range based on schedule configuration:
  // - If a specific schedule is selected → use its hours
  // - If there's only 1 active schedule → use it automatically
  // - If multiple schedules with none selected → span min start to max end
  // - Fallback to hardcoded constants only when no schedules are configured
  const effectiveSchedules = selectedSchedule
    ? [selectedSchedule]
    : activeSchedules.length > 0
      ? activeSchedules
      : null;

  const activeHourStart = effectiveSchedules
    ? Math.min(...effectiveSchedules.map((s) => parseInt(s.startTime.split(":")[0])))
    : HOUR_START;

  const activeHourEnd = effectiveSchedules
    ? Math.max(...effectiveSchedules.map((s) => {
        const h = parseInt(s.endTime.split(":")[0]);
        const m = parseInt(s.endTime.split(":")[1]);
        return m > 0 ? h + 1 : h;
      }))
    : HOUR_END;

  // Use the smallest slot duration among active schedule(s) so the grid is
  // always granular enough for all visible schedules.
  const VALID_SLOT_DURATIONS = [15, 20, 30, 45, 60, 90];
  const activeSlotDuration = effectiveSchedules
    ? Math.min(...effectiveSchedules.map((s) => s.slotDurationMinutes))
    : 30;
  // Clamp to a valid duration that divides evenly into 60 min
  const slotDuration = VALID_SLOT_DURATIONS.includes(activeSlotDuration)
    ? activeSlotDuration
    : 30;
  const slotsPerHour = Math.round(60 / slotDuration);
  const slotPxHeight = SLOT_HEIGHT / slotsPerHour;

  const activeTotalHours = activeHourEnd - activeHourStart;
  const hours = Array.from({ length: activeTotalHours }).map((_, i) => activeHourStart + i);

  const toTop = (minutes: number) => minutesToTop(minutes, activeHourStart);

  const scheduleColorMap = useMemo(() => {
    const map = new Map<number, string>();
    schedules.forEach((s) => map.set(s.id, s.color));
    return map;
  }, [schedules]);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const allWeekDays = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

  // Derive the set of working day numbers (0=Sun … 6=Sat) from the active schedule(s).
  // null means no schedule is configured → show all 7 days.
  const workingDayNumbers: Set<number> | null = (() => {
    if (!effectiveSchedules) return null;
    const set = new Set<number>();
    effectiveSchedules.forEach((s) => {
      s.workingDays
        .split(",")
        .map((d) => parseInt(d.trim(), 10))
        .filter((n) => !isNaN(n) && n >= 0 && n <= 6)
        .forEach((d) => set.add(d));
    });
    return set.size > 0 ? set : null;
  })();

  const weekDays = view === "day"
    ? [currentDate]
    : workingDayNumbers
      ? allWeekDays.filter((day) => workingDayNumbers.has(getDay(day)))
      : allWeekDays;

  const daysCount = weekDays.length;

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);

  // Always fetch the full Mon–Sun range so switching schedule filters
  // doesn't discard already-loaded appointment data.
  const startDateStr = view === "month"
    ? format(startOfWeek(monthStart, { weekStartsOn: 1 }), "yyyy-MM-dd")
    : view === "day"
      ? format(currentDate, "yyyy-MM-dd")
      : format(allWeekDays[0], "yyyy-MM-dd");
  const endDateStr = view === "month"
    ? format(endOfWeek(monthEnd, { weekStartsOn: 1 }), "yyyy-MM-dd")
    : view === "day"
      ? format(currentDate, "yyyy-MM-dd")
      : format(allWeekDays[6], "yyyy-MM-dd");

  const { data: appointments = [], isLoading, refetch } = useListAppointments({ startDate: startDateStr, endDate: endDateStr });

  const selectedAppointment = selectedAppointmentId != null
    ? (appointments.find((a) => a.id === selectedAppointmentId) ?? null)
    : null;

  const filteredAppointments = appointments
    .filter((a) => !selectedScheduleId || a.scheduleId === selectedScheduleId)
    .filter((a) => !selectedProfessionalId || a.professionalId === selectedProfessionalId)
    .filter((a) => showRemarcado || a.status !== "remarcado");

  // Today's appointments with "compareceu" status (for batch complete button)
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayCompareceu = filteredAppointments.filter(
    (a) => a.date === todayStr && a.status === "compareceu"
  );

  const handleQuickCheckIn = (aptId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setQuickCheckInId(aptId);
    quickUpdateMutation.mutate(
      { id: aptId, data: { status: "compareceu" } },
      {
        onSuccess: () => { setQuickCheckInId(null); refetch(); },
        onError: () => { setQuickCheckInId(null); toast({ variant: "destructive", title: "Erro ao registrar chegada." }); },
      }
    );
  };

  const handleBatchComplete = async () => {
    if (todayCompareceu.length === 0) return;
    setBatchCompleting(true);
    try {
      await Promise.all(
        todayCompareceu.map((a) =>
          new Promise<void>((resolve) => {
            quickCompleteMutation.mutate({ id: a.id }, { onSuccess: () => resolve(), onError: () => resolve() });
          })
        )
      );
      toast({ title: `${todayCompareceu.length} consulta${todayCompareceu.length !== 1 ? "s" : ""} concluída${todayCompareceu.length !== 1 ? "s" : ""}!` });
      refetch();
    } finally {
      setBatchCompleting(false);
    }
  };

  const { data: blockedSlots = [], refetch: refetchBlocked } = useQuery<BlockedSlot[]>({
    queryKey: ["blocked-slots", startDateStr, endDateStr, selectedScheduleId],
    queryFn: async () => {
      const params = new URLSearchParams({ startDate: startDateStr, endDate: endDateStr });
      if (selectedScheduleId) params.set("scheduleId", String(selectedScheduleId));
      const res = await apiFetch(`/api/blocked-slots?${params}`, { credentials: "include" });
      return res.json();
    },
    staleTime: 30_000,
  });

  const weekLabel = useMemo(() => {
    if (view === "month") {
      return format(currentDate, "MMMM 'de' yyyy", { locale: ptBR });
    }
    if (view === "day") {
      return format(currentDate, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
    }
    const s = weekDays[0];
    const e = weekDays[daysCount - 1];
    if (isSameMonth(s, e)) {
      return `${format(s, "d")}–${format(e, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}`;
    }
    return `${format(s, "d MMM", { locale: ptBR })} – ${format(e, "d MMM yyyy", { locale: ptBR })}`;
  }, [weekDays, view, currentDate]);

  const goToday = () => { setCurrentDate(new Date()); setMiniCalMonth(new Date()); };
  const goPrev = () => {
    const next = view === "day" ? addDays(currentDate, -1)
      : view === "month" ? subMonths(currentDate, 1)
      : subWeeks(currentDate, 1);
    setCurrentDate(next); setMiniCalMonth(next);
  };
  const goNext = () => {
    const next = view === "day" ? addDays(currentDate, 1)
      : view === "month" ? addMonths(currentDate, 1)
      : addWeeks(currentDate, 1);
    setCurrentDate(next); setMiniCalMonth(next);
  };

  const handleRefreshAll = () => {
    refetch();
    refetchBlocked();
    setSelectedAppointmentId(null);
  };

  const getDayAppointments = (day: Date) =>
    filteredAppointments.filter((a) => a.date === format(day, "yyyy-MM-dd"));

  const getDayBlockedSlots = (day: Date) =>
    blockedSlots.filter((b) => b.date === format(day, "yyyy-MM-dd"));

  const handleSlotClick = (date: Date, hour: number, offsetMin: number = 0) => {
    const clickedMin = hour * 60 + offsetMin;
    const dayAppts = getDayAppointments(date);
    const dayBlocked = getDayBlockedSlots(date);

    const isBlocked = dayBlocked.some((b) =>
      timeToMinutes(b.startTime) <= clickedMin && clickedMin < timeToMinutes(b.endTime)
    );
    if (isBlocked) return;

    const overlapping = dayAppts.filter((apt) => {
      if (["cancelado", "faltou"].includes(apt.status)) return false;
      return timeToMinutes(apt.startTime) <= clickedMin && clickedMin < timeToMinutes(apt.endTime);
    });

    if (overlapping.length > 0) {
      // Check if any overlapping procedure still has capacity (group sessions)
      const hasCapacity = overlapping.some((apt) => {
        const maxCap = apt.procedure?.maxCapacity ?? 1;
        if (maxCap <= 1) return false;
        const sameSession = dayAppts.filter(
          (a) =>
            !["cancelado", "faltou"].includes(a.status) &&
            a.procedureId === apt.procedureId &&
            a.startTime === apt.startTime
        ).length;
        return sameSession < maxCap;
      });
      if (!hasCapacity) return;
    }

    setSelectedSlot({
      date: format(date, "yyyy-MM-dd"),
      time: `${String(hour).padStart(2, "0")}:${String(offsetMin).padStart(2, "0")}`,
    });
    setIsNewModalOpen(true);
  };

  return (
    <AppLayout title="Agenda">
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
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
                onChange={(e) => setSelectedScheduleId(e.target.value ? Number(e.target.value) : null)}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
              >
                <option value="">Todas as agendas</option>
                {activeSchedules.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}{s.type === "professional" && s.professional ? ` — ${s.professional.name}` : ""}</option>
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
                onChange={(e) => setSelectedProfessionalId(e.target.value ? Number(e.target.value) : null)}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
              >
                <option value="">Todos os profissionais</option>
                {calendarProfessionals.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Today */}
          <Button variant="outline" size="sm" className="rounded-lg h-9 px-3 text-sm" onClick={goToday}>
            Hoje
          </Button>

          {/* Week nav */}
          <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
            <button className="p-2 hover:bg-slate-100 transition-colors" onClick={goPrev}>
              <ChevronLeft className="w-4 h-4 text-slate-600" />
            </button>
            <button className="p-2 hover:bg-slate-100 transition-colors" onClick={goNext}>
              <ChevronRight className="w-4 h-4 text-slate-600" />
            </button>
          </div>

          {/* Week/day label */}
          <span className={cn(
            "text-sm font-semibold text-slate-700",
            view === "day" ? "capitalize min-w-[260px]" : "min-w-[200px]"
          )}>
            {weekLabel}
          </span>

          {/* View toggle */}
          <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden text-xs font-medium">
            <button
              className={cn("px-3 h-9 transition-colors", view === "day" ? "bg-primary text-white" : "hover:bg-slate-100 text-slate-600")}
              onClick={() => setView("day")}
            >
              Dia
            </button>
            <button
              className={cn("px-3 h-9 transition-colors border-l border-slate-200", view === "fullweek" ? "bg-primary text-white" : "hover:bg-slate-100 text-slate-600")}
              onClick={() => setView("fullweek")}
            >
              Semana
            </button>
            <button
              className={cn("px-3 h-9 transition-colors border-l border-slate-200", view === "month" ? "bg-primary text-white" : "hover:bg-slate-100 text-slate-600")}
              onClick={() => setView("month")}
            >
              Mês
            </button>
          </div>

          {/* Batch complete: shown only when there are compareceu appointments today */}
          {todayCompareceu.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-9 px-3 rounded-lg border-teal-300 text-teal-700 hover:bg-teal-50 gap-1.5"
              onClick={handleBatchComplete}
              disabled={batchCompleting}
            >
              {batchCompleting
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <CheckCircle className="w-3.5 h-3.5" />}
              Concluir todos ({todayCompareceu.length})
            </Button>
          )}

          {/* Toggle remarcados */}
          <button
            className={cn(
              "h-9 px-3 rounded-lg text-xs font-medium border transition-colors",
              showRemarcado
                ? "border-purple-300 bg-purple-50 text-purple-700"
                : "border-slate-200 text-slate-400 hover:bg-slate-50"
            )}
            onClick={() => setShowRemarcado((v) => !v)}
            title={showRemarcado ? "Ocultar remarcados" : "Mostrar remarcados"}
          >
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-400 shrink-0" />
              Remarcados
            </span>
          </button>

          {/* Block button */}
          <Button
            size="sm"
            variant="outline"
            className="h-9 px-3 rounded-lg border-slate-300 text-slate-600 hover:bg-slate-100"
            onClick={() => setIsBlockModalOpen(true)}
          >
            <Lock className="w-3.5 h-3.5 mr-1.5" /> Bloquear
          </Button>

          {/* New button */}
          <Button
            size="sm"
            className="h-9 px-4 rounded-lg shadow-md shadow-primary/20"
            onClick={() => { setSelectedSlot(null); setIsNewModalOpen(true); }}
          >
            <Plus className="w-4 h-4 mr-1.5" /> Novo
          </Button>
        </div>
      </div>

      {/* ── Main body ────────────────────────────────────────────────────── */}
      <div className="flex gap-4 items-start">

        {/* ── LEFT: Mini calendar + legend ─────────────────────────────── */}
        <div className="hidden lg:flex flex-col gap-4 w-[200px] shrink-0">
          <MiniCalendar
            value={currentDate}
            month={miniCalMonth}
            onMonthChange={setMiniCalMonth}
            onSelectDate={(d) => setCurrentDate(d)}
            weekDays={weekDays}
          />

          {/* Legend */}
          <div className="bg-white rounded-2xl border border-slate-200 p-3 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Legenda</p>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <div key={key} className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />
                <span className="text-xs text-slate-600">
                  {cfg.label}
                  {key === "compareceu" && <span className="ml-1 text-[9px] text-teal-600 font-semibold">• gera cobrança</span>}
                  {key === "concluido" && <span className="ml-1 text-[9px] text-slate-400 font-semibold">• encerrado</span>}
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
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Agendas</p>
                {activeSchedules.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 mb-1.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="text-xs text-slate-600 truncate">{s.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Calendar grid ─────────────────────────────────────── */}
        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">

          {/* ── MONTH VIEW ─────────────────────────────────────────────── */}
          {view === "month" && (
            <MonthGrid
              currentDate={currentDate}
              appointments={filteredAppointments}
              blockedSlots={blockedSlots}
              onDayClick={(day) => { setCurrentDate(day); setMiniCalMonth(day); setView("day"); }}
              onNewAppointment={(dateStr) => { setSelectedSlot({ date: dateStr, time: "" }); setIsNewModalOpen(true); }}
              workingDayNumbers={workingDayNumbers}
            />
          )}

          {/* Day headers + time grid — only for week/day view */}
          {view !== "month" && (
            <>
              <div
                className="grid border-b border-slate-200 bg-slate-50/70"
                style={{ gridTemplateColumns: `56px repeat(${daysCount}, 1fr)` }}
              >
                <div className="border-r border-slate-200" />
                {weekDays.map((day, i) => {
                  const dayAppts = getDayAppointments(day);
                  const today = isToday(day);
                  const dayNum = getDay(day);
                  const schedulesOnDay = (!selectedScheduleId && activeSchedules.length >= 2)
                    ? activeSchedules.filter((s) =>
                        s.workingDays.split(",").map((d) => parseInt(d.trim(), 10)).includes(dayNum)
                      )
                    : [];
                  return (
                    <div
                      key={i}
                      className={cn(
                        "py-3 px-2 text-center border-r border-slate-200 last:border-r-0",
                        today && "bg-primary/5"
                      )}
                    >
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {format(day, "EEE", { locale: ptBR })}
                      </p>
                      <div className="flex items-center justify-center gap-2 mt-1">
                        <span
                          className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold transition-colors",
                            today ? "bg-primary text-white" : "text-slate-800"
                          )}
                        >
                          {format(day, "d")}
                        </span>
                      </div>
                      {schedulesOnDay.length > 0 && (
                        <div className="flex items-center justify-center gap-1 mt-1">
                          {schedulesOnDay.map((s) => (
                            <span
                              key={s.id}
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: s.color }}
                              title={s.name}
                            />
                          ))}
                        </div>
                      )}
                      {dayAppts.length > 0 && (
                        <p className="text-[9px] text-slate-400 mt-0.5">
                          {dayAppts.length} consulta{dayAppts.length !== 1 ? "s" : ""}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {isLoading ? (
                <div className="h-96 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 260px)" }}>
                  <div
                    className="grid relative"
                    style={{ gridTemplateColumns: `56px repeat(${daysCount}, 1fr)` }}
                  >
                    {/* Hour labels column */}
                    <div className="border-r border-slate-200">
                      {hours.map((h) => (
                        <div
                          key={h}
                          className="border-b border-slate-100 flex items-start justify-end pr-2 pt-1"
                          style={{ height: SLOT_HEIGHT }}
                        >
                          <span className="text-[10px] font-medium text-slate-400 leading-none">
                            {String(h).padStart(2, "0")}:00
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Day columns */}
                    {weekDays.map((day, di) => {
                      const dayAppts = getDayAppointments(day);
                      const dayBlocked = getDayBlockedSlots(day);
                      const today = isToday(day);

                      const positioned = positionAppointments(dayAppts);

                      const isNonWorkingDayCol = view === "day" && workingDayNumbers !== null && !workingDayNumbers.has(getDay(day));

                      return (
                        <div
                          key={di}
                          className={cn(
                            "border-r border-slate-200 last:border-r-0 relative",
                            today && !isNonWorkingDayCol && "bg-primary/[0.02]",
                            isNonWorkingDayCol && "bg-slate-50"
                          )}
                          style={{ height: activeTotalHours * SLOT_HEIGHT }}
                        >
                          {/* Non-working day overlay for day view — blocks all interactions */}
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
                          {/* Hour rows — sub-slots match the schedule's slotDurationMinutes */}
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
                                      onClick={() => handleSlotClick(day, h, offsetMin)}
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

                          {/* Current time line */}
                          {today && <CurrentTimeLine hourStart={activeHourStart} hourEnd={activeHourEnd} />}

                          {/* Blocked slots overlays */}
                          {dayBlocked.map((block) => {
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
                                onClick={(e) => { e.stopPropagation(); setEditingBlock(block); }}
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

                          {/* Appointments */}
                          {positioned.map((item) => {
                            if (item.type === "group") {
                              const { appointments: grpApts, startTime, endTime, maxCapacity, col, totalCols } = item;
                              const startMin = timeToMinutes(startTime);
                              const endMin = timeToMinutes(endTime);
                              const top = toTop(startMin);
                              const height = Math.max(minutesToHeight(endMin - startMin), 28);
                              const widthPct = 100 / totalCols;
                              const leftPct = col * widthPct;
                              const short = height < 48;
                              const occupancy = grpApts.length;
                              const spotsLeft = maxCapacity - occupancy;
                              const firstApt = grpApts[0];

                              const tiny = height < 36;
                              const grpScheduleColor = (!selectedScheduleId && activeSchedules.length >= 2 && firstApt.scheduleId)
                                ? scheduleColorMap.get(firstApt.scheduleId)
                                : undefined;

                              const allCompareceuOrDone = grpApts.every((a) => ["compareceu", "concluido"].includes(a.status));
                              const allConfirmedOrHigher = grpApts.every((a) => ["confirmado", "compareceu", "concluido"].includes(a.status));
                              const grpBg = allCompareceuOrDone ? "bg-teal-500" : allConfirmedOrHigher ? "bg-emerald-500" : "bg-violet-500";

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
                                  onClick={(e) => { e.stopPropagation(); setSelectedAppointmentId(firstApt.id); }}
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
                                        <div className="flex items-start justify-between gap-1">
                                          <p className="text-[10px] font-bold truncate leading-tight flex-1">
                                            {firstApt.procedure?.name}
                                          </p>
                                          <span className={cn(
                                            "text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 leading-none",
                                            spotsLeft > 0 ? "bg-white/20 text-white" : "bg-red-200/80 text-red-900"
                                          )}>
                                            {occupancy}/{maxCapacity}
                                          </span>
                                        </div>
                                        <p className="text-[9px] opacity-70 leading-none">{startTime} – {endTime}</p>
                                      </>
                                    ) : (
                                      <>
                                        <div className="flex items-start justify-between gap-1">
                                          <p className="text-[11px] font-bold truncate leading-tight flex-1">
                                            {firstApt.procedure?.name}
                                          </p>
                                          <span className={cn(
                                            "text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 leading-none",
                                            spotsLeft > 0 ? "bg-white/20 text-white" : "bg-red-200/80 text-red-900"
                                          )}>
                                            {occupancy}/{maxCapacity}
                                          </span>
                                        </div>
                                        <p className="text-[9px] opacity-70 leading-none">{startTime} – {endTime}</p>
                                        <div className="flex flex-wrap gap-1 mt-auto pt-1">
                                          {grpApts.slice(0, 3).map((a) => (
                                            <span
                                              key={a.id}
                                              className="text-[9px] font-semibold bg-white/20 rounded-full px-2 py-0.5 leading-none whitespace-nowrap"
                                            >
                                              {a.patient?.name?.split(" ")[0]}
                                            </span>
                                          ))}
                                          {spotsLeft > 0 && (
                                            <span className="text-[9px] font-semibold bg-white/10 rounded-full px-2 py-0.5 leading-none opacity-70 whitespace-nowrap">
                                              +{spotsLeft}
                                            </span>
                                          )}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            }

                            // Single appointment
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

                            const canQuickCheckIn = (apt.status === "agendado" || apt.status === "confirmado");
                            const isCheckingIn = quickCheckInId === apt.id;
                            const showScheduleIndicator = !selectedScheduleId && activeSchedules.length >= 2;
                            const aptScheduleColor = apt.scheduleId ? scheduleColorMap.get(apt.scheduleId) : undefined;

                            return (
                              <div
                                key={apt.id}
                                className={cn(
                                  "absolute rounded-xl overflow-hidden cursor-pointer z-10 transition-all duration-150 hover:brightness-95 hover:shadow-xl hover:z-20 group/card",
                                  cfg.cardBg
                                )}
                                style={{
                                  top: top + 2,
                                  height: height - 4,
                                  left: `${leftPct + 1}%`,
                                  width: `${widthPct - 2}%`,
                                }}
                                onClick={(e) => { e.stopPropagation(); setSelectedAppointmentId(apt.id); }}
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
                                        {apt.source === "online" && <Globe className="w-2.5 h-2.5 shrink-0 opacity-80" />}
                                        <p className="text-[10px] font-bold truncate leading-tight flex-1">
                                          {apt.patient?.name?.split(" ")[0]}
                                        </p>
                                      </div>
                                      <p className={cn("text-[9px] truncate leading-none", cfg.cardSub)}>{apt.procedure?.name}</p>
                                    </>
                                  ) : (
                                    <>
                                      <div className="flex items-start justify-between gap-1">
                                        <p className="text-[11px] font-bold truncate leading-tight flex-1">{apt.patient?.name}</p>
                                        {apt.source === "online" && (
                                          <Globe className="w-3 h-3 shrink-0 mt-0.5 opacity-80" />
                                        )}
                                      </div>
                                      <p className={cn("text-[10px] truncate leading-tight", cfg.cardSub)}>{apt.procedure?.name}</p>
                                      <p className={cn("text-[9px] tabular-nums", cfg.cardSub)}>{apt.startTime} – {apt.endTime}</p>
                                    </>
                                  )}
                                </div>

                                {/* Quick check-in button — visible on hover for agendado/confirmado */}
                                {canQuickCheckIn && !tiny && (
                                  <div
                                    className="absolute bottom-0 left-0 right-0 flex justify-center pb-1 opacity-0 group-hover/card:opacity-100 transition-opacity duration-150"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <button
                                      className="flex items-center gap-1 bg-white/25 hover:bg-white/40 text-white text-[9px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm transition-colors"
                                      onClick={(e) => handleQuickCheckIn(apt.id, e)}
                                      disabled={isCheckingIn}
                                    >
                                      {isCheckingIn
                                        ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                        : <CheckCircle className="w-2.5 h-2.5" />}
                                      Chegou
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      <Dialog open={isNewModalOpen} onOpenChange={setIsNewModalOpen}>
        <DialogContent className="sm:max-w-[520px] border-none shadow-2xl rounded-3xl max-h-[92vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              {selectedSlot?.procedureId ? "Adicionar Paciente à Sessão" : "Agendar Consulta"}
            </DialogTitle>
          </DialogHeader>
          <CreateAppointmentForm
            initialDate={selectedSlot?.date}
            initialTime={selectedSlot?.time}
            initialProcedureId={selectedSlot?.procedureId}
            lockProcedure={!!selectedSlot?.procedureId}
            scheduleId={selectedScheduleId ?? undefined}
            clinicStart={String(activeHourStart).padStart(2, "0") + ":00"}
            clinicEnd={String(activeHourEnd).padStart(2, "0") + ":00"}
            onSuccess={() => { setIsNewModalOpen(false); refetch(); }}
          />
        </DialogContent>
      </Dialog>

      {selectedAppointment && (
        <AppointmentDetailModal
          appointment={selectedAppointment}
          allAppointments={appointments}
          onClose={() => setSelectedAppointmentId(null)}
          onRefresh={handleRefreshAll}
          onAddToSession={(date, time, procedureId) => {
            setSelectedAppointmentId(null);
            setSelectedSlot({ date, time, procedureId });
            setIsNewModalOpen(true);
          }}
        />
      )}

      <BlockedSlotModal
        open={isBlockModalOpen}
        onOpenChange={setIsBlockModalOpen}
        onSuccess={() => { setIsBlockModalOpen(false); refetchBlocked(); }}
        activeSchedules={activeSchedules}
        defaultScheduleId={selectedScheduleId ?? undefined}
      />

      {editingBlock && (
        <BlockEditDialog
          block={editingBlock}
          onClose={() => setEditingBlock(null)}
          onSuccess={() => { setEditingBlock(null); refetchBlocked(); }}
        />
      )}
    </AppLayout>
  );
}
