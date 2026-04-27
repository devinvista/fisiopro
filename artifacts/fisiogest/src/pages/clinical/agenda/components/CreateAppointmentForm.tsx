import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Calendar as CalIcon,
  Loader2,
  AlertCircle,
  CheckCircle,
  User,
  Stethoscope,
  Clock,
  Repeat,
  Users,
  ClipboardList,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import {
  useListPatients,
  useListProcedures,
  useCreateAppointment,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/lib/toast";
import { DatePickerPTBR, TimeInputPTBR } from "@/components/ui/date-picker-ptbr";
import {
  appointmentFormSchema,
  recurrenceFormSchema,
  buildAppointmentPayload,
  buildRecurringAppointmentPayload,
} from "@/schemas/appointment.schema";
import { cn } from "@/lib/utils";
import type { TreatmentPlan, PlanProcedureForAgenda } from "../types";
import { PatientStep } from "./create-appointment/PatientStep";
import { ProcedureSelector } from "./create-appointment/ProcedureSelector";
import { RecurrenceSection } from "./create-appointment/RecurrenceSection";

export function CreateAppointmentForm({
  initialDate,
  initialTime,
  initialProcedureId,
  lockProcedure = false,
  scheduleId,
  clinicStart,
  clinicEnd,
  onSuccess,
}: {
  initialDate?: string;
  initialTime?: string;
  initialProcedureId?: number;
  lockProcedure?: boolean;
  scheduleId?: number;
  clinicStart?: string;
  clinicEnd?: string;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [patientSearch, setPatientSearch] = useState("");

  const { hasRole, hasPermission, user } = useAuth();
  const isProfissional = hasRole("profissional") && !hasPermission("users.manage") && !hasRole("secretaria");
  const canSelectProfessional = hasPermission("users.manage") || hasRole("secretaria");

  const { data: professionals = [] } = useQuery<{ id: number; name: string; roles: string[] }[]>({
    queryKey: ["professionals"],
    queryFn: () => apiFetch("/api/users/professionals", { credentials: "include" }).then((r) => r.json()),
    staleTime: 60_000,
    enabled: canSelectProfessional,
    select: (data) => data.filter((u) => u.roles.includes("profissional")),
  });

  const [formData, setFormData] = useState(() => {
    const defaultProfessionalId = isProfissional && user ? String((user as any).id ?? "") : "";
    return {
      patientId: "",
      procedureId: initialProcedureId ? String(initialProcedureId) : "",
      date: initialDate || format(new Date(), "yyyy-MM-dd"),
      startTime: initialTime || "",
      notes: "",
      professionalId: defaultProfessionalId,
    };
  });

  useEffect(() => {
    if (canSelectProfessional && professionals.length === 1) {
      setFormData((prev) => ({ ...prev, professionalId: String(professionals[0].id) }));
    }
  }, [professionals, canSelectProfessional]);

  // Recurring
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurDays, setRecurDays] = useState<number[]>(() => {
    if (initialDate) {
      const dow = new Date(initialDate + "T12:00:00").getDay();
      return [dow];
    }
    return [];
  });
  const [recurSessions, setRecurSessions] = useState(8);
  const [recurPending, setRecurPending] = useState(false);

  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(patientSearch.trim()), 250);
    return () => clearTimeout(t);
  }, [patientSearch]);

  const { data: patients } = useListPatients({
    limit: 50,
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
  } as any);
  const { data: procedures } = useListProcedures();
  const mutation = useCreateAppointment();
  const { toast } = useToast();

  // ── Agenda obrigatória ────────────────────────────────────────
  const { data: availableSchedules = [] } = useQuery<{ id: number; name: string; isActive?: boolean }[]>({
    queryKey: ["schedules"],
    queryFn: () => apiFetch("/api/schedules").then((r) => r.json()),
    staleTime: 60_000,
    enabled: !scheduleId,
  });
  const activeSchedules = useMemo(
    () => availableSchedules.filter((s) => s.isActive !== false),
    [availableSchedules],
  );
  const [internalScheduleId, setInternalScheduleId] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (!scheduleId && internalScheduleId === undefined && activeSchedules.length === 1) {
      setInternalScheduleId(activeSchedules[0].id);
    }
  }, [scheduleId, internalScheduleId, activeSchedules]);
  const effectiveScheduleId = scheduleId ?? internalScheduleId;
  const needsScheduleSelector = !scheduleId && activeSchedules.length > 1;

  // Quando um paciente é selecionado, buscamos individualmente para garantir
  // que ele apareça em `selectedPatient` mesmo se a lista atual (filtrada/paginada)
  // não o contiver.
  const { data: selectedPatientFetched } = useQuery({
    queryKey: ["patient-detail-min", formData.patientId],
    queryFn: async () => {
      const res = await apiFetch(`/api/patients/${formData.patientId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!formData.patientId,
    staleTime: 60_000,
  });

  const selectedPatient = useMemo(() => {
    const fromList = patients?.data?.find((p) => p.id === Number(formData.patientId));
    return fromList ?? selectedPatientFetched ?? undefined;
  }, [patients, formData.patientId, selectedPatientFetched]);

  const filteredPatients = useMemo(() => {
    return patients?.data ?? [];
  }, [patients]);

  const { data: treatmentPlan } = useQuery<TreatmentPlan | null>({
    queryKey: ["treatment-plan", formData.patientId],
    queryFn: async () => {
      const res = await apiFetch(`/api/medical-records/${formData.patientId}/treatment-plan`, { credentials: "include" });
      if (res.status === 404) return null;
      return res.json();
    },
    enabled: !!formData.patientId,
    staleTime: 60_000,
  });

  const { data: planProcedures = [] } = useQuery<PlanProcedureForAgenda[]>({
    queryKey: ["treatment-plan-procedures-agenda", treatmentPlan?.id],
    queryFn: () =>
      apiFetch(`/api/treatment-plans/${treatmentPlan!.id}/procedures`).then((r) => r.json()),
    enabled: !!treatmentPlan?.id && treatmentPlan.status === "ativo",
    staleTime: 60_000,
    select: (data) =>
      data.filter((item: PlanProcedureForAgenda) => item.procedureId != null),
  });

  const { data: lastAppointments } = useQuery<{ procedureId: number | null }[]>({
    queryKey: ["last-appointments", formData.patientId],
    queryFn: async () => {
      const res = await apiFetch(
        `/api/appointments?patientId=${formData.patientId}`
      );
      return res.json();
    },
    enabled: !!formData.patientId,
    staleTime: 60_000,
  });

  const lastProcedureId = useMemo(() => {
    if (!lastAppointments || !Array.isArray(lastAppointments)) return null;
    const first = lastAppointments[0];
    return first?.procedureId ?? null;
  }, [lastAppointments]);

  const selectedProcedure = useMemo(
    () => procedures?.find((p) => p.id === Number(formData.procedureId)),
    [procedures, formData.procedureId]
  );

  const canFetchSlots = !!(formData.date && formData.procedureId && effectiveScheduleId);
  const { data: slotsData, isFetching: slotsFetching } = useQuery({
    queryKey: ["available-slots", formData.date, formData.procedureId, effectiveScheduleId ?? null],
    queryFn: async () => {
      const params = new URLSearchParams({
        date: formData.date,
        procedureId: formData.procedureId,
      });
      if (effectiveScheduleId) {
        params.set("scheduleId", String(effectiveScheduleId));
      } else {
        params.set("clinicStart", clinicStart || "07:00");
        params.set("clinicEnd", clinicEnd || "20:00");
      }
      const res = await apiFetch(`/api/appointments/available-slots?${params}`, {
        credentials: "include",
      });
      return res.json();
    },
    enabled: canFetchSlots,
    staleTime: 30_000,
  });

  const availableSlots = (slotsData?.slots ?? []) as { time: string; available: boolean; spotsLeft: number }[];
  const isNotWorkingDay = !!(slotsData as any)?.notWorkingDay;

  const slotsWithCurrentTime = useMemo(() => {
    if (!formData.startTime || availableSlots.some((s) => s.time === formData.startTime)) {
      return availableSlots;
    }
    return [{ time: formData.startTime, available: true, spotsLeft: 99 }, ...availableSlots];
  }, [availableSlots, formData.startTime]);

  const computedEndTime = useMemo(() => {
    if (!formData.startTime || !selectedProcedure) return null;
    const [h, m] = formData.startTime.split(":").map(Number);
    const total = h * 60 + m + selectedProcedure.durationMinutes;
    return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }, [formData.startTime, selectedProcedure]);

  const toggleRecurDay = (dow: number) => {
    setRecurDays((prev) =>
      prev.includes(dow) ? prev.filter((d) => d !== dow) : [...prev, dow]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = appointmentFormSchema.safeParse(formData);
    if (!parsed.success) {
      toast({ variant: "destructive", title: parsed.error.issues[0]?.message ?? "Dados inválidos" });
      return;
    }
    if (!effectiveScheduleId) {
      toast({ variant: "destructive", title: "Selecione uma agenda antes de continuar." });
      return;
    }
    if (canSelectProfessional && professionals.length > 1 && !parsed.data.professionalId) {
      toast({ variant: "destructive", title: "Selecione o profissional atendente." });
      return;
    }

    if (isRecurring) {
      const parsedRecur = recurrenceFormSchema.safeParse({
        daysOfWeek: recurDays,
        totalSessions: recurSessions,
      });
      if (!parsedRecur.success) {
        toast({ variant: "destructive", title: parsedRecur.error.issues[0]?.message ?? "Recorrência inválida" });
        return;
      }
      setRecurPending(true);
      try {
        const res = await apiFetch("/api/appointments/recurring", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(
            buildRecurringAppointmentPayload(
              { values: parsed.data, canSelectProfessional, scheduleId: effectiveScheduleId },
              parsedRecur.data,
            ),
          ),
        });
        const data = await res.json();
        if (!res.ok) {
          toast({ variant: "destructive", title: "Erro ao criar recorrência", description: data.message || "Erro desconhecido." });
        } else {
          const skippedMsg = data.skipped > 0 ? ` (${data.skipped} horário(s) com conflito foram pulados)` : "";
          toast({
            title: `${data.created} sessão(ões) agendada(s)!`,
            description: `Recorrência criada com sucesso.${skippedMsg}`,
          });
          onSuccess();
        }
      } catch {
        toast({ variant: "destructive", title: "Erro ao criar recorrência." });
      } finally {
        setRecurPending(false);
      }
      return;
    }

    mutation.mutate(
      {
        data: buildAppointmentPayload({
          values: parsed.data,
          canSelectProfessional,
          scheduleId: effectiveScheduleId,
        }) as Parameters<typeof mutation.mutate>[0]["data"],
      },
      {
        onSuccess: () => {
          toast({ title: "Agendado!", description: "Consulta marcada com sucesso." });
          onSuccess();
        },
        onError: (err: any) => {
          const msg = err?.data?.message || err?.message || "Conflito de horário.";
          toast({ variant: "destructive", title: "Erro ao agendar", description: msg });
        },
      }
    );
  };

  const isBusy = mutation.isPending || recurPending;
  const hasActivePlan = treatmentPlan && treatmentPlan.status === "ativo";

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      {/* ── Step indicators ── */}
      <div className="flex items-center gap-2 pb-1">
        <div className={cn(
          "flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full transition-colors",
          step === 1 ? "bg-primary text-white" : "bg-emerald-100 text-emerald-700"
        )}>
          {step === 1 ? <User className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
          Paciente
        </div>
        <div className="h-px flex-1 bg-slate-200" />
        <div className={cn(
          "flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full transition-colors",
          step === 2 ? "bg-primary text-white" : "bg-slate-100 text-slate-400"
        )}>
          <Stethoscope className="w-3 h-3" />
          Consulta
        </div>
      </div>

      {/* ══════════════════════════════════════ STEP 1: PACIENTE ══ */}
      {step === 1 && (
        <PatientStep
          patientSearch={patientSearch}
          setPatientSearch={setPatientSearch}
          filteredPatients={filteredPatients as any}
          selectedPatientId={formData.patientId}
          onSelect={(id) => setFormData({
            ...formData,
            patientId: id,
            procedureId: lockProcedure ? formData.procedureId : "",
          })}
          selectedPatient={selectedPatient as any}
          hasActivePlan={!!hasActivePlan}
          treatmentPlan={treatmentPlan}
          onContinue={() => setStep(2)}
          canContinue={!!formData.patientId}
        />
      )}

      {/* ══════════════════════════════════════ STEP 2: CONSULTA ══ */}
      {step === 2 && (
        <>
          {/* Patient summary bar */}
          <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
            <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-white">{selectedPatient?.name.charAt(0).toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{selectedPatient?.name}</p>
              {hasActivePlan && (
                <p className="text-[10px] text-teal-600 font-semibold flex items-center gap-1">
                  <ClipboardList className="w-3 h-3" /> Plano ativo
                </p>
              )}
            </div>
            <button
              type="button"
              className="text-xs text-slate-400 hover:text-primary underline underline-offset-2 shrink-0"
              onClick={() => setStep(1)}
            >
              Trocar
            </button>
          </div>

          {/* ── Agenda (obrigatória quando há mais de uma) ── */}
          {needsScheduleSelector && (
            <div className="space-y-1.5">
              <Label>Agenda *</Label>
              <Select
                value={internalScheduleId ? String(internalScheduleId) : ""}
                onValueChange={(v) => {
                  setInternalScheduleId(Number(v));
                  setFormData((prev) => ({ ...prev, startTime: "" }));
                }}
              >
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder="Selecione a agenda..." />
                </SelectTrigger>
                <SelectContent>
                  {activeSchedules.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* ── Data + Horário (always shown first) ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data *</Label>
              <DatePickerPTBR
                value={formData.date}
                onChange={(v) => {
                  const dow = new Date(v + "T12:00:00").getDay();
                  setFormData({ ...formData, date: v, startTime: "" });
                  if (isRecurring && recurDays.length === 0) setRecurDays([dow]);
                }}
                className="h-11 rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Horário *</Label>
              {canFetchSlots ? (
                <div>
                  {slotsFetching ? (
                    <div className="h-11 rounded-xl border border-slate-200 flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                      {formData.startTime && (
                        <span className="text-xs text-slate-500">{formData.startTime}</span>
                      )}
                    </div>
                  ) : isNotWorkingDay ? (
                    <div className="h-11 rounded-xl border border-amber-200 bg-amber-50 flex items-center justify-center gap-2 px-3">
                      <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                      <span className="text-xs text-amber-700 font-medium">Dia fora do horário desta agenda</span>
                    </div>
                  ) : (
                    <Select value={formData.startTime} onValueChange={(v) => setFormData({ ...formData, startTime: v })}>
                      <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {slotsWithCurrentTime.filter(s => s.available).map((s) => (
                          <SelectItem key={s.time} value={s.time}>
                            {s.time}{s.spotsLeft < 99 ? ` · ${s.spotsLeft} vaga(s)` : ""}
                          </SelectItem>
                        ))}
                        {slotsWithCurrentTime.filter(s => !s.available).length > 0 && (
                          <>
                            <div className="px-2 py-1 text-[10px] text-slate-400 font-medium uppercase tracking-wider border-t border-slate-100 mt-1">Indisponíveis</div>
                            {slotsWithCurrentTime.filter(s => !s.available).map((s) => (
                              <SelectItem key={s.time} value={s.time} disabled>
                                {s.time} · Lotado
                              </SelectItem>
                            ))}
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  )}
                  {formData.startTime && computedEndTime && !isNotWorkingDay && (
                    <p className="text-xs text-slate-500 mt-1 pl-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Término: {computedEndTime}
                    </p>
                  )}
                </div>
              ) : (
                <TimeInputPTBR
                  value={formData.startTime}
                  onChange={(v) => setFormData({ ...formData, startTime: v })}
                  className="h-11 rounded-xl"
                />
              )}
            </div>
          </div>

          {/* ── Procedimento ── */}
          <ProcedureSelector
            lockProcedure={lockProcedure}
            selectedProcedure={selectedProcedure as any}
            procedures={procedures as any}
            planProcedures={planProcedures}
            selectedProcedureId={formData.procedureId}
            onSelect={(id) => setFormData({ ...formData, procedureId: id })}
            lastProcedureId={lastProcedureId}
          />
          {/* Profissional — only for admin/secretary when clinic has multiple professionals */}
          {canSelectProfessional && professionals.length > 1 && (
            <div className="space-y-1.5">
              <Label>Profissional *</Label>
              <Select
                value={formData.professionalId}
                onValueChange={(v) => setFormData({ ...formData, professionalId: v })}
              >
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder="Selecione o profissional..." />
                </SelectTrigger>
                <SelectContent>
                  {professionals.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {canSelectProfessional && professionals.length === 1 && (
            <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2.5 text-sm text-slate-600">
              <User className="w-4 h-4 text-slate-400 shrink-0" />
              <span>Profissional: <span className="font-semibold">{professionals[0].name}</span></span>
            </div>
          )}
          {isProfissional && user && (
            <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-xl px-3 py-2.5 text-sm text-slate-600">
              <User className="w-4 h-4 text-primary shrink-0" />
              <span>Atendente: <span className="font-semibold text-primary">{(user as any).name ?? "Você"}</span></span>
            </div>
          )}

          {/* Observações */}
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea
              placeholder="Queixas, observações clínicas..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="rounded-xl resize-none"
              rows={2}
            />
          </div>

          {/* Recorrência toggle — hidden when adding to an existing session */}
          {!lockProcedure && (
            <RecurrenceSection
              isRecurring={isRecurring}
              setIsRecurring={setIsRecurring}
              recurDays={recurDays}
              toggleRecurDay={toggleRecurDay}
              recurSessions={recurSessions}
              setRecurSessions={setRecurSessions}
              date={formData.date}
              startTime={formData.startTime}
            />
          )}

          <Button
            type="submit"
            className="w-full h-11 rounded-xl shadow-lg shadow-primary/20"
            disabled={!formData.patientId || !formData.procedureId || !formData.startTime || isBusy}
          >
            {isBusy ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" /> {lockProcedure ? "Adicionando..." : isRecurring ? "Criando recorrência..." : "Agendando..."}</>
            ) : lockProcedure ? (
              <><Users className="w-4 h-4 mr-2" /> Adicionar à Sessão</>
            ) : isRecurring ? (
              <><Repeat className="w-4 h-4 mr-2" /> Criar {recurSessions} sessão(ões) recorrente(s)</>
            ) : (
              <><CalIcon className="w-4 h-4 mr-2" /> Confirmar Agendamento</>
            )}
          </Button>
        </>
      )}
    </form>
  );
}
