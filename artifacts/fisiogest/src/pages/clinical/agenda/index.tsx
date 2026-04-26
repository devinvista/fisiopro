import { useState, useMemo, lazy, Suspense } from "react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AppLayout } from "@/components/layout/app-layout";
import { useAuth } from "@/hooks/use-auth";

import { SLOT_HEIGHT } from "./constants";
import type { BlockedSlot } from "./types";
import { timeToMinutes } from "./utils";
import { computeScheduleConfig } from "./helpers/scheduleConfig";
import { useAgendaQueries } from "./hooks/useAgendaQueries";
import { useAgendaNavigation } from "./hooks/useAgendaNavigation";
import { useAgendaMutations } from "./hooks/useAgendaMutations";

import { AgendaToolbar } from "./components/AgendaToolbar";
import { AgendaSidebar } from "./components/AgendaSidebar";
import { WeekHeader } from "./components/WeekHeader";
import { DayColumn } from "./components/DayColumn";

const MonthGrid = lazy(() =>
  import("./components/MonthGrid").then((m) => ({ default: m.MonthGrid })),
);
const AppointmentDetailModal = lazy(() =>
  import("./components/AppointmentDetailModal").then((m) => ({ default: m.AppointmentDetailModal })),
);
const CreateAppointmentForm = lazy(() =>
  import("./components/CreateAppointmentForm").then((m) => ({ default: m.CreateAppointmentForm })),
);
const BlockedSlotModal = lazy(() =>
  import("./components/BlockedSlotModal").then((m) => ({ default: m.BlockedSlotModal })),
);
const BlockEditDialog = lazy(() =>
  import("./components/BlockEditDialog").then((m) => ({ default: m.BlockEditDialog })),
);

function ModalLoader() {
  return (
    <div className="flex h-40 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

export default function Agenda() {
  const { hasPermission, hasRole } = useAuth();
  const canFilterByProfessional = hasPermission("users.manage") || hasRole("secretaria");

  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ date: string; time: string; procedureId?: number } | null>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<number | null>(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState<number | null>(null);
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<number | null>(null);
  const [editingBlock, setEditingBlock] = useState<BlockedSlot | null>(null);

  // Buscar schedules primeiro (sem nav ainda) para derivar config visual
  const initialQueries = useAgendaQueries({
    startDate: format(new Date(), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
    selectedScheduleId,
    canFilterByProfessional,
  });

  const config = useMemo(
    () => computeScheduleConfig(initialQueries.schedules, selectedScheduleId),
    [initialQueries.schedules, selectedScheduleId],
  );

  const nav = useAgendaNavigation({ workingDayNumbers: config.workingDayNumbers });

  const {
    appointments,
    isLoadingAppointments,
    refetchAppointments,
    blockedSlots,
    refetchBlocked,
    schedules,
    professionals,
  } = useAgendaQueries({
    startDate: nav.startDate,
    endDate: nav.endDate,
    selectedScheduleId,
    canFilterByProfessional,
  });

  const activeSchedules = schedules.filter((s) => s.isActive);
  const selectedSchedule = selectedScheduleId
    ? schedules.find((s) => s.id === selectedScheduleId) ?? null
    : null;

  const scheduleColorMap = useMemo(() => {
    const map = new Map<number, string>();
    schedules.forEach((s) => map.set(s.id, s.color));
    return map;
  }, [schedules]);

  const filteredAppointments = appointments
    .filter((a) => !selectedScheduleId || a.scheduleId === selectedScheduleId)
    .filter((a) => !selectedProfessionalId || a.professionalId === selectedProfessionalId);

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayCompareceu = filteredAppointments.filter(
    (a) => a.date === todayStr && a.status === "compareceu",
  );

  const { quickCheckInId, batchCompleting, handleQuickCheckIn, handleBatchComplete } =
    useAgendaMutations({
      todayCompareceuIds: todayCompareceu.map((a) => a.id),
      refetch: refetchAppointments,
    });

  const selectedAppointment =
    selectedAppointmentId != null
      ? appointments.find((a) => a.id === selectedAppointmentId) ?? null
      : null;

  const handleRefreshAll = () => {
    refetchAppointments();
    refetchBlocked();
    setSelectedAppointmentId(null);
  };

  const getDayAppointments = (day: Date) =>
    filteredAppointments.filter((a) => a.date === format(day, "yyyy-MM-dd"));

  const getDayBlockedSlots = (day: Date) =>
    blockedSlots.filter((b) => b.date === format(day, "yyyy-MM-dd"));

  const handleSlotClick = (date: Date, hour: number, offsetMin = 0) => {
    const clickedMin = hour * 60 + offsetMin;
    const dayAppts = getDayAppointments(date);
    const dayBlocked = getDayBlockedSlots(date);

    const isBlocked = dayBlocked.some(
      (b) => timeToMinutes(b.startTime) <= clickedMin && clickedMin < timeToMinutes(b.endTime),
    );
    if (isBlocked) return;

    const overlapping = dayAppts.filter((apt) => {
      if (["cancelado", "faltou"].includes(apt.status)) return false;
      return timeToMinutes(apt.startTime) <= clickedMin && clickedMin < timeToMinutes(apt.endTime);
    });

    if (overlapping.length > 0) {
      const hasCapacity = overlapping.some((apt) => {
        const maxCap = apt.procedure?.maxCapacity ?? 1;
        if (maxCap <= 1) return false;
        const sameSession = dayAppts.filter(
          (a) =>
            !["cancelado", "faltou"].includes(a.status) &&
            a.procedureId === apt.procedureId &&
            a.startTime === apt.startTime,
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
      <AgendaToolbar
        activeSchedules={activeSchedules}
        selectedScheduleId={selectedScheduleId}
        onSelectScheduleId={setSelectedScheduleId}
        selectedSchedule={selectedSchedule}
        canFilterByProfessional={canFilterByProfessional}
        calendarProfessionals={professionals}
        selectedProfessionalId={selectedProfessionalId}
        onSelectProfessionalId={setSelectedProfessionalId}
        view={nav.view}
        setView={nav.setView}
        weekLabel={nav.weekLabel}
        goToday={nav.goToday}
        goPrev={nav.goPrev}
        goNext={nav.goNext}
        todayCompareceuCount={todayCompareceu.length}
        batchCompleting={batchCompleting}
        onBatchComplete={handleBatchComplete}
        onOpenBlock={() => setIsBlockModalOpen(true)}
        onOpenNew={() => {
          setSelectedSlot(null);
          setIsNewModalOpen(true);
        }}
      />

      <div className="flex gap-4 items-start">
        <div className="hidden lg:block">
          <AgendaSidebar
            currentDate={nav.currentDate}
            miniCalMonth={nav.miniCalMonth}
            onMiniCalMonthChange={nav.setMiniCalMonth}
            onSelectDate={(d) => nav.setCurrentDate(d)}
            weekDays={nav.weekDays}
            activeSchedules={activeSchedules}
          />
        </div>

        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          {nav.view === "month" && (
            <Suspense fallback={<ModalLoader />}>
              <MonthGrid
                currentDate={nav.currentDate}
                appointments={filteredAppointments}
                blockedSlots={blockedSlots}
                onDayClick={(day) => {
                  nav.setCurrentDate(day);
                  nav.setMiniCalMonth(day);
                  nav.setView("day");
                }}
                onNewAppointment={(dateStr) => {
                  setSelectedSlot({ date: dateStr, time: "" });
                  setIsNewModalOpen(true);
                }}
                workingDayNumbers={config.workingDayNumbers}
              />
            </Suspense>
          )}

          {nav.view !== "month" && (
            isLoadingAppointments ? (
              <div className="h-96 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 200px)" }}>
                <div
                  style={{
                    minWidth: nav.daysCount > 1 ? `${56 + nav.daysCount * 96}px` : undefined,
                  }}
                >
                  <div className="sticky top-0 z-20 bg-white">
                    <WeekHeader
                      weekDays={nav.weekDays}
                      daysCount={nav.daysCount}
                      appointments={filteredAppointments}
                      selectedScheduleId={selectedScheduleId}
                      activeSchedules={activeSchedules}
                    />
                  </div>
                  <div
                    className="grid relative"
                    style={{
                      gridTemplateColumns: `56px repeat(${nav.daysCount}, minmax(96px, 1fr))`,
                    }}
                  >
                    <div className="border-r border-slate-200">
                      {config.hours.map((h) => (
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

                    {nav.weekDays.map((day, di) => (
                      <DayColumn
                        key={di}
                        day={day}
                        view={nav.view}
                        appointments={getDayAppointments(day)}
                        blockedSlots={getDayBlockedSlots(day)}
                        schedules={schedules}
                        activeSchedules={activeSchedules}
                        selectedScheduleId={selectedScheduleId}
                        scheduleColorMap={scheduleColorMap}
                        workingDayNumbers={config.workingDayNumbers}
                        effectiveSchedules={config.effectiveSchedules}
                        hours={config.hours}
                        activeHourStart={config.activeHourStart}
                        activeHourEnd={config.activeHourEnd}
                        activeTotalHours={config.activeTotalHours}
                        slotsPerHour={config.slotsPerHour}
                        slotPxHeight={config.slotPxHeight}
                        slotDuration={config.slotDuration}
                        quickCheckInId={quickCheckInId}
                        onSlotClick={handleSlotClick}
                        onAppointmentClick={setSelectedAppointmentId}
                        onEditBlock={setEditingBlock}
                        onQuickCheckIn={handleQuickCheckIn}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      </div>

      <Dialog open={isNewModalOpen} onOpenChange={setIsNewModalOpen}>
        <DialogContent
          className="sm:max-w-[520px] border-none shadow-2xl rounded-3xl max-h-[92dvh] overflow-y-auto"
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              {selectedSlot?.procedureId ? "Adicionar Paciente à Sessão" : "Agendar Consulta"}
            </DialogTitle>
          </DialogHeader>
          <Suspense fallback={<ModalLoader />}>
            <CreateAppointmentForm
              initialDate={selectedSlot?.date}
              initialTime={selectedSlot?.time}
              initialProcedureId={selectedSlot?.procedureId}
              lockProcedure={!!selectedSlot?.procedureId}
              scheduleId={selectedScheduleId ?? undefined}
              clinicStart={String(config.activeHourStart).padStart(2, "0") + ":00"}
              clinicEnd={String(config.activeHourEnd).padStart(2, "0") + ":00"}
              onSuccess={() => {
                setIsNewModalOpen(false);
                refetchAppointments();
              }}
            />
          </Suspense>
        </DialogContent>
      </Dialog>

      {selectedAppointment && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}

      <Suspense fallback={null}>
        <BlockedSlotModal
          open={isBlockModalOpen}
          onOpenChange={setIsBlockModalOpen}
          onSuccess={() => {
            setIsBlockModalOpen(false);
            refetchBlocked();
          }}
          activeSchedules={activeSchedules}
          defaultScheduleId={selectedScheduleId ?? undefined}
        />
      </Suspense>

      {editingBlock && (
        <Suspense fallback={null}>
          <BlockEditDialog
            block={editingBlock}
            onClose={() => setEditingBlock(null)}
            onSuccess={() => {
              setEditingBlock(null);
              refetchBlocked();
            }}
          />
        </Suspense>
      )}
    </AppLayout>
  );
}
