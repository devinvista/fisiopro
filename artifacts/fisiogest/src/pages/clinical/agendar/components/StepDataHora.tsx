import { formatCpfMask, formatPhoneMask, todayBRT, formatCurrency, formatDateBR, lookupPatient } from "../helpers";
import { BASE, CATEGORY_ICONS, STATUS_LABELS } from "../constants";
import { PublicProcedure, TimeSlot, PublicSchedule, BookingConfirmation, BookingDetails, PatientLookupResult, PatientFormData } from "../types";
import { BookingView, ProcedureCard, StepConfirmacao, StepIndicator, StepProcedimento, StepSeusDados } from "./";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Calendar,
  Clock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  User,
  Phone,
  Mail,
  FileText,
  XCircle,
  AlertCircle,
  Dumbbell,
  Link2,
  Copy,
  Check,
  Star,
  Sparkles,
  UserCheck,
  UserPlus,
  ClipboardList,
} from "lucide-react";
import { format, addDays, isBefore, startOfToday, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import LogoMark from "@/components/logo-mark";

// ── Step 2: Selecionar Data e Horário ─────────────────────────────────────────

export function StepDataHora({
  procedure,
  onSelect,
  onBack,
  submitting,
  clinicId,
}: {
  procedure: PublicProcedure;
  onSelect: (date: string, time: string, scheduleId: number | null) => void;
  onBack: () => void;
  submitting?: boolean;
  clinicId?: number | null;
}) {
  const today = startOfToday();
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Schedule selection
  const [schedules, setSchedules] = useState<PublicSchedule[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState<PublicSchedule | null>(null);
  const [loadingSchedules, setLoadingSchedules] = useState(false);

  // Fetch active schedules for the clinic
  useEffect(() => {
    if (!clinicId) return;
    setLoadingSchedules(true);
    fetch(`${BASE}/api/public/schedules?clinicId=${clinicId}`)
      .then((r) => r.json())
      .then((data: PublicSchedule[]) => {
        if (Array.isArray(data)) {
          setSchedules(data);
          // Auto-select if only one schedule
          if (data.length === 1) setSelectedSchedule(data[0]);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingSchedules(false));
  }, [clinicId]);

  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i + 1));

  useEffect(() => {
    if (!selectedDate) return;
    // Wait for schedules to finish loading before fetching slots
    if (clinicId && loadingSchedules) return;
    // Wait for schedule selection when multiple exist
    if (clinicId && schedules.length > 1 && !selectedSchedule) return;

    const dateStr = format(selectedDate, "yyyy-MM-dd");
    setLoadingSlots(true);
    setSlots([]);
    setSelectedTime(null);
    setError(null);

    const params = new URLSearchParams({ date: dateStr, procedureId: String(procedure.id) });
    if (clinicId) params.set("clinicId", String(clinicId));
    if (selectedSchedule) params.set("scheduleId", String(selectedSchedule.id));

    fetch(`${BASE}/api/public/available-slots?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.slots) {
          setSlots(data.slots);
        } else {
          setError("Não foi possível carregar os horários.");
        }
      })
      .catch(() => setError("Erro de conexão ao buscar horários."))
      .finally(() => setLoadingSlots(false));
  }, [selectedDate, procedure.id, clinicId, selectedSchedule, schedules.length, loadingSchedules]);

  return (
    <div>
      <h2 className="text-xl font-bold text-slate-800 mb-1">Escolha a Data e Horário</h2>
      <p className="text-slate-500 text-sm mb-6">
        Procedimento: <strong className="text-primary">{procedure.name}</strong> — {procedure.durationMinutes} min
      </p>

      {/* Schedule selector — only shown when clinic has multiple active schedules */}
      {loadingSchedules && (
        <div className="flex items-center gap-2 text-slate-400 text-sm mb-6">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Carregando agendas...</span>
        </div>
      )}
      {!loadingSchedules && schedules.length > 1 && (
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Escolha a agenda</p>
          <div className="flex flex-col gap-2">
            {schedules.map((sched) => {
              const isSelected = selectedSchedule?.id === sched.id;
              return (
                <button
                  key={sched.id}
                  onClick={() => {
                    setSelectedSchedule(sched);
                    setSlots([]);
                    setSelectedTime(null);
                  }}
                  className={`flex items-start gap-3 p-4 rounded-2xl border-2 text-left transition-all ${
                    isSelected
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-slate-200 bg-white hover:border-primary/40"
                  }`}
                >
                  <span
                    className="mt-1 w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: sched.color || "#6366f1" }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-sm ${isSelected ? "text-primary" : "text-slate-700"}`}>
                      {sched.name}
                    </p>
                    {sched.description && (
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{sched.description}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-0.5">
                      {sched.startTime.slice(0, 5)} – {sched.endTime.slice(0, 5)} · {sched.slotDurationMinutes} min por slot
                    </p>
                  </div>
                  {isSelected && (
                    <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Calendar strip — only show after schedule is selected (or no schedule needed) */}
      {(!clinicId || !loadingSchedules) && (schedules.length <= 1 || selectedSchedule) && (
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Selecione a data</p>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {days.map((day) => {
            const isSelected = selectedDate && format(day, "yyyy-MM-dd") === format(selectedDate, "yyyy-MM-dd");
            const dayName = format(day, "EEE", { locale: ptBR });
            const dayNum = format(day, "d");
            const monthName = format(day, "MMM", { locale: ptBR });
            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDate(day)}
                className={`flex flex-col items-center min-w-[60px] p-3 rounded-2xl border-2 transition-all shrink-0
                  ${isSelected
                    ? "border-primary bg-primary text-white shadow-md"
                    : "border-slate-200 bg-white hover:border-primary/40"}`}
              >
                <span className={`text-[10px] font-bold uppercase tracking-wide ${isSelected ? "text-white/80" : "text-slate-400"}`}>
                  {dayName}
                </span>
                <span className={`text-xl font-bold leading-none mt-1 ${isSelected ? "text-white" : "text-slate-700"}`}>
                  {dayNum}
                </span>
                <span className={`text-[10px] mt-0.5 capitalize ${isSelected ? "text-white/80" : "text-slate-400"}`}>
                  {monthName}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      )}

      {/* Time slots */}
      {selectedDate && (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
            Horários disponíveis — {formatDateBR(format(selectedDate, "yyyy-MM-dd"))}
          </p>
          {loadingSlots ? (
            <div className="flex items-center justify-center py-8 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="text-slate-500 text-sm">Verificando horários...</span>
            </div>
          ) : error ? (
            <div className="text-center py-6 text-red-600 text-sm">{error}</div>
          ) : slots.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>Nenhum horário disponível para esta data</p>
              <p className="text-xs mt-1">Tente outra data</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {slots.map((slot) => (
                <button
                  key={slot.time}
                  disabled={!slot.available}
                  onClick={() => setSelectedTime(slot.time)}
                  className={`py-2.5 px-2 rounded-xl text-sm font-semibold border-2 transition-all
                    ${!slot.available
                      ? "opacity-40 cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                      : selectedTime === slot.time
                      ? "border-primary bg-primary text-white shadow-md"
                      : "border-slate-200 bg-white hover:border-primary/50 text-slate-700"}`}
                >
                  {slot.time}
                </button>
              ))}
            </div>
          )}
          {procedure.maxCapacity > 1 && slots.some((s) => s.spotsLeft > 0 && s.spotsLeft < procedure.maxCapacity) && (
            <p className="text-xs text-amber-600 mt-3 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              Alguns horários têm vagas limitadas
            </p>
          )}
        </div>
      )}

      <div className="mt-8 flex justify-between">
        <Button variant="outline" onClick={onBack} disabled={submitting} className="rounded-xl h-11 gap-2">
          <ChevronLeft className="w-4 h-4" /> Voltar
        </Button>
        <Button
          disabled={!selectedDate || !selectedTime || submitting}
          onClick={() => selectedDate && selectedTime && onSelect(format(selectedDate, "yyyy-MM-dd"), selectedTime, selectedSchedule?.id ?? null)}
          className="rounded-xl h-11 px-8 gap-2"
        >
          {submitting ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Confirmando...</>
          ) : (
            <><CheckCircle2 className="w-4 h-4" /> Confirmar Agendamento</>
          )}
        </Button>
      </div>
    </div>
  );
}

