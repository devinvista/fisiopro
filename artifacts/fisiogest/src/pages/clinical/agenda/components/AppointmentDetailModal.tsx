import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Calendar as CalIcon,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Pencil,
  Trash2,
  User,
  Stethoscope,
  Clock,
  Repeat,
  RefreshCw,
  Users,
  Globe,
  Plus,
} from "lucide-react";
import { apiFetch } from "@/utils/api";
import {
  useUpdateAppointment,
  useDeleteAppointment,
  useCompleteAppointment,
  type UpdateAppointmentRequestStatus,
  type AppointmentStatus,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { DatePickerPTBR, TimeInputPTBR } from "@/components/ui/date-picker-ptbr";
import { cn } from "@/utils/utils";
import { STATUS_CONFIG } from "../constants";
import type { Appointment } from "../types";

export function AppointmentDetailModal({
  appointment,
  allAppointments,
  onClose,
  onRefresh,
  onAddToSession,
}: {
  appointment: Appointment;
  allAppointments: Appointment[];
  onClose: () => void;
  onRefresh: () => void;
  onAddToSession: (date: string, time: string, procedureId: number) => void;
}) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);

  const maxCap = appointment.procedure?.maxCapacity ?? 1;
  const isGroupSession = maxCap > 1;

  const sessionSiblings = isGroupSession
    ? allAppointments.filter(
        (a) =>
          a.id !== appointment.id &&
          a.date === appointment.date &&
          a.procedureId === appointment.procedureId &&
          a.startTime === appointment.startTime
      ).sort((a, b) => a.id - b.id)
    : [];

  const allSessionMembers: Appointment[] = isGroupSession
    ? [appointment, ...sessionSiblings].sort((a, b) => a.id - b.id)
    : [appointment];

  const occupiedCount = allSessionMembers.filter(
    (a) => !["cancelado", "faltou"].includes(a.status)
  ).length;
  const spotsLeft = maxCap - occupiedCount;
  const [editForm, setEditForm] = useState({
    status: appointment.status,
    notes: appointment.notes || "",
    date: appointment.date,
    startTime: appointment.startTime,
  });

  const updateMutation = useUpdateAppointment();
  const deleteMutation = useDeleteAppointment();
  const completeMutation = useCompleteAppointment();

  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [rescheduleForm, setRescheduleForm] = useState({ date: appointment.date, startTime: appointment.startTime });
  const [rescheduleBusy, setRescheduleBusy] = useState(false);

  const cfg = STATUS_CONFIG[appointment.status] || STATUS_CONFIG.agendado;
  const isBusy = updateMutation.isPending || deleteMutation.isPending || completeMutation.isPending;

  const handleUpdate = () => {
    updateMutation.mutate(
      { id: appointment.id, data: editForm },
      {
        onSuccess: () => { toast({ title: "Consulta atualizada." }); onRefresh(); },
        onError: () => toast({ variant: "destructive", title: "Erro ao atualizar." }),
      }
    );
  };

  const executeStatusChange = (newStatus: string) => {
    updateMutation.mutate(
      { id: appointment.id, data: { status: newStatus as UpdateAppointmentRequestStatus } },
      {
        onSuccess: () => {
          toast({ title: `Status: ${STATUS_CONFIG[newStatus]?.label}` });
          onRefresh();
          if (newStatus === "faltou") {
            toast({
              title: "Paciente não compareceu",
              description: "Deseja remarcar para outro horário?",
              action: (
                <button
                  onClick={() => setIsRescheduling(true)}
                  className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium transition-colors hover:bg-secondary focus:outline-none"
                >
                  Remarcar
                </button>
              ) as any,
            });
          }
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.message || err?.message || "Erro ao alterar status.";
          toast({ variant: "destructive", title: "Erro", description: msg });
        },
      }
    );
  };

  const handleStatusChange = (newStatus: string) => {
    if (newStatus === "cancelado" || newStatus === "faltou") {
      setPendingStatus(newStatus);
      return;
    }
    executeStatusChange(newStatus);
  };

  const handleReschedule = async () => {
    setRescheduleBusy(true);
    try {
      const token = localStorage.getItem("fisiogest_token");
      const res = await apiFetch(`/api/appointments/${appointment.id}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(rescheduleForm),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ variant: "destructive", title: "Erro ao remarcar", description: err.message || "Verifique o horário e tente novamente." });
        return;
      }
      toast({ title: "Remarcado com sucesso!", description: `Nova consulta em ${rescheduleForm.date} às ${rescheduleForm.startTime}.` });
      setIsRescheduling(false);
      onRefresh();
      onClose();
    } catch {
      toast({ variant: "destructive", title: "Erro ao remarcar." });
    } finally {
      setRescheduleBusy(false);
    }
  };

  const handleComplete = () => {
    completeMutation.mutate(
      { id: appointment.id },
      {
        onSuccess: () => { toast({ title: "Consulta concluída!", description: "Lançamento financeiro gerado." }); onRefresh(); },
        onError: () => toast({ variant: "destructive", title: "Erro ao concluir." }),
      }
    );
  };

  const handleDelete = () => {
    if (!confirm("Excluir esta consulta?")) return;
    deleteMutation.mutate(
      { id: appointment.id },
      {
        onSuccess: () => { toast({ title: "Consulta excluída." }); onRefresh(); },
        onError: () => toast({ variant: "destructive", title: "Erro ao excluir." }),
      }
    );
  };

  const handleMemberStatusChange = (aptId: number, newStatus: string) => {
    updateMutation.mutate(
      { id: aptId, data: { status: newStatus as UpdateAppointmentRequestStatus } },
      {
        onSuccess: () => { toast({ title: `Status: ${STATUS_CONFIG[newStatus]?.label}` }); onRefresh(); },
        onError: () => toast({ variant: "destructive", title: "Erro ao alterar status." }),
      }
    );
  };

  const handleMemberComplete = (aptId: number) => {
    completeMutation.mutate(
      { id: aptId },
      {
        onSuccess: () => { toast({ title: "Consulta concluída!", description: "Lançamento financeiro gerado." }); onRefresh(); },
        onError: () => toast({ variant: "destructive", title: "Erro ao concluir." }),
      }
    );
  };

  return (
    <>
      <Dialog open onOpenChange={onClose}>
        <DialogContent className={cn("border-none shadow-2xl rounded-3xl", isGroupSession ? "sm:max-w-[520px]" : "sm:max-w-[480px]")} aria-describedby={undefined}>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className={cn("p-2.5 rounded-xl", isGroupSession ? "bg-violet-500" : cfg.bg)}>
                {isGroupSession
                  ? <Users className="w-4 h-4 text-white" />
                  : <CalIcon className="w-4 h-4 text-white" />
                }
              </div>
              <div>
                <DialogTitle className="font-display text-xl">
                  {isGroupSession ? "Sessão em Grupo" : "Detalhes da Consulta"}
                </DialogTitle>
                {isGroupSession ? (
                  <p className="text-sm text-slate-500 mt-0.5">
                    {appointment.procedure?.name} · {appointment.startTime} – {appointment.endTime}
                  </p>
                ) : (
                  <span className={`inline-block mt-0.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${cfg.badge}`}>
                    {cfg.label}
                  </span>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            {/* Info card — for single appointments only */}
            {!isGroupSession && (
              <div className="bg-slate-50 rounded-2xl p-4 space-y-3 text-sm">
                <div className="flex items-center gap-3">
                  <User className="w-4 h-4 text-slate-400 shrink-0" />
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide font-medium">Paciente</p>
                    <p className="font-semibold text-slate-800">{appointment.patient?.name}</p>
                  </div>
                </div>
                <Separator />
                <div className="flex items-center gap-3">
                  <Stethoscope className="w-4 h-4 text-slate-400 shrink-0" />
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide font-medium">Procedimento</p>
                    <p className="font-semibold text-slate-800">{appointment.procedure?.name}</p>
                  </div>
                </div>
                <Separator />
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide font-medium">Data e Horário</p>
                    <p className="font-semibold text-slate-800">
                      {appointment.date ? format(new Date(appointment.date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                      {" "}&middot;{" "}{appointment.startTime} – {appointment.endTime}
                    </p>
                  </div>
                </div>
                {appointment.notes && (
                  <>
                    <Separator />
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide font-medium">Observações</p>
                    <p className="text-sm text-slate-700">{appointment.notes}</p>
                  </>
                )}
                {appointment.source === "online" && (
                  <>
                    <Separator />
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-teal-500 shrink-0" />
                      <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full">
                        Agendado pelo portal online
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Info summary for group sessions */}
            {isGroupSession && (
              <div className="bg-slate-50 rounded-2xl px-4 py-3 flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2 text-slate-600">
                  <CalIcon className="w-3.5 h-3.5 text-slate-400" />
                  <span>{appointment.date ? format(new Date(appointment.date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR }) : "—"}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>{appointment.startTime} – {appointment.endTime}</span>
                </div>
                <span className={cn(
                  "ml-auto text-xs font-bold px-2.5 py-1 rounded-full shrink-0",
                  spotsLeft > 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                )}>
                  {occupiedCount}/{maxCap} ativos
                </span>
              </div>
            )}

            {/* Group session — per-patient status management */}
            {isGroupSession && !isEditing && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pacientes da Sessão</p>
                <div className="space-y-2 max-h-[320px] overflow-y-auto pr-0.5">
                  {allSessionMembers.map((member) => {
                    const mCfg = STATUS_CONFIG[member.status] || STATUS_CONFIG.agendado;
                    const isCurrent = member.id === appointment.id;
                    const isDone = member.status === "concluido";
                    return (
                      <div
                        key={member.id}
                        className={cn(
                          "rounded-2xl border p-3 space-y-2.5 transition-colors",
                          isCurrent ? "border-violet-200 bg-violet-50/60" : "border-slate-100 bg-white"
                        )}
                      >
                        {/* Patient row */}
                        <div className="flex items-center gap-2">
                          <div className={cn("w-7 h-7 rounded-full flex items-center justify-center shrink-0", mCfg.bg)}>
                            <User className="w-3.5 h-3.5 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">{member.patient?.name}</p>
                            {member.notes && (
                              <p className="text-[10px] text-slate-400 truncate">{member.notes}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", mCfg.badge)}>
                              {mCfg.label}
                            </span>
                          </div>
                        </div>

                        {/* Per-patient actions */}
                        {!isDone && (
                          <div className="flex gap-1.5 flex-wrap">
                            {member.status !== "confirmado" && member.status !== "compareceu" && member.status !== "cancelado" && member.status !== "faltou" && (
                              <button
                                className="text-[10px] font-semibold px-2.5 py-1 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-50"
                                onClick={() => handleMemberStatusChange(member.id, "confirmado")}
                                disabled={isBusy}
                              >
                                <CheckCircle className="w-3 h-3 inline mr-0.5" /> Confirmar
                              </button>
                            )}
                            {member.status !== "compareceu" && member.status !== "cancelado" && member.status !== "faltou" && (
                              <button
                                className="text-[10px] font-semibold px-2.5 py-1 rounded-lg border border-teal-200 text-teal-700 hover:bg-teal-50 transition-colors disabled:opacity-50"
                                onClick={() => handleMemberStatusChange(member.id, "compareceu")}
                                disabled={isBusy}
                              >
                                <Users className="w-3 h-3 inline mr-0.5" /> Compareceu
                              </button>
                            )}
                            {member.status !== "faltou" && member.status !== "cancelado" && (
                              <button
                                className="text-[10px] font-semibold px-2.5 py-1 rounded-lg border border-orange-200 text-orange-700 hover:bg-orange-50 transition-colors disabled:opacity-50"
                                onClick={() => handleMemberStatusChange(member.id, "faltou")}
                                disabled={isBusy}
                              >
                                <AlertCircle className="w-3 h-3 inline mr-0.5" /> Faltou
                              </button>
                            )}
                            {member.status !== "cancelado" && member.status !== "faltou" && (
                              <button
                                className="text-[10px] font-semibold px-2.5 py-1 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
                                onClick={() => handleMemberStatusChange(member.id, "cancelado")}
                                disabled={isBusy}
                              >
                                <XCircle className="w-3 h-3 inline mr-0.5" /> Cancelar
                              </button>
                            )}
                            {(member.status === "faltou" || member.status === "cancelado") && (
                              <button
                                className="text-[10px] font-semibold px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                                onClick={() => handleMemberStatusChange(member.id, "agendado")}
                                disabled={isBusy}
                              >
                                <RefreshCw className="w-3 h-3 inline mr-0.5" /> Reativar
                              </button>
                            )}
                            {member.status !== "cancelado" && member.status !== "faltou" && (
                              <button
                                className="text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-slate-700 text-white hover:bg-slate-800 transition-colors disabled:opacity-50 ml-auto"
                                onClick={() => handleMemberComplete(member.id)}
                                disabled={isBusy}
                              >
                                {completeMutation.isPending ? (
                                  <Loader2 className="w-3 h-3 inline animate-spin mr-0.5" />
                                ) : (
                                  <CheckCircle className="w-3 h-3 inline mr-0.5" />
                                )}
                                Concluir
                              </button>
                            )}
                          </div>
                        )}
                        {isDone && (
                          <p className="text-[10px] text-slate-400 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3 text-slate-400" /> Sessão concluída
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Add patient */}
                {spotsLeft > 0 && (
                  <Button
                    size="sm"
                    className="w-full rounded-xl bg-violet-600 hover:bg-violet-700 text-white"
                    onClick={() => onAddToSession(appointment.date, appointment.startTime, appointment.procedureId)}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Adicionar paciente ({spotsLeft} vaga{spotsLeft !== 1 ? "s" : ""} livre{spotsLeft !== 1 ? "s" : ""})
                  </Button>
                )}
              </div>
            )}

            {/* Status actions — ONLY for single (non-group) appointments */}
            {!isGroupSession && !isEditing && appointment.status !== "concluido" && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Alterar Status</p>
                <div className="flex flex-wrap gap-2">
                  {appointment.status !== "confirmado" && appointment.status !== "compareceu" && (
                    <Button size="sm" variant="outline" className="rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                      onClick={() => handleStatusChange("confirmado")} disabled={isBusy}>
                      <CheckCircle className="w-3.5 h-3.5 mr-1" /> Confirmar
                    </Button>
                  )}
                  {appointment.status !== "compareceu" && appointment.status !== "cancelado" && appointment.status !== "faltou" && (
                    <Button size="sm" variant="outline" className="rounded-xl border-teal-200 text-teal-700 hover:bg-teal-50"
                      onClick={() => handleStatusChange("compareceu")} disabled={isBusy}>
                      <Users className="w-3.5 h-3.5 mr-1" /> Compareceu
                    </Button>
                  )}
                  {appointment.status !== "faltou" && appointment.status !== "cancelado" && (
                    <Button size="sm" variant="outline" className="rounded-xl border-orange-200 text-orange-700 hover:bg-orange-50"
                      onClick={() => handleStatusChange("faltou")} disabled={isBusy}>
                      <AlertCircle className="w-3.5 h-3.5 mr-1" /> Faltou
                    </Button>
                  )}
                  {appointment.status !== "cancelado" && appointment.status !== "faltou" && (
                    <Button size="sm" variant="outline" className="rounded-xl border-red-200 text-red-700 hover:bg-red-50"
                      onClick={() => handleStatusChange("cancelado")} disabled={isBusy}>
                      <XCircle className="w-3.5 h-3.5 mr-1" /> Cancelar
                    </Button>
                  )}
                  {(appointment.status === "cancelado" || appointment.status === "faltou") && (
                    <Button size="sm" variant="outline" className="rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50"
                      onClick={() => handleStatusChange("agendado")} disabled={isBusy}>
                      <RefreshCw className="w-3.5 h-3.5 mr-1" /> Reativar
                    </Button>
                  )}
                  {(appointment.status === "cancelado" || appointment.status === "faltou") && (
                    <Button size="sm" variant="outline" className="rounded-xl border-purple-200 text-purple-700 hover:bg-purple-50"
                      onClick={() => setIsRescheduling(true)} disabled={isBusy}>
                      <Repeat className="w-3.5 h-3.5 mr-1" /> Remarcar
                    </Button>
                  )}
                  {appointment.status !== "cancelado" && appointment.status !== "faltou" && (
                    <Button size="sm" className="rounded-xl"
                      onClick={handleComplete} disabled={isBusy}>
                      {completeMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <CheckCircle className="w-3.5 h-3.5 mr-1" />}
                      Concluir
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Reschedule form (inline — avoids nested Dialog focus-trap issues) */}
            {isRescheduling && (
              <div className="space-y-3 bg-purple-50 rounded-2xl p-4 border border-purple-100">
                <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider flex items-center gap-1.5">
                  <Repeat className="w-3.5 h-3.5" /> Remarcar consulta
                </p>
                <p className="text-sm text-slate-500">Selecione a nova data e horário para <strong>{appointment.patient?.name}</strong>.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Nova data</Label>
                    <DatePickerPTBR value={rescheduleForm.date} onChange={(v) => setRescheduleForm(f => ({ ...f, date: v }))} className="rounded-xl h-10" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Novo horário</Label>
                    <TimeInputPTBR value={rescheduleForm.startTime} onChange={(v) => setRescheduleForm(f => ({ ...f, startTime: v }))} className="rounded-xl h-10" />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" className="rounded-xl flex-1 bg-purple-600 hover:bg-purple-700" onClick={handleReschedule} disabled={rescheduleBusy}>
                    {rescheduleBusy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Repeat className="w-4 h-4 mr-1" />}
                    Confirmar remarcação
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setIsRescheduling(false)}>Cancelar</Button>
                </div>
              </div>
            )}

            {/* Edit form */}
            {isEditing && (
              <div className="space-y-3 bg-slate-50 rounded-2xl p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Editar Consulta</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Data</Label>
                    <DatePickerPTBR value={editForm.date} onChange={(v) => setEditForm({ ...editForm, date: v })} className="rounded-xl h-10" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Horário</Label>
                    <TimeInputPTBR value={editForm.startTime} onChange={(v) => setEditForm({ ...editForm, startTime: v })} className="rounded-xl h-10" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Status</Label>
                  <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v as AppointmentStatus })}>
                    <SelectTrigger className="rounded-xl h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Observações</Label>
                  <Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} className="rounded-xl resize-none" rows={2} />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" className="rounded-xl flex-1" onClick={handleUpdate} disabled={isBusy}>
                    {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setIsEditing(false)}>Cancelar</Button>
                </div>
              </div>
            )}

            {/* Footer actions */}
            <div className="flex items-center justify-between pt-1">
              <Button variant="ghost" size="sm" className="rounded-xl text-red-500 hover:bg-red-50"
                onClick={handleDelete} disabled={isBusy}>
                <Trash2 className="w-4 h-4 mr-1" /> Excluir
              </Button>
              {!isEditing && (
                <Button variant="outline" size="sm" className="rounded-xl"
                  onClick={() => setIsEditing(true)}>
                  <Pencil className="w-4 h-4 mr-1" /> Editar
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog for destructive status changes */}
      <AlertDialog open={!!pendingStatus} onOpenChange={(open) => { if (!open) setPendingStatus(null); }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingStatus === "cancelado" ? "Cancelar consulta?" : "Marcar como faltou?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingStatus === "cancelado"
                ? "Esta ação cancelará a consulta. Lançamentos financeiros gerados serão estornados automaticamente."
                : "O paciente será marcado como ausente. Um lançamento de taxa de no-show poderá ser gerado conforme política da clínica."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingStatus(null)}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className={pendingStatus === "cancelado" ? "bg-red-500 hover:bg-red-600" : "bg-orange-500 hover:bg-orange-600"}
              onClick={() => {
                if (pendingStatus) {
                  executeStatusChange(pendingStatus);
                  setPendingStatus(null);
                }
              }}
            >
              {pendingStatus === "cancelado" ? "Sim, cancelar" : "Sim, marcar faltou"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
