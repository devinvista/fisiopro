import { useState, useEffect } from "react";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { useListPatients, useCreatePatient } from "@workspace/api-client-react";
import { useAuth } from "@/utils/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Search,
  Plus,
  UserPlus,
  Phone,
  Mail,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Loader2,
  LayoutGrid,
  LayoutList,
  Users,
  Calendar,
  MapPin,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { maskCpf, maskPhone, displayCpf } from "@/utils/masks";
import { DatePickerPTBR } from "@/components/ui/date-picker-ptbr";
import { cn } from "@/utils/utils";

type ViewMode = "cards" | "list";
type SortField = "name" | "birthDate" | "phone" | "email" | "profession";
type SortDir = "asc" | "desc";

interface Patient {
  id: number;
  name: string;
  cpf: string;
  phone: string;
  email?: string | null;
  birthDate?: string | null;
  address?: string | null;
  profession?: string | null;
  createdAt: string;
}

function calcAge(birthDate?: string | null): string | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate + "T12:00:00");
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return `${age} anos`;
}

function formatDate(date?: string | null): string | null {
  if (!date) return null;
  return new Date(date + "T12:00:00").toLocaleDateString("pt-BR");
}

export default function PatientsList() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem("patients_view_mode") as ViewMode) ?? "list";
  });
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, refetch } = useListPatients({ search: debouncedSearch, limit: 50 });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("patients.create");

  function changeView(mode: ViewMode) {
    setViewMode(mode);
    localStorage.setItem("patients_view_mode", mode);
  }

  const patients = (data?.data ?? []) as Patient[];
  const total = data?.total ?? 0;

  return (
    <AppLayout title="Pacientes">
      <div className="space-y-5">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold font-display text-slate-800">Pacientes</h1>
            <p className="text-sm text-slate-500">Gerencie o cadastro e prontuários dos pacientes</p>
          </div>
          {canCreate && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="h-9 px-4 rounded-lg shadow-md shadow-primary/20">
                  <Plus className="w-4 h-4 mr-1.5" />
                  Novo Paciente
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] border-none shadow-2xl rounded-2xl max-h-[90vh] overflow-y-auto">
                <CreatePatientForm onSuccess={() => { setIsDialogOpen(false); refetch(); }} />
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* ── Stats strip ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total de Pacientes", value: total, icon: <Users className="w-4 h-4" />, accent: "#6366f1" },
            { label: "Exibidos Agora", value: patients.length, icon: <Search className="w-4 h-4" />, accent: "#0ea5e9" },
            { label: "Com E-mail", value: patients.filter(p => p.email).length, icon: <Mail className="w-4 h-4" />, accent: "#10b981" },
          ].map((s, i) => (
            <div key={i} className="relative bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ backgroundColor: s.accent }} />
              <div className="pl-4 pr-4 py-3.5 flex items-center gap-3">
                <div className="p-2 rounded-xl shrink-0" style={{ backgroundColor: `${s.accent}18`, color: s.accent }}>
                  {s.icon}
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{s.label}</p>
                  {isLoading
                    ? <div className="h-6 w-10 bg-slate-100 animate-pulse rounded mt-1" />
                    : <p className="text-xl font-extrabold text-slate-900 tabular-nums">{s.value}</p>
                  }
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Filters + View toggle ────────────────────────────────────────── */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <Input
              placeholder="Buscar por nome, CPF ou telefone..."
              className="pl-8 h-9 text-sm rounded-lg bg-white"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* View toggle */}
          <div className="ml-auto flex items-center border border-slate-200 rounded-lg overflow-hidden">
            <button
              onClick={() => changeView("cards")}
              className={cn(
                "p-1.5 transition-colors",
                viewMode === "cards" ? "bg-primary text-white" : "hover:bg-slate-50 text-slate-500"
              )}
              title="Cards"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => changeView("list")}
              className={cn(
                "p-1.5 transition-colors border-l border-slate-200",
                viewMode === "list" ? "bg-primary text-white" : "hover:bg-slate-50 text-slate-500"
              )}
              title="Lista"
            >
              <LayoutList className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Content ─────────────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-50">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="px-4 py-3.5 flex items-center gap-4 animate-pulse">
                <div className="w-8 h-8 rounded-full bg-slate-100 shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-40 bg-slate-100 rounded" />
                  <div className="h-2.5 w-24 bg-slate-100 rounded" />
                </div>
                <div className="h-3 w-28 bg-slate-100 rounded hidden md:block" />
                <div className="h-3 w-20 bg-slate-100 rounded hidden lg:block" />
                <div className="w-4 h-4 bg-slate-100 rounded shrink-0" />
              </div>
            ))}
          </div>
        ) : patients.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-16 text-center shadow-sm">
            <div className="bg-primary/5 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
              <UserPlus className="w-10 h-10 text-primary" />
            </div>
            <h3 className="text-2xl font-display font-bold text-slate-800 mb-2">Nenhum paciente encontrado</h3>
            <p className="text-slate-500 max-w-md mx-auto mb-8">
              {search
                ? "Tente ajustar os termos da sua busca."
                : "Comece cadastrando seu primeiro paciente para gerenciar prontuários e agendamentos."}
            </p>
            {!search && (
              <Button onClick={() => setIsDialogOpen(true)} className="h-12 px-8 rounded-xl">
                Cadastrar Primeiro Paciente
              </Button>
            )}
          </div>
        ) : viewMode === "cards" ? (
          <CardView patients={patients} />
        ) : (
          <ListView
            patients={patients}
            sortField={sortField}
            sortDir={sortDir}
            onSort={handleSort}
          />
        )}

      </div>
    </AppLayout>
  );
}

// ─── Card View ────────────────────────────────────────────────────────────────

function CardView({ patients }: { patients: Patient[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
      {patients.map((patient) => {
        const age = calcAge(patient.birthDate);
        const initials = patient.name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();

        return (
          <Link key={patient.id} href={`/pacientes/${patient.id}`}>
            <div className="bg-white rounded-2xl border border-slate-200 cursor-pointer group hover:shadow-lg hover:border-primary/30 transition-all duration-200 overflow-hidden h-full">
              {/* top accent */}
              <div className="h-1 bg-gradient-to-r from-primary/60 to-primary" />

              <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-base group-hover:scale-110 transition-transform shrink-0">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-base text-slate-800 leading-tight truncate">
                        {patient.name}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">CPF: {displayCpf(patient.cpf)}</p>
                    </div>
                  </div>
                  {age && (
                    <span className="shrink-0 ml-2 text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">
                      {age}
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center text-sm text-slate-600 gap-2.5">
                    <div className="p-1 bg-slate-100 rounded-md shrink-0">
                      <Phone className="w-3.5 h-3.5 text-slate-500" />
                    </div>
                    <span className="truncate">{patient.phone}</span>
                  </div>
                  {patient.email && (
                    <div className="flex items-center text-sm text-slate-600 gap-2.5">
                      <div className="p-1 bg-slate-100 rounded-md shrink-0">
                        <Mail className="w-3.5 h-3.5 text-slate-500" />
                      </div>
                      <span className="truncate">{patient.email}</span>
                    </div>
                  )}
                  {patient.address && (
                    <div className="flex items-center text-sm text-slate-600 gap-2.5">
                      <div className="p-1 bg-slate-100 rounded-md shrink-0">
                        <MapPin className="w-3.5 h-3.5 text-slate-500" />
                      </div>
                      <span className="truncate">{patient.address}</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  {patient.profession ? (
                    <span className="text-xs text-slate-400 truncate">{patient.profession}</span>
                  ) : (
                    <span />
                  )}
                  <span className="text-primary text-xs font-semibold flex items-center gap-1 group-hover:translate-x-1 transition-transform shrink-0 ml-2">
                    Ver prontuário <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// ─── List View ────────────────────────────────────────────────────────────────

interface ListViewProps {
  patients: Patient[];
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
}

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (sortField !== field) return <ChevronsUpDown className="w-3 h-3 ml-1 opacity-40" />;
  return sortDir === "asc"
    ? <ChevronUp className="w-3 h-3 ml-1 text-primary" />
    : <ChevronDown className="w-3 h-3 ml-1 text-primary" />;
}

function ListView({ patients, sortField, sortDir, onSort }: ListViewProps) {
  const sorted = [...patients].sort((a, b) => {
    let va: string = "";
    let vb: string = "";
    if (sortField === "name") { va = a.name ?? ""; vb = b.name ?? ""; }
    else if (sortField === "birthDate") { va = a.birthDate ?? ""; vb = b.birthDate ?? ""; }
    else if (sortField === "phone") { va = a.phone ?? ""; vb = b.phone ?? ""; }
    else if (sortField === "email") { va = a.email ?? ""; vb = b.email ?? ""; }
    else if (sortField === "profession") { va = a.profession ?? ""; vb = b.profession ?? ""; }
    const cmp = va.localeCompare(vb, "pt-BR", { sensitivity: "base" });
    return sortDir === "asc" ? cmp : -cmp;
  });

  function HeaderCell({
    field,
    label,
    className,
  }: {
    field: SortField;
    label: string;
    className?: string;
  }) {
    const active = sortField === field;
    return (
      <button
        onClick={() => onSort(field)}
        className={cn(
          "flex items-center text-[11px] font-bold uppercase tracking-wider transition-colors select-none",
          active ? "text-primary" : "text-slate-400 hover:text-slate-600",
          className
        )}
      >
        {label}
        <SortIcon field={field} sortField={sortField} sortDir={sortDir} />
      </button>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* Header — responsive columns */}
      <div className="grid items-center border-b border-slate-100 bg-slate-50/80 px-4 py-2.5
        grid-cols-[1fr_36px]
        sm:grid-cols-[1fr_140px_36px]
        lg:grid-cols-[2fr_110px_140px_160px_120px_36px]">
        <HeaderCell field="name" label="Paciente" />
        <HeaderCell field="birthDate" label="Nasc." className="hidden lg:flex" />
        <HeaderCell field="phone" label="Telefone" className="hidden sm:flex" />
        <HeaderCell field="email" label="E-mail" className="hidden lg:flex" />
        <HeaderCell field="profession" label="Profissão" className="hidden lg:flex" />
        <span />
      </div>

      {/* Rows */}
      {sorted.map((patient, idx) => {
        const age = calcAge(patient.birthDate);
        const dob = formatDate(patient.birthDate);
        const initials = patient.name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();

        return (
          <Link key={patient.id} href={`/pacientes/${patient.id}`}>
            <div
              className={cn(
                "grid items-center px-4 py-3 hover:bg-primary/[0.03] transition-colors cursor-pointer group",
                "grid-cols-[1fr_36px] sm:grid-cols-[1fr_140px_36px] lg:grid-cols-[2fr_110px_140px_160px_120px_36px]",
                idx !== sorted.length - 1 && "border-b border-slate-100"
              )}
            >
              {/* Name + CPF — always visible */}
              <div className="flex items-center gap-3 min-w-0 pr-2">
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0 group-hover:scale-110 transition-transform">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-slate-800 truncate">{patient.name}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    CPF: {displayCpf(patient.cpf)}
                    {/* On mobile show phone inline under name */}
                    <span className="sm:hidden ml-2 text-slate-500">{patient.phone}</span>
                  </p>
                </div>
              </div>

              {/* Birth date — lg+ only */}
              <div className="hidden lg:block">
                {dob ? (
                  <div>
                    <p className="text-xs text-slate-700">{dob}</p>
                    {age && <p className="text-[11px] text-slate-400 mt-0.5">{age}</p>}
                  </div>
                ) : (
                  <span className="text-xs text-slate-300">—</span>
                )}
              </div>

              {/* Phone — sm+ only */}
              <div className="hidden sm:flex items-center gap-1.5">
                <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                <span className="text-xs text-slate-600 truncate">{patient.phone}</span>
              </div>

              {/* Email — lg+ only */}
              <div className="hidden lg:block min-w-0 pr-2">
                {patient.email ? (
                  <div className="flex items-center gap-1.5">
                    <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="text-xs text-slate-600 truncate">{patient.email}</span>
                  </div>
                ) : (
                  <span className="text-xs text-slate-300">—</span>
                )}
              </div>

              {/* Profession — lg+ only */}
              <div className="hidden lg:block">
                {patient.profession ? (
                  <span className="text-xs text-slate-500 truncate block">{patient.profession}</span>
                ) : (
                  <span className="text-xs text-slate-300">—</span>
                )}
              </div>

              {/* Arrow */}
              <div className="flex items-center justify-end">
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// ─── Create Patient Form ──────────────────────────────────────────────────────

function CreatePatientForm({ onSuccess }: { onSuccess: () => void }) {
  const [formData, setFormData] = useState({
    name: "",
    cpf: "",
    phone: "",
    email: "",
    birthDate: "",
    profession: "",
    address: "",
    emergencyContact: "",
    notes: "",
  });
  const mutation = useCreatePatient();
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: formData.name,
      cpf: formData.cpf,
      phone: formData.phone,
      email: formData.email || undefined,
      birthDate: formData.birthDate || undefined,
      profession: formData.profession || undefined,
      address: formData.address || undefined,
      emergencyContact: formData.emergencyContact || undefined,
      notes: formData.notes || undefined,
    };
    mutation.mutate(
      { data: payload },
      {
        onSuccess: () => {
          toast({ title: "Sucesso", description: "Paciente cadastrado com sucesso!" });
          onSuccess();
        },
        onError: (err: any) => {
          const message =
            err?.data?.message ?? err?.message ?? "Falha ao cadastrar paciente.";
          toast({ variant: "destructive", title: "Erro", description: message });
        },
      }
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="font-display text-2xl">Novo Paciente</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>Nome Completo *</Label>
          <Input
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="h-11"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>CPF *</Label>
            <Input
              required
              value={formData.cpf}
              onChange={(e) => setFormData({ ...formData, cpf: maskCpf(e.target.value) })}
              placeholder="000.000.000-00"
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label>Telefone *</Label>
            <Input
              required
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: maskPhone(e.target.value) })}
              placeholder="(11) 99999-0000"
              className="h-11"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>E-mail</Label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label>Data de Nascimento</Label>
            <DatePickerPTBR
              value={formData.birthDate}
              onChange={(v) => setFormData({ ...formData, birthDate: v })}
              className="h-11"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Profissão</Label>
            <Input
              value={formData.profession}
              onChange={(e) => setFormData({ ...formData, profession: e.target.value })}
              placeholder="Ex: Professora"
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label>Endereço</Label>
            <Input
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Rua, número - Cidade"
              className="h-11"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Contato de Emergência</Label>
          <Input
            value={formData.emergencyContact}
            onChange={(e) => setFormData({ ...formData, emergencyContact: e.target.value })}
            placeholder="Nome e telefone do contato de emergência"
            className="h-11"
          />
        </div>
        <div className="space-y-2">
          <Label>Observações</Label>
          <Textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Anotações gerais sobre o paciente, histórico, alergias..."
            className="resize-none min-h-[80px]"
          />
        </div>
        <div className="pt-4 flex justify-end gap-3">
          <Button type="submit" className="h-11 px-8 rounded-xl" disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Salvar Cadastro"}
          </Button>
        </div>
      </form>
    </>
  );
}
