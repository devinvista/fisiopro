import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Users,
  LogIn,
  UserPlus,
  UserMinus,
  Phone,
  Mail,
  MapPin,
  Upload,
  ImageIcon,
  X,
  User2,
  Award,
  UserCheck,
  Hash,
  Globe,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { maskCpf, maskPhone, maskCnpj } from "@/utils/masks";
import { apiFetch } from "@/utils/api";

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = BASE.replace(/\/$/, "").replace(/\/[^/]+$/, "");

async function fetchClinics() {
  const res = await apiFetch(`${API_BASE}/api/clinics`);
  if (!res.ok) throw new Error("Failed to fetch clinics");
  return res.json();
}

async function createClinic(data: Record<string, string>) {
  const res = await apiFetch(`${API_BASE}/api/clinics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || "Erro ao criar clínica");
  }
  return res.json();
}

async function updateClinic(id: number, data: Record<string, unknown>) {
  const res = await apiFetch(`${API_BASE}/api/clinics/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Erro ao atualizar clínica");
  return res.json();
}

async function deleteClinic(id: number) {
  const res = await apiFetch(`${API_BASE}/api/clinics/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Erro ao excluir clínica");
}

async function fetchClinicUsers(clinicId: number) {
  const res = await apiFetch(`${API_BASE}/api/clinics/${clinicId}/users`);
  if (!res.ok) throw new Error("Falha ao buscar usuários");
  return res.json();
}

async function addUserToClinic(clinicId: number, data: Record<string, unknown>) {
  const res = await apiFetch(`${API_BASE}/api/clinics/${clinicId}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || "Erro ao adicionar usuário");
  }
  return res.json();
}

async function updateUserInClinic(
  clinicId: number,
  userId: number,
  data: Record<string, unknown>
) {
  const res = await apiFetch(`${API_BASE}/api/clinics/${clinicId}/users/${userId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || "Erro ao atualizar usuário");
  }
  return res.json();
}

async function removeUserFromClinic(clinicId: number, userId: number) {
  const res = await apiFetch(`${API_BASE}/api/clinics/${clinicId}/users/${userId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Erro ao remover usuário");
}

async function impersonateClinic(clinicId: number) {
  const res = await apiFetch(`${API_BASE}/api/clinics/${clinicId}/impersonate`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Erro ao acessar clínica");
  return res.json();
}

interface Clinic {
  id: number;
  name: string;
  type?: string | null;
  cnpj?: string | null;
  cpf?: string | null;
  crefito?: string | null;
  responsibleTechnical?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  isActive: boolean;
  createdAt: string;
}

interface ClinicUser {
  id: number;
  name: string;
  email: string | null;
  roles: string[];
}

interface ClinicFormData {
  name: string;
  type: string;
  cnpj: string;
  cpf: string;
  crefito: string;
  responsibleTechnical: string;
  phone: string;
  email: string;
  address: string;
  website: string;
  logoUrl: string;
}

interface AddUserFormData {
  name: string;
  cpf: string;
  email: string;
  password: string;
  roles: string[];
}

interface EditUserFormData {
  name: string;
  email: string;
  password: string;
  roles: string[];
}

const EMPTY_FORM: ClinicFormData = { name: "", type: "clinica", cnpj: "", cpf: "", crefito: "", responsibleTechnical: "", phone: "", email: "", address: "", website: "", logoUrl: "" };
const EMPTY_ADD_USER: AddUserFormData = { name: "", cpf: "", email: "", password: "", roles: ["profissional"] };

const ALL_ROLES = [
  { value: "admin", label: "Administrador" },
  { value: "profissional", label: "Profissional" },
  { value: "secretaria", label: "Secretaria" },
];

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-violet-100 text-violet-800 border-violet-200",
  profissional: "bg-blue-100 text-blue-800 border-blue-200",
  secretaria: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

function RoleCheckboxes({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (roles: string[]) => void;
}) {
  const toggle = (role: string) => {
    if (selected.includes(role)) {
      const next = selected.filter((r) => r !== role);
      if (next.length > 0) onChange(next);
    } else {
      onChange([...selected, role]);
    }
  };

  return (
    <div className="flex flex-wrap gap-3">
      {ALL_ROLES.map(({ value, label }) => (
        <label
          key={value}
          className={`flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border transition-colors ${
            selected.includes(value)
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/40 bg-background"
          }`}
        >
          <Checkbox
            checked={selected.includes(value)}
            onCheckedChange={() => toggle(value)}
          />
          <span className="text-sm font-medium">{label}</span>
        </label>
      ))}
    </div>
  );
}

export default function Clinicas() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingClinic, setEditingClinic] = useState<Clinic | null>(null);
  const [deletingClinicId, setDeletingClinicId] = useState<number | null>(null);
  const [formData, setFormData] = useState<ClinicFormData>(EMPTY_FORM);

  const [managingClinic, setManagingClinic] = useState<Clinic | null>(null);
  const [addUserForm, setAddUserForm] = useState<AddUserFormData>(EMPTY_ADD_USER);
  const [editingUser, setEditingUser] = useState<ClinicUser | null>(null);
  const [editUserForm, setEditUserForm] = useState<EditUserFormData>({
    name: "",
    email: "",
    password: "",
    roles: [],
  });
  const [removingUserId, setRemovingUserId] = useState<number | null>(null);

  const { data: clinics = [], isLoading } = useQuery<Clinic[]>({
    queryKey: ["clinics"],
    queryFn: fetchClinics,
  });

  const { data: clinicUsers = [], isLoading: isLoadingUsers } = useQuery<ClinicUser[]>({
    queryKey: ["clinic-users", managingClinic?.id],
    queryFn: () => fetchClinicUsers(managingClinic!.id),
    enabled: !!managingClinic,
  });

  const createMutation = useMutation({
    mutationFn: createClinic,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinics"] });
      queryClient.invalidateQueries({ queryKey: ["all-clinics-switcher"] });
      toast({ title: "Clínica criada com sucesso!" });
      setIsCreateOpen(false);
      setFormData(EMPTY_FORM);
    },
    onError: (err: any) => toast({ variant: "destructive", title: "Erro", description: err.message }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      updateClinic(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinics"] });
      queryClient.invalidateQueries({ queryKey: ["all-clinics-switcher"] });
      toast({ title: "Clínica atualizada!" });
      setEditingClinic(null);
      setFormData(EMPTY_FORM);
    },
    onError: (err: any) => toast({ variant: "destructive", title: "Erro", description: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteClinic,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinics"] });
      queryClient.invalidateQueries({ queryKey: ["all-clinics-switcher"] });
      toast({ title: "Clínica excluída." });
      setDeletingClinicId(null);
    },
    onError: () => toast({ variant: "destructive", title: "Erro ao excluir clínica" }),
  });

  const addUserMutation = useMutation({
    mutationFn: ({ clinicId, data }: { clinicId: number; data: Record<string, unknown> }) =>
      addUserToClinic(clinicId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinic-users", managingClinic?.id] });
      toast({ title: "Usuário adicionado à clínica!" });
      setAddUserForm(EMPTY_ADD_USER);
    },
    onError: (err: any) => toast({ variant: "destructive", title: "Erro", description: err.message }),
  });

  const updateUserMutation = useMutation({
    mutationFn: ({
      clinicId,
      userId,
      data,
    }: {
      clinicId: number;
      userId: number;
      data: Record<string, unknown>;
    }) => updateUserInClinic(clinicId, userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinic-users", managingClinic?.id] });
      toast({ title: "Usuário atualizado!" });
      setEditingUser(null);
    },
    onError: (err: any) => toast({ variant: "destructive", title: "Erro", description: err.message }),
  });

  const removeUserMutation = useMutation({
    mutationFn: ({ clinicId, userId }: { clinicId: number; userId: number }) =>
      removeUserFromClinic(clinicId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinic-users", managingClinic?.id] });
      toast({ title: "Usuário removido da clínica." });
      setRemovingUserId(null);
    },
    onError: () => toast({ variant: "destructive", title: "Erro ao remover usuário" }),
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData as unknown as Record<string, string>);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClinic) return;
    updateMutation.mutate({ id: editingClinic.id, data: formData as unknown as Record<string, unknown> });
  };

  const openEdit = (clinic: Clinic) => {
    setEditingClinic(clinic);
    setFormData({
      name: clinic.name,
      type: clinic.type ?? "clinica",
      cnpj: clinic.cnpj ? maskCnpj(clinic.cnpj) : "",
      cpf: clinic.cpf ? maskCpf(clinic.cpf) : "",
      crefito: clinic.crefito ?? "",
      responsibleTechnical: clinic.responsibleTechnical ?? "",
      phone: clinic.phone ?? "",
      email: clinic.email ?? "",
      address: clinic.address ?? "",
      website: clinic.website ?? "",
      logoUrl: clinic.logoUrl ?? "",
    });
  };

  const toggleActive = (clinic: Clinic) => {
    updateMutation.mutate({ id: clinic.id, data: { isActive: !clinic.isActive } });
  };

  const handleAddUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!managingClinic) return;
    if (addUserForm.roles.length === 0) {
      toast({ variant: "destructive", title: "Selecione ao menos um perfil" });
      return;
    }
    addUserMutation.mutate({
      clinicId: managingClinic.id,
      data: {
        name: addUserForm.name,
        cpf: addUserForm.cpf,
        email: addUserForm.email || undefined,
        password: addUserForm.password,
        roles: addUserForm.roles,
      },
    });
  };

  const openEditUser = (user: ClinicUser) => {
    setEditingUser(user);
    setEditUserForm({
      name: user.name,
      email: user.email ?? "",
      password: "",
      roles: [...user.roles],
    });
  };

  const handleEditUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!managingClinic || !editingUser) return;
    if (editUserForm.roles.length === 0) {
      toast({ variant: "destructive", title: "Selecione ao menos um perfil" });
      return;
    }
    const data: Record<string, unknown> = {
      name: editUserForm.name,
      email: editUserForm.email || undefined,
      roles: editUserForm.roles,
    };
    if (editUserForm.password) data.password = editUserForm.password;
    updateUserMutation.mutate({ clinicId: managingClinic.id, userId: editingUser.id, data });
  };

  const handleImpersonate = async (clinic: Clinic) => {
    try {
      const data = await impersonateClinic(clinic.id);
      localStorage.setItem("fisiogest_token", data.token);
      localStorage.setItem("fisiogest_clinic_id", String(data.clinicId));
      toast({ title: `Acessando clínica: ${clinic.name}` });
      setTimeout(() => { window.location.href = "/"; }, 500);
    } catch {
      toast({ variant: "destructive", title: "Erro ao acessar clínica" });
    }
  };

  return (
    <AppLayout title="Gestão de Clínicas">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Todas as Clínicas</h2>
            <p className="text-sm text-muted-foreground">{clinics.length} clínica(s) cadastrada(s)</p>
          </div>
          <Button onClick={() => { setFormData(EMPTY_FORM); setIsCreateOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" /> Nova Clínica
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : clinics.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-20 gap-4">
              <Building2 className="h-16 w-16 text-muted-foreground/30" />
              <div className="text-center">
                <h3 className="font-semibold text-foreground">Nenhuma clínica cadastrada</h3>
                <p className="text-muted-foreground text-sm">Crie a primeira clínica para começar.</p>
              </div>
              <Button onClick={() => setIsCreateOpen(true)} variant="outline" className="gap-2">
                <Plus className="h-4 w-4" /> Criar Clínica
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {clinics.map((clinic) => (
              <Card key={clinic.id} className={`relative transition-all ${!clinic.isActive ? "opacity-60" : ""}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                        {clinic.logoUrl
                          ? <img src={clinic.logoUrl} alt="Logo" className="h-10 w-10 object-contain p-1" />
                          : clinic.type === "autonomo"
                            ? <User2 className="h-5 w-5 text-primary" />
                            : <Building2 className="h-5 w-5 text-primary" />}
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-base truncate">{clinic.name}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {clinic.type === "autonomo"
                            ? (clinic.cpf ? maskCpf(clinic.cpf) : "Profissional Autônomo")
                            : (clinic.cnpj ? maskCnpj(clinic.cnpj) : "Clínica / Empresa")}
                        </p>
                      </div>
                    </div>
                    <Badge variant={clinic.isActive ? "default" : "secondary"} className="shrink-0 text-xs">
                      {clinic.isActive ? "Ativa" : "Inativa"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(clinic.phone || clinic.email || clinic.address) && (
                    <div className="text-xs text-muted-foreground space-y-1">
                      {clinic.phone && <p className="flex items-center gap-1.5"><Phone className="h-3 w-3" /> {clinic.phone}</p>}
                      {clinic.email && <p className="flex items-center gap-1.5"><Mail className="h-3 w-3" /> {clinic.email}</p>}
                      {clinic.address && <p className="flex items-center gap-1.5"><MapPin className="h-3 w-3" /> {clinic.address}</p>}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-border">
                    <Button size="sm" variant="ghost" className="gap-1.5 text-xs h-8" onClick={() => openEdit(clinic)}>
                      <Pencil className="h-3 w-3" /> Editar
                    </Button>
                    <Button size="sm" variant="ghost" className="gap-1.5 text-xs h-8"
                      onClick={() => { setManagingClinic(clinic); setAddUserForm(EMPTY_ADD_USER); }}>
                      <Users className="h-3 w-3" /> Usuários
                    </Button>
                    <Button size="sm" variant="ghost" className="gap-1.5 text-xs h-8" onClick={() => toggleActive(clinic)}>
                      {clinic.isActive ? <ToggleRight className="h-3 w-3" /> : <ToggleLeft className="h-3 w-3" />}
                      {clinic.isActive ? "Desativar" : "Ativar"}
                    </Button>
                    <Button size="sm" variant="ghost" className="gap-1.5 text-xs h-8 text-primary hover:text-primary" onClick={() => handleImpersonate(clinic)}>
                      <LogIn className="h-3 w-3" /> Acessar
                    </Button>
                    <Button size="sm" variant="ghost"
                      className="col-span-2 gap-1.5 text-xs h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setDeletingClinicId(clinic.id)}>
                      <Trash2 className="h-3 w-3" /> Excluir Clínica
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Clinic Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Clínica</DialogTitle>
            <DialogDescription>Preencha os dados da nova clínica.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <ClinicForm formData={formData} setFormData={setFormData} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar Clínica"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Clinic Dialog */}
      <Dialog open={!!editingClinic} onOpenChange={(open) => !open && setEditingClinic(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Clínica</DialogTitle>
            <DialogDescription>Atualize os dados de {editingClinic?.name}.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <ClinicForm formData={formData} setFormData={setFormData} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingClinic(null)}>Cancelar</Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Manage Users Dialog */}
      <Dialog open={!!managingClinic} onOpenChange={(open) => !open && setManagingClinic(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Usuários — {managingClinic?.name}
            </DialogTitle>
            <DialogDescription>
              Gerencie os usuários com acesso a esta clínica. Um usuário pode ter múltiplos perfis.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Add User Form */}
            <form onSubmit={handleAddUserSubmit} className="border border-border rounded-xl p-4 space-y-4 bg-muted/30">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-primary" /> Adicionar usuário
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nome *</Label>
                  <Input placeholder="Nome completo" value={addUserForm.name}
                    onChange={(e) => setAddUserForm((p) => ({ ...p, name: e.target.value }))} required />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">CPF *</Label>
                  <Input placeholder="000.000.000-00" value={addUserForm.cpf}
                    onChange={(e) => setAddUserForm((p) => ({ ...p, cpf: maskCpf(e.target.value) }))} required />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">E-mail</Label>
                  <Input type="email" placeholder="email@clinica.com" value={addUserForm.email}
                    onChange={(e) => setAddUserForm((p) => ({ ...p, email: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Senha *</Label>
                  <Input type="password" placeholder="Senha inicial" value={addUserForm.password}
                    onChange={(e) => setAddUserForm((p) => ({ ...p, password: e.target.value }))} required />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Perfis de acesso *</Label>
                <RoleCheckboxes
                  selected={addUserForm.roles}
                  onChange={(roles) => setAddUserForm((p) => ({ ...p, roles }))}
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={addUserMutation.isPending} className="gap-2">
                  {addUserMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  Adicionar
                </Button>
              </div>
            </form>

            {/* User List */}
            <div>
              <p className="text-sm font-semibold text-foreground mb-3">
                Usuários da clínica ({clinicUsers.length})
              </p>
              {isLoadingUsers ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : clinicUsers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm border border-dashed border-border rounded-xl">
                  Nenhum usuário nesta clínica
                </div>
              ) : (
                <div className="border border-border rounded-xl overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="text-xs">Nome</TableHead>
                        <TableHead className="text-xs hidden sm:table-cell">E-mail</TableHead>
                        <TableHead className="text-xs">Perfis</TableHead>
                        <TableHead className="w-20 text-xs text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clinicUsers.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium text-sm">{u.name}</TableCell>
                          <TableCell className="text-muted-foreground text-xs hidden sm:table-cell">{u.email ?? "—"}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {u.roles.map((r) => (
                                <span key={r}
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${ROLE_COLORS[r] ?? "bg-gray-100 text-gray-700"}`}>
                                  {ALL_ROLES.find((x) => x.value === r)?.label ?? r}
                                </span>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={() => openEditUser(u)} title="Editar usuário">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => setRemovingUserId(u.id)} title="Remover da clínica">
                                <UserMinus className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setManagingClinic(null)}>Fechar</Button>
            <Button className="gap-2" onClick={() => handleImpersonate(managingClinic!)}>
              <LogIn className="h-4 w-4" /> Acessar como Admin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" /> Editar Usuário
            </DialogTitle>
            <DialogDescription>
              Atualize os dados e perfis de <strong>{editingUser?.name}</strong> nesta clínica.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditUserSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input value={editUserForm.name}
                onChange={(e) => setEditUserForm((p) => ({ ...p, name: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input type="email" value={editUserForm.email}
                onChange={(e) => setEditUserForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="Deixe em branco para manter" />
            </div>
            <div className="space-y-1.5">
              <Label>Nova senha</Label>
              <Input type="password" value={editUserForm.password}
                onChange={(e) => setEditUserForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="Deixe em branco para não alterar" />
            </div>
            <div className="space-y-1.5">
              <Label>Perfis de acesso *</Label>
              <RoleCheckboxes
                selected={editUserForm.roles}
                onChange={(roles) => setEditUserForm((p) => ({ ...p, roles }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingUser(null)}>Cancelar</Button>
              <Button type="submit" disabled={updateUserMutation.isPending}>
                {updateUserMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar alterações"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Remove User Confirm */}
      <AlertDialog open={!!removingUserId} onOpenChange={(open) => !open && setRemovingUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover usuário da clínica</AlertDialogTitle>
            <AlertDialogDescription>
              O usuário perderá acesso a esta clínica. A conta do usuário não será excluída.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90"
              onClick={() => managingClinic && removingUserId &&
                removeUserMutation.mutate({ clinicId: managingClinic.id, userId: removingUserId })}>
              {removeUserMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Clinic Confirm */}
      <AlertDialog open={!!deletingClinicId} onOpenChange={(open) => !open && setDeletingClinicId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Clínica</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. Todos os dados associados a esta clínica serão perdidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90"
              onClick={() => deletingClinicId && deleteMutation.mutate(deletingClinicId)}>
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

function ClinicForm({
  formData,
  setFormData,
}: {
  formData: ClinicFormData;
  setFormData: (data: any) => void;
}) {
  const { toast } = useToast();
  const isAutonomo = formData.type === "autonomo";
  const [logoPreview, setLogoPreview] = useState(formData.logoUrl || "");

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ variant: "destructive", title: "Logo muito grande", description: "Selecione uma imagem de até 2 MB." });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setLogoPreview(dataUrl);
      setFormData((p: any) => ({ ...p, logoUrl: dataUrl }));
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      {/* Type selector */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setFormData((p: any) => ({ ...p, type: "autonomo" }))}
          className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 transition-all cursor-pointer ${
            isAutonomo ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-border/80 text-muted-foreground"
          }`}
        >
          <User2 className="h-5 w-5" />
          <div className="text-center">
            <p className="text-xs font-semibold">Profissional Autônomo</p>
            <p className="text-[10px] text-muted-foreground">CPF · CREFITO/CREF</p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setFormData((p: any) => ({ ...p, type: "clinica" }))}
          className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 transition-all cursor-pointer ${
            !isAutonomo ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-border/80 text-muted-foreground"
          }`}
        >
          <Building2 className="h-5 w-5" />
          <div className="text-center">
            <p className="text-xs font-semibold">Clínica / Empresa</p>
            <p className="text-[10px] text-muted-foreground">CNPJ · Resp. Técnico</p>
          </div>
        </button>
      </div>

      {/* Logo */}
      <div className="space-y-1.5">
        <Label className="text-xs flex items-center gap-1.5"><Upload className="h-3 w-3" /> Logotipo</Label>
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-lg border-2 border-dashed border-border flex items-center justify-center overflow-hidden bg-muted/30 shrink-0">
            {logoPreview
              ? <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-1" />
              : <ImageIcon className="h-5 w-5 text-muted-foreground/40" />}
          </div>
          <div className="space-y-1">
            <label className="flex items-center gap-1.5 cursor-pointer w-fit">
              <div className="inline-flex items-center gap-1 text-xs font-medium border border-border rounded-lg px-2.5 py-1.5 hover:bg-muted transition-colors">
                <Upload className="h-3 w-3" /> Escolher imagem
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
            </label>
            {logoPreview && (
              <button type="button" onClick={() => { setLogoPreview(""); setFormData((p: any) => ({ ...p, logoUrl: "" })); }}
                className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80">
                <X className="h-3 w-3" /> Remover
              </button>
            )}
            <p className="text-[10px] text-muted-foreground">PNG, JPG · máx. 2 MB</p>
          </div>
        </div>
      </div>

      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="clinicName" className="text-xs">
          {isAutonomo ? "Nome do Profissional / Consultório *" : "Nome da Clínica *"}
        </Label>
        <Input id="clinicName" value={formData.name} required
          onChange={(e) => setFormData((p: any) => ({ ...p, name: e.target.value }))}
          placeholder={isAutonomo ? "Dr. João Silva — Fisioterapia" : "Clínica FisioGest"} />
      </div>

      {/* ID fields */}
      {isAutonomo ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1"><Hash className="h-3 w-3" /> CPF</Label>
            <Input value={formData.cpf}
              onChange={(e) => setFormData((p: any) => ({ ...p, cpf: maskCpf(e.target.value) }))}
              placeholder="000.000.000-00" maxLength={14} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1"><Award className="h-3 w-3" /> CREFITO / CREF</Label>
            <Input value={formData.crefito}
              onChange={(e) => setFormData((p: any) => ({ ...p, crefito: e.target.value }))}
              placeholder="CREFITO-3/12345-F" />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1"><Hash className="h-3 w-3" /> CNPJ</Label>
            <Input value={formData.cnpj}
              onChange={(e) => setFormData((p: any) => ({ ...p, cnpj: maskCnpj(e.target.value) }))}
              placeholder="00.000.000/0001-00" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><UserCheck className="h-3 w-3" /> Responsável Técnico</Label>
              <Input value={formData.responsibleTechnical}
                onChange={(e) => setFormData((p: any) => ({ ...p, responsibleTechnical: e.target.value }))}
                placeholder="Nome completo do RT" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><Award className="h-3 w-3" /> CREFITO / CREF do RT</Label>
              <Input value={formData.crefito}
                onChange={(e) => setFormData((p: any) => ({ ...p, crefito: e.target.value }))}
                placeholder="CREFITO-3/12345-F" />
            </div>
          </div>
        </div>
      )}

      {/* Contact */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1"><Phone className="h-3 w-3" /> Telefone</Label>
          <Input value={formData.phone}
            onChange={(e) => setFormData((p: any) => ({ ...p, phone: maskPhone(e.target.value) }))}
            placeholder="(11) 99999-9999" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1"><Mail className="h-3 w-3" /> E-mail</Label>
          <Input type="email" value={formData.email}
            onChange={(e) => setFormData((p: any) => ({ ...p, email: e.target.value }))}
            placeholder="contato@clinica.com" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs flex items-center gap-1"><MapPin className="h-3 w-3" /> Endereço</Label>
        <Input value={formData.address}
          onChange={(e) => setFormData((p: any) => ({ ...p, address: e.target.value }))}
          placeholder="Rua, número, bairro, cidade" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs flex items-center gap-1"><Globe className="h-3 w-3" /> Site / Redes Sociais</Label>
        <Input value={formData.website}
          onChange={(e) => setFormData((p: any) => ({ ...p, website: e.target.value }))}
          placeholder="www.clinica.com.br" />
      </div>
    </div>
  );
}
