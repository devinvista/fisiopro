import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { useListPatients } from "@workspace/api-client-react";
import { apiFetch, isPlanLimitPayload } from "@/lib/api";
import { usePlanLimit } from "@/contexts/plan-limit-context";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Search, Plus, UserPlus, Phone, Mail, ChevronRight,
  ChevronUp, ChevronDown, ChevronsUpDown, Loader2,
  LayoutGrid, LayoutList, Users, CalendarDays, Sparkles,
  MapPin, MessageCircle, Calendar,
} from "lucide-react";
import { useToast } from "@/lib/toast";
import { maskCpf, maskPhone, displayCpf } from "@/utils/masks";
import { patientFormSchema, buildPatientPayload } from "@/schemas/patient.schema";
import { DatePickerPTBR } from "@/components/ui/date-picker-ptbr";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

type ViewMode = "list" | "cards";
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

const AVATAR_PALETTES = [
  { bg: "bg-teal-100",   text: "text-teal-700"   },
  { bg: "bg-sky-100",    text: "text-sky-700"     },
  { bg: "bg-violet-100", text: "text-violet-700"  },
  { bg: "bg-pink-100",   text: "text-pink-700"    },
  { bg: "bg-amber-100",  text: "text-amber-700"   },
  { bg: "bg-emerald-100",text: "text-emerald-700" },
  { bg: "bg-blue-100",   text: "text-blue-700"    },
  { bg: "bg-rose-100",   text: "text-rose-700"    },
];

function avatarPalette(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_PALETTES[Math.abs(h) % AVATAR_PALETTES.length];
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

function isNewPatient(createdAt: string) {
  const now = new Date();
  const created = new Date(createdAt);
  return (now.getTime() - created.getTime()) < 30 * 24 * 60 * 60 * 1000;
}

function whatsappLink(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const number = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${number}`;
}

export default function PatientsList() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    (localStorage.getItem("patients_view_mode") as ViewMode) ?? "list"
  );
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("patients.create");
  const queryClient = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, refetch } = useListPatients({ search: debouncedSearch, limit: 50 });
  const patients = (data?.data ?? []) as Patient[];
  const total = (data as any)?.page?.total ?? (data as any)?.total ?? 0;

  const newThisMonth = useMemo(() => {
    const now = new Date();
    return patients.filter(p => {
      const d = new Date(p.createdAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  }, [patients]);

  function changeView(mode: ViewMode) {
    setViewMode(mode);
    localStorage.setItem("patients_view_mode", mode);
  }

  function handleSort(field: SortField) {
    setSortField(f => {
      if (f === field) { setSortDir(d => d === "asc" ? "desc" : "asc"); return f; }
      setSortDir("asc");
      return field;
    });
  }

  return (
    <AppLayout title="Pacientes">
      <div className="space-y-5">

        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold font-display text-slate-800">Pacientes</h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Gerencie cadastros e prontuários</p>
          </div>
          {canCreate && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="w-full sm:w-auto h-10 px-5 rounded-xl shadow-sm gap-1.5 text-sm font-semibold">
                  <Plus className="w-4 h-4" /> Novo Paciente
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] border-none shadow-2xl rounded-2xl max-h-[90dvh] overflow-y-auto">
                <CreatePatientForm onSuccess={() => { setIsDialogOpen(false); refetch(); }} />
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {[
            {
              label: "Total de Pacientes",
              shortLabel: "Total",
              value: isLoading ? null : total,
              icon: <Users className="w-4 h-4" />,
              color: "text-violet-600",
              bg: "bg-violet-50",
              border: "border-violet-100",
            },
            {
              label: "Novos este mês",
              shortLabel: "Novos",
              value: isLoading ? null : newThisMonth,
              icon: <Sparkles className="w-4 h-4" />,
              color: "text-emerald-600",
              bg: "bg-emerald-50",
              border: "border-emerald-100",
            },
            {
              label: "Exibidos agora",
              shortLabel: "Filtro",
              value: isLoading ? null : patients.length,
              icon: <Search className="w-4 h-4" />,
              color: "text-sky-600",
              bg: "bg-sky-50",
              border: "border-sky-100",
            },
          ].map((s, i) => (
            <div key={i} className={cn("rounded-2xl border p-3 sm:p-4 flex items-center gap-3", s.border, "bg-white")}>
              <div className={cn("p-2 rounded-xl shrink-0", s.bg, s.color)}>
                {s.icon}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 leading-tight hidden sm:block">{s.label}</p>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 leading-tight sm:hidden">{s.shortLabel}</p>
                {s.value === null
                  ? <div className="h-6 w-10 bg-slate-100 animate-pulse rounded mt-1" />
                  : <p className="text-xl font-extrabold text-slate-900 tabular-nums">{s.value}</p>
                }
              </div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <Input
              placeholder="Buscar por nome, CPF ou telefone..."
              className="pl-9 h-9 text-sm rounded-xl bg-white border-slate-200"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {search && (
            <button
              onClick={() => setSearch("")}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors shrink-0 px-2"
            >
              Limpar
            </button>
          )}
          <div className="ml-auto flex items-center border border-slate-200 rounded-xl overflow-hidden bg-white">
            {([["list", <LayoutList className="w-4 h-4" />], ["cards", <LayoutGrid className="w-4 h-4" />]] as const).map(([mode, icon]) => (
              <button
                key={mode}
                onClick={() => changeView(mode)}
                className={cn(
                  "p-2 transition-colors",
                  mode !== "list" && "border-l border-slate-200",
                  viewMode === mode ? "bg-primary text-white" : "hover:bg-slate-50 text-slate-400"
                )}
                title={mode === "list" ? "Lista" : "Cards"}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <LoadingSkeleton />
        ) : patients.length === 0 ? (
          <EmptyState search={search} onNew={() => setIsDialogOpen(true)} canCreate={canCreate} />
        ) : viewMode === "cards" ? (
          <CardView patients={patients} />
        ) : (
          <ListView patients={patients} sortField={sortField} sortDir={sortDir} onSort={handleSort} />
        )}

      </div>
    </AppLayout>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-50">
      {[...Array(7)].map((_, i) => (
        <div key={i} className="px-4 py-3.5 flex items-center gap-3 animate-pulse">
          <div className="w-9 h-9 rounded-full bg-slate-100 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-36 bg-slate-100 rounded" />
            <div className="h-2.5 w-24 bg-slate-100 rounded" />
          </div>
          <div className="h-3 w-28 bg-slate-100 rounded hidden md:block" />
          <div className="h-3 w-20 bg-slate-100 rounded hidden lg:block" />
          <div className="w-4 h-4 bg-slate-100 rounded" />
        </div>
      ))}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ search, onNew, canCreate }: { search: string; onNew: () => void; canCreate: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-dashed border-slate-200 py-16 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-primary/5 flex items-center justify-center mx-auto mb-4">
        <UserPlus className="w-8 h-8 text-primary/60" />
      </div>
      <h3 className="text-lg font-bold text-slate-800 mb-1">
        {search ? "Nenhum resultado encontrado" : "Nenhum paciente cadastrado"}
      </h3>
      <p className="text-sm text-slate-400 max-w-xs mx-auto mb-6">
        {search
          ? `Não encontramos resultados para "${search}". Tente outros termos.`
          : "Cadastre seu primeiro paciente para começar a gerenciar prontuários e agendamentos."}
      </p>
      {!search && canCreate && (
        <Button onClick={onNew} className="h-10 px-6 rounded-xl">
          Cadastrar Primeiro Paciente
        </Button>
      )}
    </div>
  );
}

// ─── Card View ────────────────────────────────────────────────────────────────

function CardView({ patients }: { patients: Patient[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {patients.map((patient) => {
        const age = calcAge(patient.birthDate);
        const initials = patient.name.split(" ").filter(Boolean).map(n => n[0]).slice(0, 2).join("").toUpperCase();
        const palette = avatarPalette(patient.name);
        const isNew = isNewPatient(patient.createdAt);

        return (
          <Link key={patient.id} href={`/pacientes/${patient.id}`}>
            <div className="bg-white rounded-2xl border border-slate-200 hover:border-primary/30 hover:shadow-md transition-all duration-200 cursor-pointer group overflow-hidden">
              <div className="p-4 pb-3">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 group-hover:scale-105 transition-transform", palette.bg, palette.text)}>
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm text-slate-800 truncate leading-tight">{patient.name}</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">{displayCpf(patient.cpf)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {isNew && (
                      <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
                        Novo
                      </span>
                    )}
                    {age && (
                      <span className="text-[11px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">
                        {age}
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate text-xs">{patient.phone}</span>
                  </div>
                  {patient.email && (
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate text-xs">{patient.email}</span>
                    </div>
                  )}
                  {patient.profession && (
                    <div className="flex items-center gap-2 text-slate-500">
                      <div className="w-3.5 h-3.5 shrink-0" />
                      <span className="text-xs">{patient.profession}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="px-4 py-2.5 border-t border-slate-50 flex items-center justify-between">
                <a
                  href={whatsappLink(patient.phone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="flex items-center gap-1.5 text-[11px] text-emerald-600 hover:text-emerald-700 font-medium px-2 py-1 rounded-lg hover:bg-emerald-50 transition-colors"
                >
                  <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                </a>
                <span className="text-primary text-[11px] font-semibold flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
                  Ver prontuário <ChevronRight className="w-3.5 h-3.5" />
                </span>
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
  if (sortField !== field) return <ChevronsUpDown className="w-3 h-3 ml-1 opacity-30" />;
  return sortDir === "asc"
    ? <ChevronUp className="w-3 h-3 ml-1 text-primary" />
    : <ChevronDown className="w-3 h-3 ml-1 text-primary" />;
}

const ROW_HEIGHT = 60;
const VIRTUALIZE_THRESHOLD = 30;

function PatientRow({ patient, isLast }: { patient: Patient; isLast: boolean }) {
  const age = calcAge(patient.birthDate);
  const dob = patient.birthDate
    ? new Date(patient.birthDate + "T12:00:00").toLocaleDateString("pt-BR")
    : null;
  const initials = patient.name.split(" ").filter(Boolean).map(n => n[0]).slice(0, 2).join("").toUpperCase();
  const palette = avatarPalette(patient.name);
  const isNew = isNewPatient(patient.createdAt);

  return (
    <Link href={`/pacientes/${patient.id}`}>
      <div className={cn(
        "grid items-center px-4 py-3 hover:bg-primary/[0.02] transition-colors cursor-pointer group",
        "grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_auto] lg:grid-cols-[2fr_120px_150px_130px_auto]",
        !isLast && "border-b border-slate-50"
      )}>
        {/* Name col */}
        <div className="flex items-center gap-3 min-w-0 pr-3">
          <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 group-hover:scale-105 transition-transform", palette.bg, palette.text)}>
            {initials}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm text-slate-800 truncate">{patient.name}</p>
              {isNew && (
                <span className="hidden sm:inline text-[10px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full shrink-0">
                  Novo
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 truncate">
              {displayCpf(patient.cpf)}
              <span className="sm:hidden ml-2 text-slate-500">{patient.phone}</span>
            </p>
          </div>
        </div>

        {/* Birth date (lg) */}
        <div className="hidden lg:block pr-3">
          {dob ? (
            <div>
              <p className="text-xs text-slate-600">{dob}</p>
              {age && <p className="text-[11px] text-slate-400 mt-0.5">{age}</p>}
            </div>
          ) : <span className="text-xs text-slate-300">—</span>}
        </div>

        {/* Phone (sm+) */}
        <div className="hidden sm:flex items-center gap-2 pr-3">
          <button
            type="button"
            onClick={e => { e.preventDefault(); e.stopPropagation(); window.open(whatsappLink(patient.phone), "_blank", "noopener,noreferrer"); }}
            className="flex items-center gap-1.5 group/wa cursor-pointer"
            title="Abrir WhatsApp"
          >
            <MessageCircle className="w-3.5 h-3.5 text-slate-300 group-hover/wa:text-emerald-500 transition-colors shrink-0" />
            <span className="text-xs text-slate-600 truncate">{patient.phone}</span>
          </button>
        </div>

        {/* Email (lg) */}
        <div className="hidden lg:flex items-center gap-1.5 pr-3 min-w-0">
          {patient.email ? (
            <>
              <Mail className="w-3 h-3 text-slate-300 shrink-0" />
              <span className="text-xs text-slate-500 truncate">{patient.email}</span>
            </>
          ) : <span className="text-xs text-slate-300">—</span>}
        </div>

        {/* Arrow */}
        <div className="flex items-center justify-end">
          <ChevronRight className="w-4 h-4 text-slate-200 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>
    </Link>
  );
}

function ListView({ patients, sortField, sortDir, onSort }: ListViewProps) {
  const sorted = useMemo(() => {
    return [...patients].sort((a, b) => {
      const vals: Record<SortField, [string, string]> = {
        name:      [a.name ?? "", b.name ?? ""],
        birthDate: [a.birthDate ?? "", b.birthDate ?? ""],
        phone:     [a.phone ?? "", b.phone ?? ""],
        email:     [a.email ?? "", b.email ?? ""],
        profession:[a.profession ?? "", b.profession ?? ""],
      };
      const [va, vb] = vals[sortField];
      const cmp = va.localeCompare(vb, "pt-BR", { sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [patients, sortField, sortDir]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const shouldVirtualize = sorted.length > VIRTUALIZE_THRESHOLD;
  const virtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    enabled: shouldVirtualize,
  });

  function HeaderCell({ field, label, className }: { field: SortField; label: string; className?: string }) {
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
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="grid items-center border-b border-slate-100 bg-slate-50/60 px-4 py-2.5
        grid-cols-[1fr_auto]
        sm:grid-cols-[1fr_auto_auto]
        lg:grid-cols-[2fr_120px_150px_130px_auto]">
        <HeaderCell field="name" label="Paciente" />
        <HeaderCell field="birthDate" label="Nascimento" className="hidden lg:flex" />
        <HeaderCell field="phone" label="Telefone" className="hidden sm:flex" />
        <HeaderCell field="email" label="E-mail" className="hidden lg:flex" />
        <span />
      </div>

      {shouldVirtualize ? (
        <div ref={scrollRef} className="overflow-auto" style={{ maxHeight: "min(70vh, calc(100vh - 320px))" }}>
          <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
            {virtualizer.getVirtualItems().map((vRow) => {
              const patient = sorted[vRow.index];
              return (
                <div
                  key={patient.id}
                  data-index={vRow.index}
                  ref={virtualizer.measureElement}
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vRow.start}px)` }}
                >
                  <PatientRow patient={patient} isLast={vRow.index === sorted.length - 1} />
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        sorted.map((patient, idx) => (
          <PatientRow key={patient.id} patient={patient} isLast={idx === sorted.length - 1} />
        ))
      )}
    </div>
  );
}

// ─── Create Patient Form ──────────────────────────────────────────────────────

interface CrossClinicPatient {
  id: number;
  name: string;
  cpf: string;
  phone: string;
  email?: string | null;
  birthDate?: string | null;
  address?: string | null;
  profession?: string | null;
  emergencyContact?: string | null;
}

function CreatePatientForm({ onSuccess }: { onSuccess: () => void }) {
  const [formData, setFormData] = useState({
    name: "", cpf: "", phone: "", email: "", birthDate: "",
    profession: "", address: "", emergencyContact: "", notes: "",
  });

  const [cpfLookupState, setCpfLookupState] = useState<
    "idle" | "loading" | "found" | "not_found" | "already_exists"
  >("idle");
  const [crossClinicPatient, setCrossClinicPatient] = useState<CrossClinicPatient | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { toast } = useToast();
  const { show: planLimitModal } = usePlanLimit();
  const qc = useQueryClient();

  async function handleCpfBlur() {
    const raw = formData.cpf.replace(/\D/g, "");
    if (raw.length !== 11) return;
    setCpfLookupState("loading");
    try {
      const res = await apiFetch(`/api/patients/lookup?cpf=${raw}`);
      if (res.status === 404) { setCpfLookupState("not_found"); return; }
      if (!res.ok) { setCpfLookupState("idle"); return; }
      const body = await res.json();
      if (body.existsInThisClinic) { setCpfLookupState("already_exists"); return; }
      if (body.existsInOtherClinic) {
        setCrossClinicPatient(body.patient);
        setCpfLookupState("found");
      } else {
        setCpfLookupState("not_found");
      }
    } catch {
      setCpfLookupState("idle");
    }
  }

  async function handleImport() {
    if (!crossClinicPatient) return;
    setIsImporting(true);
    try {
      const csrfCookie = document.cookie.split(";").find(c => c.trim().startsWith("fisiogest_csrf="))?.split("=")[1];
      const res = await apiFetch("/api/patients/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfCookie ? { "x-csrf-token": decodeURIComponent(csrfCookie) } : {}),
        },
        body: JSON.stringify({ cpf: crossClinicPatient.cpf }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (isPlanLimitPayload(err)) { planLimitModal(err); return; }
        throw new Error(err?.message ?? "Erro ao importar");
      }
      qc.invalidateQueries({ queryKey: ["/api/patients"] });
      toast({ title: "Paciente importado", description: `${crossClinicPatient.name} foi adicionado à sua clínica.` });
      onSuccess();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro ao importar", description: err?.message ?? "Tente novamente." });
    } finally {
      setIsImporting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = patientFormSchema.safeParse(formData);
    if (!parsed.success) {
      toast({ variant: "destructive", title: "Dados inválidos", description: parsed.error.issues[0]?.message });
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = buildPatientPayload(parsed.data);
      const csrfCookie = document.cookie.split(";").find(c => c.trim().startsWith("fisiogest_csrf="))?.split("=")[1];
      const res = await apiFetch("/api/patients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfCookie ? { "x-csrf-token": decodeURIComponent(csrfCookie) } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (isPlanLimitPayload(err)) { planLimitModal(err); return; }
        throw new Error(err?.message ?? "Erro ao cadastrar");
      }
      qc.invalidateQueries({ queryKey: ["/api/patients"] });
      toast({ title: "Paciente cadastrado!", description: `${formData.name} foi adicionado com sucesso.` });
      onSuccess();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro ao cadastrar", description: err?.message ?? "Tente novamente." });
    } finally {
      setIsSubmitting(false);
    }
  }

  const f = formData;
  const set = (k: keyof typeof formData) => (v: string) => setFormData(prev => ({ ...prev, [k]: v }));

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <h2 className="text-xl font-bold font-display text-slate-800 flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-primary" /> Novo Paciente
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">Preencha os dados para cadastrar um novo paciente.</p>
      </div>

      {/* CPF lookup banner */}
      {cpfLookupState === "already_exists" && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
          Este CPF já está cadastrado nesta clínica.
        </div>
      )}
      {cpfLookupState === "found" && crossClinicPatient && (
        <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-800">Paciente encontrado em outra clínica</p>
          <p className="text-xs text-slate-600">{crossClinicPatient.name} — {crossClinicPatient.phone}</p>
          <Button type="button" size="sm" className="h-8 gap-1.5" onClick={handleImport} disabled={isImporting}>
            {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
            Importar este paciente
          </Button>
        </div>
      )}

      {/* Identificação */}
      <section className="space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Identificação</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Nome Completo *</Label>
            <Input required value={f.name} onChange={e => set("name")(e.target.value)} className="h-10" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">CPF *</Label>
            <Input
              required type="text" inputMode="numeric" maxLength={14}
              value={f.cpf}
              onChange={e => set("cpf")(maskCpf(e.target.value))}
              onBlur={handleCpfBlur}
              placeholder="000.000.000-00"
              className="h-10"
            />
          </div>
        </div>
      </section>

      {/* Contato */}
      <section className="space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Contato</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Telefone / WhatsApp *</Label>
            <Input required type="tel" value={f.phone} onChange={e => set("phone")(maskPhone(e.target.value))} placeholder="(11) 99999-0000" className="h-10" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">E-mail</Label>
            <Input type="email" value={f.email} onChange={e => set("email")(e.target.value)} className="h-10" />
          </div>
        </div>
      </section>

      {/* Dados Pessoais */}
      <section className="space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Dados Pessoais</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Data de Nascimento</Label>
            <DatePickerPTBR value={f.birthDate} onChange={v => set("birthDate")(v)} className="h-10" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Profissão</Label>
            <Input value={f.profession} onChange={e => set("profession")(e.target.value)} placeholder="Ex: Professora" className="h-10" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Endereço</Label>
          <Input value={f.address} onChange={e => set("address")(e.target.value)} placeholder="Rua, número, bairro" className="h-10" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Contato de Emergência</Label>
          <Input value={f.emergencyContact} onChange={e => set("emergencyContact")(e.target.value)} placeholder="Nome — Telefone" className="h-10" />
        </div>
      </section>

      {/* Observações */}
      <section className="space-y-1.5">
        <Label className="text-sm font-medium">Observações internas</Label>
        <Textarea
          value={f.notes}
          onChange={e => set("notes")(e.target.value)}
          placeholder="Alergias, restrições, histórico relevante…"
          className="min-h-[80px] resize-none text-sm"
        />
      </section>

      <div className="flex justify-end gap-2 pt-1 border-t border-slate-100">
        <Button type="submit" className="h-10 px-6 rounded-xl" disabled={isSubmitting || cpfLookupState === "already_exists"}>
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Cadastrar Paciente
        </Button>
      </div>
    </form>
  );
}
