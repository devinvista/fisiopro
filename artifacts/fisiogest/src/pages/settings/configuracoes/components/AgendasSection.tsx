import { fetchUsers, fetchCurrentClinic, updateCurrentClinic } from "../helpers";
import { BASE, API_BASE, ROLE_COLORS, DAYS_OF_WEEK, PRESET_COLORS, DEFAULT_SCHEDULE_FORM, EMPTY_USER_FORM, parseDays, formatDaysBadges, SECTIONS } from "../constants";
import { Clinic, SystemUser, Professional, Schedule, ScheduleFormState, SectionConfig } from "../types";
import { ClinicaSection, ScheduleCard, UsuariosSection } from "./";
import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/utils/api";
import { maskCpf, maskPhone, maskCnpj, displayCpf } from "@/utils/masks";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { useAuth } from "@/utils/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Building2,
  Save,
  Phone,
  Mail,
  MapPin,
  Hash,
  UserCog,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  CalendarDays,
  Clock,
  Calendar,
  User2,
  Power,
  PowerOff,
  Settings2,
  ChevronRight,
  Globe,
  Upload,
  ImageIcon,
  Award,
  UserCheck,
  X,
  ShieldAlert,
  Timer,
  BadgeDollarSign,
  CheckCircle2,
} from "lucide-react";
import { ROLES, ROLE_LABELS } from "@/utils/permissions";
import type { Role } from "@/utils/permissions";
import { Sparkles } from "lucide-react";
import { PlanoSection } from "../../plano-section";

export function AgendasSection() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Schedule | null>(null);
  const [editTarget, setEditTarget] = useState<Schedule | null>(null);
  const [form, setForm] = useState<ScheduleFormState>(DEFAULT_SCHEDULE_FORM);

  const { data: schedules = [], isLoading } = useQuery<Schedule[]>({
    queryKey: ["schedules"],
    queryFn: () => apiFetch("/api/schedules").then((r) => r.json()),
  });

  const { data: users = [] } = useQuery<SystemUser[]>({
    queryKey: ["users"],
    queryFn: fetchUsers,
  });

  const professionals = users.filter(
    (u: any) =>
      (u.roles ?? []).includes("profissional") || (u.roles ?? []).includes("admin")
  );

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      apiFetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).message ?? "Erro ao criar agenda");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      setDialogOpen(false);
      toast({ title: "Agenda criada com sucesso!" });
    },
    onError: (err: any) =>
      toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiFetch(`/api/schedules/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(async (r) => {
        if (!r.ok)
          throw new Error((await r.json()).message ?? "Erro ao atualizar agenda");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      setDialogOpen(false);
      toast({ title: "Agenda atualizada com sucesso!" });
    },
    onError: (err: any) =>
      toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/schedules/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      setDeleteTarget(null);
      toast({ title: "Agenda removida." });
    },
    onError: () =>
      toast({ title: "Erro ao remover agenda", variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiFetch(`/api/schedules/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedules"] }),
  });

  function openCreate() {
    setEditTarget(null);
    setForm(DEFAULT_SCHEDULE_FORM);
    setDialogOpen(true);
  }

  function openEdit(s: Schedule) {
    setEditTarget(s);
    setForm({
      name: s.name,
      description: s.description ?? "",
      type: s.type,
      professionalId: s.professionalId ? String(s.professionalId) : "",
      workingDays: parseDays(s.workingDays),
      startTime: s.startTime,
      endTime: s.endTime,
      slotDurationMinutes: String(s.slotDurationMinutes),
      color: s.color,
    });
    setDialogOpen(true);
  }

  function toggleDay(day: string) {
    setForm((f) => ({
      ...f,
      workingDays: f.workingDays.includes(day)
        ? f.workingDays.filter((d) => d !== day)
        : [...f.workingDays, day],
    }));
  }

  function handleSubmit() {
    if (!form.name.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    if (form.workingDays.length === 0) {
      toast({
        title: "Selecione ao menos um dia de funcionamento",
        variant: "destructive",
      });
      return;
    }
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      type: form.type,
      professionalId:
        form.type === "professional" && form.professionalId
          ? parseInt(form.professionalId)
          : null,
      workingDays: form.workingDays.map(Number),
      startTime: form.startTime,
      endTime: form.endTime,
      slotDurationMinutes: parseInt(form.slotDurationMinutes),
      color: form.color,
    };

    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Agendas da Clínica</h3>
          <p className="text-sm text-muted-foreground">
            Configure agendas gerais ou vinculadas a profissionais.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Agenda
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : schedules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="bg-muted rounded-full p-4 mb-4">
            <CalendarDays className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-lg">Nenhuma agenda configurada</h3>
          <p className="text-muted-foreground text-sm mt-1 max-w-sm">
            Crie agendas para organizar os horários da sua clínica e dos profissionais.
          </p>
          <Button onClick={openCreate} className="mt-4 gap-2">
            <Plus className="h-4 w-4" />
            Criar primeira agenda
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {schedules.map((schedule) => (
            <ScheduleCard
              key={schedule.id}
              schedule={schedule}
              onEdit={() => openEdit(schedule)}
              onDelete={() => setDeleteTarget(schedule)}
              onToggle={() =>
                toggleMutation.mutate({ id: schedule.id, isActive: !schedule.isActive })
              }
            />
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Editar Agenda" : "Nova Agenda"}</DialogTitle>
            <DialogDescription>
              {editTarget
                ? "Atualize as configurações desta agenda."
                : "Configure uma nova agenda para a sua clínica."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="space-y-1.5">
              <Label>Nome da agenda *</Label>
              <Input
                placeholder="Ex: Agenda Geral, Fisioterapia, Dr. Silva..."
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea
                placeholder="Descrição opcional..."
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Tipo de agenda</Label>
              <Select
                value={form.type}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, type: v, professionalId: "" }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="clinic">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Geral da clínica
                    </div>
                  </SelectItem>
                  <SelectItem value="professional">
                    <div className="flex items-center gap-2">
                      <User2 className="h-4 w-4" />
                      Vinculada a profissional
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.type === "professional" && (
              <div className="space-y-1.5">
                <Label>Profissional</Label>
                <Select
                  value={form.professionalId}
                  onValueChange={(v) => setForm((f) => ({ ...f, professionalId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um profissional" />
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

            <div className="space-y-2">
              <Label>Dias de funcionamento</Label>
              <div className="flex gap-2 flex-wrap">
                {DAYS_OF_WEEK.map((day) => {
                  const active = form.workingDays.includes(day.value);
                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleDay(day.value)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border
                        ${
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-muted-foreground hover:bg-muted"
                        }`}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Início</Label>
                <Input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Término</Label>
                <Input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Duração do slot (minutos)</Label>
              <Select
                value={form.slotDurationMinutes}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, slotDurationMinutes: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 minutos</SelectItem>
                  <SelectItem value="20">20 minutos</SelectItem>
                  <SelectItem value="30">30 minutos</SelectItem>
                  <SelectItem value="45">45 minutos</SelectItem>
                  <SelectItem value="60">60 minutos</SelectItem>
                  <SelectItem value="90">90 minutos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Cor da agenda</Label>
              <div className="flex gap-2 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      form.color === c
                        ? "border-foreground scale-110"
                        : "border-transparent hover:scale-105"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editTarget ? "Salvar alterações" : "Criar agenda"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover agenda</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover a agenda{" "}
              <strong>{deleteTarget?.name}</strong>? Os agendamentos existentes não
              serão excluídos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ─── Schedule Card ─────────────────────────────────────────── */

