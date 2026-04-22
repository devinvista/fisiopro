import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Loader2,
  Pencil,
  Trash2,
  Repeat,
  Lock,
  Ban,
  CalendarDays,
} from "lucide-react";
import { apiFetch } from "@/utils/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { DatePickerPTBR, TimeInputPTBR } from "@/components/ui/date-picker-ptbr";
import { useToast } from "@/hooks/use-toast";
import { WEEK_DAYS } from "../constants";
import type { BlockedSlot, ScheduleOption } from "../types";

export function BlockedSlotModal({
  open,
  onOpenChange,
  onSuccess,
  activeSchedules = [],
  defaultScheduleId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
  activeSchedules?: ScheduleOption[];
  defaultScheduleId?: number;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    date: format(new Date(), "yyyy-MM-dd"),
    startTime: "12:00",
    endTime: "13:00",
    reason: "",
    scheduleId: null as number | null,
    recurrenceType: "none" as "none" | "daily" | "weekly",
    recurrenceDays: [] as number[],
    recurrenceEndDate: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [deleteGroupId, setDeleteGroupId] = useState<{ id: number; groupId: string | null } | null>(null);
  const [editSlot, setEditSlot] = useState<{ id: number; date: string; originalDate: string; startTime: string; endTime: string; reason: string; recurrenceGroupId: string | null } | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editShowGroupChoice, setEditShowGroupChoice] = useState(false);

  // On open, auto-set scheduleId based on context
  useEffect(() => {
    if (open) {
      if (defaultScheduleId) {
        setForm(f => ({ ...f, scheduleId: defaultScheduleId }));
      } else if (activeSchedules.length === 1) {
        setForm(f => ({ ...f, scheduleId: activeSchedules[0].id }));
      } else {
        setForm(f => ({ ...f, scheduleId: null }));
      }
    }
  }, [open, defaultScheduleId, activeSchedules]);

  const resolvedScheduleId = form.scheduleId
    ?? (activeSchedules.length === 1 ? activeSchedules[0].id : null);

  const { data: existingBlocks = [], refetch: refetchList } = useQuery<BlockedSlot[]>({
    queryKey: ["blocked-slots-modal", form.date, resolvedScheduleId],
    queryFn: async () => {
      const params = new URLSearchParams({ date: form.date });
      if (resolvedScheduleId) params.set("scheduleId", String(resolvedScheduleId));
      const res = await apiFetch(`/api/blocked-slots?${params}`, { credentials: "include" });
      return res.json();
    },
    enabled: open,
    staleTime: 5_000,
  });

  const isRecurring = form.recurrenceType !== "none";

  const toggleDay = (day: number) => {
    setForm((f) => ({
      ...f,
      recurrenceDays: f.recurrenceDays.includes(day)
        ? f.recurrenceDays.filter((d) => d !== day)
        : [...f.recurrenceDays, day],
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.startTime >= form.endTime) {
      toast({ variant: "destructive", title: "Horário inválido", description: "O horário de início deve ser antes do término." });
      return;
    }
    if (isRecurring && !form.recurrenceEndDate) {
      toast({ variant: "destructive", title: "Data final obrigatória", description: "Informe até quando o bloqueio se repete." });
      return;
    }
    if (isRecurring && form.recurrenceType === "weekly" && form.recurrenceDays.length === 0) {
      toast({ variant: "destructive", title: "Selecione os dias", description: "Marque pelo menos um dia da semana." });
      return;
    }
    setIsSaving(true);
    try {
      const body: Record<string, unknown> = {
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime,
        reason: form.reason || undefined,
        recurrenceType: form.recurrenceType,
        scheduleId: resolvedScheduleId ?? undefined,
      };
      if (isRecurring) {
        body.recurrenceEndDate = form.recurrenceEndDate;
        if (form.recurrenceType === "weekly") body.recurrenceDays = form.recurrenceDays;
      }
      const res = await apiFetch("/api/blocked-slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: "Erro ao bloquear", description: data.message || "Erro desconhecido." });
      } else {
        const count = data.count || 1;
        toast({
          title: "Horário(s) bloqueado(s)!",
          description: isRecurring
            ? `${count} bloqueio(s) criado(s) com recorrência ${form.recurrenceType === "daily" ? "diária" : "semanal"}`
            : `${form.date} · ${form.startTime}–${form.endTime}`,
        });
        refetchList();
        onSuccess();
        setForm(f => ({ ...f, recurrenceType: "none", recurrenceDays: [], recurrenceEndDate: "" }));
      }
    } catch {
      toast({ variant: "destructive", title: "Erro ao bloquear horário." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number, groupId: string | null) => {
    if (groupId) {
      setDeleteGroupId({ id, groupId });
      return;
    }
    await doDelete(id, false);
  };

  const doDelete = async (id: number, group: boolean) => {
    try {
      const url = group ? `/api/blocked-slots/${id}?group=true` : `/api/blocked-slots/${id}`;
      await apiFetch(url, { method: "DELETE" });
      toast({ title: group ? "Série de bloqueios removida." : "Bloqueio removido." });
      refetchList();
      onSuccess();
    } catch {
      toast({ variant: "destructive", title: "Erro ao remover bloqueio." });
    } finally {
      setDeleteGroupId(null);
    }
  };

  const doSaveEdit = async (updateGroup: boolean) => {
    if (!editSlot) return;
    if (editSlot.startTime >= editSlot.endTime) {
      toast({ variant: "destructive", title: "Horário inválido", description: "O horário de início deve ser anterior ao término." });
      return;
    }
    setIsSavingEdit(true);
    try {
      const res = await apiFetch(`/api/blocked-slots/${editSlot.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          date: editSlot.date,
          startTime: editSlot.startTime,
          endTime: editSlot.endTime,
          reason: editSlot.reason || null,
          updateGroup,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ variant: "destructive", title: "Erro ao salvar", description: data.message ?? "Tente novamente." });
      } else {
        toast({ title: updateGroup ? "Série inteira atualizada." : "Bloqueio atualizado com sucesso." });
        setEditSlot(null);
        setEditShowGroupChoice(false);
        refetchList();
        onSuccess();
      }
    } catch {
      toast({ variant: "destructive", title: "Erro ao atualizar bloqueio." });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleSaveEdit = () => {
    if (!editSlot) return;
    const dateChanged = editSlot.date !== editSlot.originalDate;
    if (editSlot.recurrenceGroupId && !dateChanged) {
      setEditShowGroupChoice(true);
    } else {
      doSaveEdit(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[480px] border-none shadow-2xl rounded-3xl" aria-describedby={undefined}>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-slate-100">
                <Lock className="w-4 h-4 text-slate-600" />
              </div>
              <DialogTitle className="font-display text-xl">Bloquear Horário</DialogTitle>
            </div>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 pt-1">
            {/* Schedule selector — shown only when clinic has multiple active schedules */}
            {activeSchedules.length > 1 && (
              <div className="space-y-1.5">
                <Label>Agenda *</Label>
                <select
                  className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  value={form.scheduleId ?? ""}
                  onChange={(e) => setForm(f => ({ ...f, scheduleId: e.target.value ? parseInt(e.target.value) : null }))}
                  required
                >
                  <option value="">Selecione a agenda…</option>
                  {activeSchedules.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
            {/* Auto-selected single schedule — display only */}
            {activeSchedules.length === 1 && (
              <div className="flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5">
                <CalendarDays className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="text-sm text-slate-600">Agenda: <span className="font-medium text-slate-800">{activeSchedules[0].name}</span></span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Data inicial *</Label>
              <DatePickerPTBR
                value={form.date}
                onChange={(v) => setForm({ ...form, date: v })}
                className="h-11 rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Início *</Label>
                <TimeInputPTBR
                  value={form.startTime}
                  onChange={(v) => setForm({ ...form, startTime: v })}
                  className="h-11 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Término *</Label>
                <TimeInputPTBR
                  value={form.endTime}
                  onChange={(v) => setForm({ ...form, endTime: v })}
                  className="h-11 rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Motivo</Label>
              <Input
                placeholder="Ex: Almoço, Reunião, Feriado..."
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                className="h-11 rounded-xl"
              />
            </div>

            {/* Recurrence */}
            <div className="rounded-xl border border-slate-200 p-3 space-y-3 bg-slate-50/60">
              <div className="flex items-center gap-2">
                <Repeat className="w-4 h-4 text-slate-500" />
                <Label className="text-sm font-semibold text-slate-700">Recorrência</Label>
              </div>
              <div className="flex gap-2">
                {([
                  { value: "none", label: "Uma vez" },
                  { value: "daily", label: "Diário" },
                  { value: "weekly", label: "Semanal" },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, recurrenceType: opt.value, recurrenceDays: [] }))}
                    className={`flex-1 h-9 rounded-lg text-xs font-semibold border transition-colors ${
                      form.recurrenceType === opt.value
                        ? "bg-primary text-white border-primary"
                        : "bg-white text-slate-600 border-slate-200 hover:border-primary hover:text-primary"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {form.recurrenceType === "weekly" && (
                <div>
                  <p className="text-xs text-slate-500 mb-2">Dias da semana</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {WEEK_DAYS.map((d) => (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => toggleDay(d.value)}
                        className={`w-10 h-8 rounded-lg text-xs font-semibold border transition-colors ${
                          form.recurrenceDays.includes(d.value)
                            ? "bg-primary text-white border-primary"
                            : "bg-white text-slate-600 border-slate-200 hover:border-primary"
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isRecurring && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Repetir até *</Label>
                  <DatePickerPTBR
                    value={form.recurrenceEndDate}
                    onChange={(v) => setForm({ ...form, recurrenceEndDate: v })}
                    className="h-9 rounded-lg text-sm"
                  />
                </div>
              )}
            </div>

            <Button type="submit" className="w-full h-11 rounded-xl" disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
              {isRecurring ? "Criar bloqueios recorrentes" : "Bloquear horário"}
            </Button>
          </form>

          {/* Existing blocks for the selected date */}
          {existingBlocks.length > 0 && (
            <div className="pt-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Bloqueios neste dia
              </p>
              <div className="space-y-1.5">
                {existingBlocks.map((b) => {
                  const schedName = b.scheduleId
                    ? activeSchedules.find((s) => s.id === b.scheduleId)?.name
                    : null;
                  return (
                    <div
                      key={b.id}
                      className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2 border border-slate-200"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Ban className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="text-sm font-medium text-slate-700">{b.startTime}–{b.endTime}</span>
                        {b.reason && (
                          <span className="text-xs text-slate-500 truncate">{b.reason}</span>
                        )}
                        {schedName && (
                          <span className="text-[10px] font-semibold bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded shrink-0">
                            {schedName}
                          </span>
                        )}
                        {b.recurrenceGroupId && (
                          <span className="text-[10px] font-semibold bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded shrink-0">
                            Recorrente
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 ml-2 shrink-0">
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors"
                          onClick={() => setEditSlot({ id: b.id, date: b.date, originalDate: b.date, startTime: b.startTime, endTime: b.endTime, reason: b.reason ?? "", recurrenceGroupId: b.recurrenceGroupId ?? null })}
                          title="Editar bloqueio"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors"
                          onClick={() => handleDelete(b.id, b.recurrenceGroupId || null)}
                          title="Remover bloqueio"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete group confirmation */}
      {deleteGroupId && (
        <Dialog open onOpenChange={() => setDeleteGroupId(null)}>
          <DialogContent className="sm:max-w-[380px] border-none shadow-2xl rounded-2xl" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Remover bloqueio recorrente</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-slate-600">Este bloqueio faz parte de uma série recorrente. O que deseja remover?</p>
            <div className="flex flex-col gap-2 pt-2">
              <Button variant="outline" className="rounded-xl" onClick={() => doDelete(deleteGroupId.id, false)}>
                Apenas este bloqueio
              </Button>
              <Button variant="destructive" className="rounded-xl" onClick={() => doDelete(deleteGroupId.id, true)}>
                Toda a série recorrente
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit blocked slot dialog */}
      {editSlot && (
        <Dialog open onOpenChange={() => setEditSlot(null)}>
          <DialogContent className="sm:max-w-[400px] border-none shadow-2xl rounded-2xl" aria-describedby={undefined}>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-slate-100">
                  <Pencil className="w-4 h-4 text-slate-600" />
                </div>
                <div>
                  <DialogTitle className="font-display text-lg">Editar Bloqueio</DialogTitle>
                  {editSlot.recurrenceGroupId && (
                    <p className="text-xs text-violet-600 font-medium mt-0.5 flex items-center gap-1">
                      <Repeat className="w-3 h-3" /> Bloqueio recorrente
                    </p>
                  )}
                </div>
              </div>
            </DialogHeader>
            <div className="space-y-3 pt-1">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Data</Label>
                <DatePickerPTBR
                  value={editSlot.date}
                  onChange={(v) => setEditSlot({ ...editSlot, date: v })}
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Início</Label>
                  <TimeInputPTBR
                    value={editSlot.startTime}
                    onChange={(v) => setEditSlot({ ...editSlot, startTime: v })}
                    className="h-10 rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Término</Label>
                  <TimeInputPTBR
                    value={editSlot.endTime}
                    onChange={(v) => setEditSlot({ ...editSlot, endTime: v })}
                    className="h-10 rounded-xl"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Motivo</Label>
                <Input
                  placeholder="Ex: Almoço, Reunião..."
                  value={editSlot.reason}
                  onChange={(e) => setEditSlot({ ...editSlot, reason: e.target.value })}
                  className="h-10 rounded-xl"
                />
              </div>
            </div>
            <DialogFooter className="pt-2 gap-2">
              <Button variant="outline" className="rounded-xl flex-1" onClick={() => setEditSlot(null)} disabled={isSavingEdit}>
                Cancelar
              </Button>
              <Button className="rounded-xl flex-1" onClick={handleSaveEdit} disabled={isSavingEdit}>
                {isSavingEdit ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Pencil className="w-4 h-4 mr-1.5" />}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Recurring series update choice dialog */}
      {editShowGroupChoice && editSlot && (
        <Dialog open onOpenChange={() => setEditShowGroupChoice(false)}>
          <DialogContent className="sm:max-w-[380px] border-none shadow-2xl rounded-2xl" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Editar bloqueio recorrente</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-slate-600">Este bloqueio faz parte de uma série recorrente. O que deseja atualizar?</p>
            <div className="flex flex-col gap-2 pt-2">
              <Button variant="outline" className="rounded-xl" onClick={() => doSaveEdit(false)} disabled={isSavingEdit}>
                {isSavingEdit ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                Apenas este bloqueio
              </Button>
              <Button className="rounded-xl" onClick={() => doSaveEdit(true)} disabled={isSavingEdit}>
                {isSavingEdit ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                Toda a série recorrente
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
