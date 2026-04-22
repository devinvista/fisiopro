import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Calendar as CalIcon,
  Loader2,
  CheckCircle,
  AlertCircle,
  User,
  Stethoscope,
  Clock,
  Repeat,
  Users,
  Sparkles,
  History,
  ArrowRight,
  ClipboardList,
} from "lucide-react";
import { apiFetch } from "@/utils/api";
import {
  useListPatients,
  useListProcedures,
  useCreateAppointment,
} from "@workspace/api-client-react";
import { useAuth } from "@/utils/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { DatePickerPTBR, TimeInputPTBR } from "@/components/ui/date-picker-ptbr";
import { cn } from "@/utils/utils";
import { DAYS_OF_WEEK } from "../constants";
import type { TreatmentPlan, PlanProcedureForAgenda } from "../types";

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

  const { data: patients } = useListPatients({ limit: 1000 });
  const { data: procedures } = useListProcedures();
  const mutation = useCreateAppointment();
  const { toast } = useToast();

  const selectedPatient = useMemo(
    () => patients?.data?.find((p) => p.id === Number(formData.patientId)),
    [patients, formData.patientId]
  );

  const filteredPatients = useMemo(() => {
    if (!patients?.data) return [];
    if (!patientSearch.trim()) return patients.data;
    const q = patientSearch.toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    return patients.data.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.phone && p.phone.replace(/\D/g, "").includes(qDigits || q)) ||
        (p.cpf && qDigits && p.cpf.replace(/\D/g, "").includes(qDigits))
    );
  }, [patients, patientSearch]);

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

  const canFetchSlots = !!(formData.date && formData.procedureId);
  const { data: slotsData, isFetching: slotsFetching } = useQuery({
    queryKey: ["available-slots", formData.date, formData.procedureId, scheduleId ?? null],
    queryFn: async () => {
      const params = new URLSearchParams({
        date: formData.date,
        procedureId: formData.procedureId,
      });
      if (scheduleId) {
        params.set("scheduleId", String(scheduleId));
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
    if (!formData.startTime) {
      toast({ variant: "destructive", title: "Selecione um horário." });
      return;
    }
    if (canSelectProfessional && professionals.length > 1 && !formData.professionalId) {
      toast({ variant: "destructive", title: "Selecione o profissional atendente." });
      return;
    }

    const professionalIdPayload = canSelectProfessional && formData.professionalId
      ? { professionalId: Number(formData.professionalId) }
      : {};

    if (isRecurring) {
      if (recurDays.length === 0) {
        toast({ variant: "destructive", title: "Selecione ao menos um dia da semana." });
        return;
      }
      if (recurSessions < 1 || recurSessions > 100) {
        toast({ variant: "destructive", title: "Número de sessões deve ser entre 1 e 100." });
        return;
      }
      setRecurPending(true);
      try {
        const res = await apiFetch("/api/appointments/recurring", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            patientId: Number(formData.patientId),
            procedureId: Number(formData.procedureId),
            date: formData.date,
            startTime: formData.startTime,
            notes: formData.notes || undefined,
            recurrence: { daysOfWeek: recurDays, totalSessions: recurSessions },
            ...(scheduleId ? { scheduleId } : {}),
            ...professionalIdPayload,
          }),
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
        data: {
          patientId: Number(formData.patientId),
          procedureId: Number(formData.procedureId),
          date: formData.date,
          startTime: formData.startTime,
          notes: formData.notes || undefined,
          ...(scheduleId ? { scheduleId } : {}),
          ...professionalIdPayload,
        } as any,
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
        <div className="space-y-3">
          {/* Search */}
          <div className="space-y-1.5">
            <Label>Buscar paciente *</Label>
            <Input
              placeholder="Nome, telefone ou CPF..."
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
              className="h-11 rounded-xl"
              autoFocus
            />
          </div>

          {/* Patient list */}
          <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-0.5">
            {filteredPatients.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-6">Nenhum paciente encontrado.</p>
            )}
            {filteredPatients.map((p) => {
              const isSelected = formData.patientId === p.id.toString();
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setFormData({
                      ...formData,
                      patientId: p.id.toString(),
                      procedureId: lockProcedure ? formData.procedureId : "",
                    });
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all",
                    isSelected
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold",
                    isSelected ? "bg-primary text-white" : "bg-slate-100 text-slate-500"
                  )}>
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{p.name}</p>
                    {p.phone && <p className="text-xs text-slate-400 truncate">{p.phone}</p>}
                  </div>
                  {isSelected && <CheckCircle className="w-4 h-4 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>

          {/* Selected patient summary + plan info */}
          {selectedPatient && (
            <div className="space-y-2">
              {hasActivePlan && (
                <div className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2.5 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <ClipboardList className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                    <span className="text-xs font-bold text-teal-700">Plano de Tratamento Ativo</span>
                  </div>
                  {treatmentPlan?.frequency && (
                    <p className="text-xs text-teal-600">
                      <span className="font-semibold">Frequência:</span> {treatmentPlan.frequency}
                    </p>
                  )}
                  {treatmentPlan?.objectives && (
                    <p className="text-xs text-teal-600 line-clamp-2">
                      <span className="font-semibold">Objetivos:</span> {treatmentPlan.objectives}
                    </p>
                  )}
                  {treatmentPlan?.techniques && (
                    <p className="text-xs text-teal-600 line-clamp-2">
                      <span className="font-semibold">Técnicas:</span> {treatmentPlan.techniques}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <Button
            type="button"
            className="w-full h-11 rounded-xl shadow-md shadow-primary/20"
            disabled={!formData.patientId}
            onClick={() => setStep(2)}
          >
            Continuar <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
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

          {/* ── Data + Horário (always shown first) ── */}
          <div className="grid grid-cols-2 gap-3">
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
          {lockProcedure && selectedProcedure ? (
            <div className="flex items-center gap-3 px-3 py-3 rounded-xl border border-violet-200 bg-violet-50">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-violet-100 text-violet-600">
                <Users className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">{selectedProcedure.name}</p>
                <p className="text-xs text-violet-600">
                  {selectedProcedure.durationMinutes} min
                  {selectedProcedure.maxCapacity > 1 ? ` · até ${selectedProcedure.maxCapacity} simultâneos` : ""}
                </p>
              </div>
              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-violet-200 text-violet-700 shrink-0">Sessão em grupo</span>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Procedimento *</Label>
              <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-0.5">

                {/* Plan procedures shown first */}
                {planProcedures.length > 0 && (
                  <>
                    <div className="flex items-center gap-1.5 px-1 pt-0.5">
                      <ClipboardList className="w-3 h-3 text-teal-600" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-teal-600">Do plano de tratamento</span>
                    </div>
                    {planProcedures.map((item) => {
                      const proc = procedures?.find((p) => p.id === item.procedureId);
                      if (!proc) return null;
                      const isSelected = formData.procedureId === proc.id.toString();
                      const isGroup = proc.maxCapacity > 1;
                      return (
                        <button
                          key={`plan-${item.id}`}
                          type="button"
                          onClick={() => setFormData({ ...formData, procedureId: proc.id.toString() })}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all",
                            isSelected
                              ? "border-teal-500 bg-teal-50 shadow-sm"
                              : "border-teal-200 bg-teal-50/50 hover:border-teal-400 hover:bg-teal-50"
                          )}
                        >
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                            isSelected ? "bg-teal-500 text-white" : "bg-teal-100 text-teal-600"
                          )}>
                            {isGroup ? <Users className="w-4 h-4" /> : <Stethoscope className="w-4 h-4" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-semibold text-slate-800">{proc.name}</span>
                              <span className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700">
                                <Sparkles className="w-2.5 h-2.5" /> Plano
                              </span>
                              {lastProcedureId === proc.id && (
                                <span className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                  <History className="w-2.5 h-2.5" /> Última sessão
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400">
                              {proc.durationMinutes} min
                              {isGroup ? ` · até ${proc.maxCapacity} simultâneos` : ""}
                            </p>
                          </div>
                          {isSelected && <CheckCircle className="w-4 h-4 text-teal-500 shrink-0" />}
                        </button>
                      );
                    })}
                    <div className="flex items-center gap-1.5 px-1 pt-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Outros procedimentos</span>
                    </div>
                  </>
                )}

                {/* All other procedures */}
                {procedures
                  ?.filter((p) => !planProcedures.some((pp) => pp.procedureId === p.id))
                  .map((p) => {
                    const isSelected = formData.procedureId === p.id.toString();
                    const isLast = lastProcedureId === p.id;
                    const isGroup = p.maxCapacity > 1;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setFormData({ ...formData, procedureId: p.id.toString() })}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all",
                          isSelected
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                        )}
                      >
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                          isSelected ? "bg-primary text-white" : isGroup ? "bg-violet-100 text-violet-600" : "bg-slate-100 text-slate-500"
                        )}>
                          {isGroup ? <Users className="w-4 h-4" /> : <Stethoscope className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-semibold text-slate-800">{p.name}</span>
                            {isLast && (
                              <span className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                <History className="w-2.5 h-2.5" /> Última sessão
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400">
                            {p.durationMinutes} min
                            {isGroup ? ` · até ${p.maxCapacity} simultâneos` : ""}
                          </p>
                        </div>
                        {isSelected && <CheckCircle className="w-4 h-4 text-primary shrink-0" />}
                      </button>
                    );
                  })}
              </div>
              {selectedProcedure && (
                <p className="text-xs text-slate-500 flex items-center gap-1 pl-1">
                  <Clock className="w-3 h-3" />
                  {selectedProcedure.durationMinutes} min
                  {selectedProcedure.maxCapacity > 1 && ` · até ${selectedProcedure.maxCapacity} simultâneos`}
                </p>
              )}
            </div>
          )}

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
            <div className="rounded-2xl border border-slate-200 overflow-hidden">
              <div
                role="button"
                tabIndex={0}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer select-none"
                onClick={() => setIsRecurring((v) => !v)}
                onKeyDown={(e) => e.key === "Enter" || e.key === " " ? setIsRecurring((v) => !v) : undefined}
              >
                <div className="flex items-center gap-2">
                  <Repeat className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-slate-700">Agendamento recorrente</span>
                </div>
                {/* Pure CSS toggle — no Radix inside Dialog */}
                <div className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors pointer-events-none",
                  isRecurring ? "bg-primary" : "bg-input"
                )}>
                  <span className={cn(
                    "block h-4 w-4 rounded-full bg-background shadow-lg transition-transform",
                    isRecurring ? "translate-x-4" : "translate-x-0"
                  )} />
                </div>
              </div>

              {isRecurring && (
                <div className="px-4 pb-4 pt-1 space-y-3 border-t border-slate-100 bg-slate-50/60">
                  <p className="text-xs text-slate-500">
                    Cria automaticamente todas as sessões com o mesmo horário nos dias selecionados, a partir da data escolhida.
                  </p>

                  {/* Days of week */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Dias da semana *</Label>
                    <div className="flex gap-1.5 flex-wrap">
                      {DAYS_OF_WEEK.map((d) => (
                        <button
                          key={d.value}
                          type="button"
                          onClick={() => toggleRecurDay(d.value)}
                          className={cn(
                            "w-10 h-9 rounded-lg text-xs font-semibold transition-all border",
                            recurDays.includes(d.value)
                              ? "bg-primary text-white border-primary shadow-sm"
                              : "bg-white text-slate-600 border-slate-200 hover:border-primary"
                          )}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Total sessions */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Total de sessões *</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={recurSessions}
                        onChange={(e) => setRecurSessions(Number(e.target.value))}
                        className="h-9 w-24 rounded-xl text-sm"
                      />
                      <span className="text-xs text-slate-500">sessões · a partir de {formData.date ? format(new Date(formData.date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR }) : "—"}</span>
                    </div>
                  </div>

                  {recurDays.length > 0 && recurSessions > 0 && (
                    <div className="flex items-center gap-1.5 bg-primary/5 rounded-xl px-3 py-2">
                      <Repeat className="w-3 h-3 text-primary shrink-0" />
                      <p className="text-xs text-primary font-medium">
                        {recurSessions} sessão(ões) toda(s){" "}
                        {recurDays.map((d) => DAYS_OF_WEEK.find((x) => x.value === d)?.label).join(", ")}{" "}
                        às {formData.startTime || "—"}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
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
