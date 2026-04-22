import { fetchUsers, fetchCurrentClinic, updateCurrentClinic } from "../helpers";
import { BASE, API_BASE, ROLE_COLORS, DAYS_OF_WEEK, PRESET_COLORS, DEFAULT_SCHEDULE_FORM, EMPTY_USER_FORM, parseDays, formatDaysBadges, SECTIONS } from "../constants";
import { Clinic, SystemUser, Professional, Schedule, ScheduleFormState, SectionConfig } from "../types";
import { AgendasSection, ClinicaSection, ScheduleCard } from "./";
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

export function UsuariosSection() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);
  const [form, setForm] = useState(EMPTY_USER_FORM);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_USER_FORM) => {
      const res = await apiFetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message ?? "Erro ao criar usuário");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "Usuário criado com sucesso" });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number;
      data: {
        name: string;
        cpf?: string;
        email?: string;
        roles: Role[];
        password?: string;
      };
    }) => {
      const res = await apiFetch(`/api/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message ?? "Erro ao atualizar usuário");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "Usuário atualizado com sucesso" });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/users/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message ?? "Erro ao excluir usuário");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "Usuário excluído" });
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  function openCreate() {
    setEditingUser(null);
    setForm(EMPTY_USER_FORM);
    setDialogOpen(true);
  }

  function openEdit(u: SystemUser) {
    setEditingUser(u);
    setForm({
      name: u.name,
      cpf: maskCpf(u.cpf),
      email: u.email ?? "",
      password: "",
      roles: u.roles as Role[],
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingUser(null);
    setForm(EMPTY_USER_FORM);
  }

  function toggleRole(role: Role) {
    setForm((prev) => {
      const has = prev.roles.includes(role);
      const next = has ? prev.roles.filter((r) => r !== role) : [...prev.roles, role];
      return { ...prev, roles: next.length === 0 ? [role] : next };
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.roles.length === 0) {
      toast({ title: "Selecione pelo menos um perfil", variant: "destructive" });
      return;
    }
    if (!form.cpf) {
      toast({ title: "CPF é obrigatório", variant: "destructive" });
      return;
    }
    if (editingUser) {
      const data: {
        name: string;
        cpf: string;
        email?: string;
        roles: Role[];
        password?: string;
      } = {
        name: form.name,
        cpf: form.cpf,
        email: form.email || undefined,
        roles: form.roles,
      };
      if (form.password) data.password = form.password;
      updateMutation.mutate({ id: editingUser.id, data });
    } else {
      if (!form.password) {
        toast({ title: "Senha é obrigatória", variant: "destructive" });
        return;
      }
      createMutation.mutate({
        name: form.name,
        cpf: form.cpf,
        email: form.email || undefined,
        password: form.password,
        roles: form.roles,
      } as any);
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Gestão de Usuários</h3>
          <p className="text-sm text-muted-foreground">
            Gerencie os usuários e perfis de acesso do sistema
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Usuário
        </Button>
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead className="hidden md:table-cell">CPF</TableHead>
              <TableHead className="hidden md:table-cell">E-mail</TableHead>
              <TableHead>Perfis</TableHead>
              <TableHead className="hidden lg:table-cell">Cadastrado em</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                  Carregando...
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center py-12 text-muted-foreground"
                >
                  Nenhum usuário encontrado
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate">{u.name}</p>
                        {u.id === currentUser?.id && (
                          <span className="text-xs text-muted-foreground">(você)</span>
                        )}
                        <p className="text-xs text-muted-foreground md:hidden truncate">{u.email ?? ""}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-sm hidden md:table-cell">
                    {displayCpf(u.cpf)}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden md:table-cell">
                    {u.email ?? <span className="text-slate-300">—</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((r) => (
                        <span
                          key={r}
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                            ROLE_COLORS[r as Role] ?? "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {ROLE_LABELS[r as Role] ?? r}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm hidden lg:table-cell">
                    {new Date(u.createdAt).toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(u)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        disabled={u.id === currentUser?.id || deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(u.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingUser ? "Editar Usuário" : "Novo Usuário"}</DialogTitle>
            <DialogDescription>
              {editingUser
                ? "Atualize os dados e perfis do usuário."
                : "Preencha os dados para criar um novo usuário no sistema."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="user-name">Nome completo</Label>
              <Input
                id="user-name"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ex: Dra. Ana Silva"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-cpf">CPF *</Label>
              <Input
                id="user-cpf"
                type="text"
                inputMode="numeric"
                value={form.cpf}
                onChange={(e) => setForm((p) => ({ ...p, cpf: maskCpf(e.target.value) }))}
                placeholder="000.000.000-00"
                maxLength={14}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-email">
                E-mail{" "}
                <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
              </Label>
              <Input
                id="user-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="usuario@clinica.com.br"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-password">
                {editingUser ? "Nova senha (deixe em branco para manter)" : "Senha"}
              </Label>
              <Input
                id="user-password"
                type="password"
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                placeholder={editingUser ? "••••••" : "Mínimo 6 caracteres"}
                minLength={editingUser ? 0 : 6}
                required={!editingUser}
              />
            </div>

            <div className="space-y-2">
              <Label>Perfis de acesso</Label>
              <div className="space-y-2 rounded-lg border p-3">
                {ROLES.map((role) => (
                  <div key={role} className="flex items-center gap-3">
                    <Checkbox
                      id={`role-${role}`}
                      checked={form.roles.includes(role)}
                      onCheckedChange={() => toggleRole(role)}
                    />
                    <label
                      htmlFor={`role-${role}`}
                      className="flex flex-col cursor-pointer select-none"
                    >
                      <span className="text-sm font-medium">{ROLE_LABELS[role]}</span>
                      <span className="text-xs text-muted-foreground">
                        {role === "admin" && "Acesso completo a todas as funcionalidades"}
                        {role === "profissional" && "Pacientes, prontuário, agenda e relatórios"}
                        {role === "secretaria" && "Agenda e consulta de pacientes"}
                      </span>
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={closeDialog}
              >
                Cancelar
              </Button>
              <Button type="submit" className="flex-1" disabled={isPending}>
                {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {editingUser ? "Salvar alterações" : "Criar usuário"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Section: Agendas ──────────────────────────────────────── */

