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
  Search, Plus, UserPlus, ChevronRight,
  ChevronUp, ChevronDown, ChevronsUpDown, Loader2,
  MessageCircle, X, Mail, Calendar, MapPin, ShieldAlert,
} from "lucide-react";
import { useToast } from "@/lib/toast";
import { maskCpf, maskPhone, displayCpf } from "@/utils/masks";
import { patientFormSchema, buildPatientPayload } from "@/schemas/patient.schema";
import { DatePickerPTBR } from "@/components/ui/date-picker-ptbr";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

type SortField = "name" | "birthDate" | "phone" | "email";
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

// ─── Avatar helpers ────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  "#0d9488", "#0284c7", "#7c3aed", "#db2777",
  "#d97706", "#059669", "#4f46e5", "#e11d48",
];
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function getInitials(name: string) {
  return name.split(" ").filter(Boolean).map(n => n[0]).slice(0, 2).join("").toUpperCase();
}

// ─── Misc helpers ──────────────────────────────────────────────────────────────
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
  return Date.now() - new Date(createdAt).getTime() < 30 * 24 * 60 * 60 * 1000;
}
function whatsappLink(phone: string) {
  const d = phone.replace(/\D/g, "");
  return `https://wa.me/${d.startsWith("55") ? d : `55${d}`}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PatientsList() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
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

  function handleSort(field: SortField) {
    setSortField(f => {
      if (f === field) { setSortDir(d => d === "asc" ? "desc" : "asc"); return f; }
      setSortDir("asc");
      return field;
    });
  }

  return (
    <AppLayout title="Pacientes">
      <div className="space-y-4">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-display text-slate-900 tracking-tight">Pacientes</h1>
            <p className="text-sm text-slate-500 mt-0.5 h-5">
              {!isLoading && (
                <>
                  <span className="font-semibold text-slate-700">{total}</span> cadastrados
                  {newThisMonth > 0 && (
                    <> · <span className="font-semibold text-emerald-600">{newThisMonth} novos</span> este mês</>
                  )}
                </>
              )}
            </p>
          </div>

          {canCreate && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="h-10 px-5 rounded-xl gap-2 text-sm font-semibold shadow-sm shrink-0">
                  <Plus className="w-4 h-4" /> Novo Paciente
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] border-none shadow-2xl rounded-2xl max-h-[90dvh] overflow-y-auto">
                <CreatePatientForm onSuccess={() => { setIsDialogOpen(false); refetch(); }} />
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* ── Search ───────────────────────────────────────────────────────── */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <Input
            placeholder="Buscar por nome, CPF ou telefone…"
            className="pl-11 pr-10 h-11 rounded-xl bg-white border-slate-200 shadow-sm text-sm focus-visible:ring-primary/30"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* ── Content ──────────────────────────────────────────────────────── */}
        {isLoading ? (
          <LoadingSkeleton />
        ) : patients.length === 0 ? (
          <EmptyState search={search} onNew={() => setIsDialogOpen(true)} canCreate={canCreate} />
        ) : (
          <ListView patients={patients} sortField={sortField} sortDir={sortDir} onSort={handleSort} />
        )}

      </div>
    </AppLayout>
  );
}

// ─── Loading Skeleton ──────────────────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/70 grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_180px_auto] lg:grid-cols-[1fr_180px_220px_auto] gap-4">
        {[80, 60, 80].map((w, i) => (
          <div key={i} className={cn("h-3 rounded bg-slate-200 animate-pulse", i === 1 && "hidden sm:block", i === 2 && "hidden lg:block")} style={{ width: `${w}%` }} />
        ))}
        <div />
      </div>
      {[...Array(6)].map((_, i) => (
        <div key={i} className={cn("px-5 py-4 flex items-center gap-4 animate-pulse", i < 5 && "border-b border-slate-50")}>
          <div className="w-10 h-10 rounded-full bg-slate-100 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-40 bg-slate-100 rounded-full" />
            <div className="h-2.5 w-28 bg-slate-100 rounded-full" />
          </div>
          <div className="h-3 w-32 bg-slate-100 rounded-full hidden sm:block" />
          <div className="h-3 w-44 bg-slate-100 rounded-full hidden lg:block" />
          <div className="w-4 h-4 bg-slate-100 rounded" />
        </div>
      ))}
    </div>
  );
}

// ─── Empty State ───────────────────────────────────────────────────────────────
function EmptyState({ search, onNew, canCreate }: { search: string; onNew: () => void; canCreate: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-dashed border-slate-200 py-20 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-primary/8 flex items-center justify-center mx-auto mb-4 border border-primary/15">
        <UserPlus className="w-7 h-7 text-primary/70" />
      </div>
      <h3 className="text-base font-bold text-slate-800 mb-1">
        {search ? "Nenhum resultado" : "Nenhum paciente cadastrado"}
      </h3>
      <p className="text-sm text-slate-400 max-w-xs mx-auto mb-6">
        {search
          ? `Não encontramos resultados para "${search}". Tente outros termos.`
          : "Cadastre seu primeiro paciente para começar a gerenciar prontuários e agendamentos."}
      </p>
      {!search && canCreate && (
        <Button onClick={onNew} className="h-10 px-6 rounded-xl gap-2">
          <Plus className="w-4 h-4" /> Cadastrar primeiro paciente
        </Button>
      )}
    </div>
  );
}

// ─── List View ─────────────────────────────────────────────────────────────────
interface ListViewProps {
  patients: Patient[];
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
}

const ROW_HEIGHT = 68;
const VIRTUALIZE_THRESHOLD = 30;

function SortBtn({ field, label, sortField, sortDir, onSort, className }: {
  field: SortField; label: string; sortField: SortField; sortDir: SortDir;
  onSort: (f: SortField) => void; className?: string;
}) {
  const active = sortField === field;
  return (
    <button
      onClick={() => onSort(field)}
      className={cn(
        "inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide select-none transition-colors",
        active ? "text-primary" : "text-slate-400 hover:text-slate-600",
        className,
      )}
    >
      {label}
      {active
        ? sortDir === "asc"
          ? <ChevronUp className="w-3 h-3" />
          : <ChevronDown className="w-3 h-3" />
        : <ChevronsUpDown className="w-3 h-3 opacity-40" />
      }
    </button>
  );
}

function PatientRow({ patient, isLast }: { patient: Patient; isLast: boolean }) {
  const age = calcAge(patient.birthDate);
  const inits = getInitials(patient.name);
  const color = avatarColor(patient.name);
  const isNew = isNewPatient(patient.createdAt);

  return (
    <Link href={`/pacientes/${patient.id}`}>
      <div
        className={cn(
          "grid items-center px-5 py-0 cursor-pointer group transition-colors hover:bg-slate-50/80",
          "grid-cols-[1fr_auto]",
          "sm:grid-cols-[1fr_200px_auto]",
          "lg:grid-cols-[1fr_200px_240px_auto]",
          !isLast && "border-b border-slate-50",
        )}
        style={{ height: ROW_HEIGHT }}
      >
        {/* Avatar + Name */}
        <div className="flex items-center gap-3.5 min-w-0 pr-4">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 select-none transition-transform group-hover:scale-105"
            style={{ background: color }}
          >
            {inits}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm text-slate-800 truncate">{patient.name}</p>
              {isNew && (
                <span className="hidden sm:inline-flex shrink-0 items-center text-[10px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
                  Novo
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 truncate font-mono tracking-wide">
              {displayCpf(patient.cpf)}
              {age && <span className="ml-2 font-sans not-italic text-slate-400 font-normal tracking-normal">{age}</span>}
            </p>
          </div>
        </div>

        {/* Phone */}
        <div className="hidden sm:flex items-center pr-4">
          <button
            type="button"
            title="Abrir WhatsApp"
            onClick={e => { e.preventDefault(); e.stopPropagation(); window.open(whatsappLink(patient.phone), "_blank", "noopener,noreferrer"); }}
            className="flex items-center gap-2 group/wa cursor-pointer"
          >
            <div className="w-6 h-6 rounded-md bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
              <MessageCircle className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <span className="text-xs text-slate-600 group-hover/wa:text-emerald-600 transition-colors truncate max-w-[130px]">{patient.phone}</span>
          </button>
        </div>

        {/* Email */}
        <div className="hidden lg:flex items-center gap-2 pr-4 min-w-0">
          {patient.email ? (
            <>
              <Mail className="w-3.5 h-3.5 text-slate-300 shrink-0" />
              <span className="text-xs text-slate-500 truncate">{patient.email}</span>
            </>
          ) : (
            <span className="text-xs text-slate-200 select-none">—</span>
          )}
        </div>

        {/* Arrow */}
        <div className="flex items-center justify-end">
          <ChevronRight className="w-4 h-4 text-slate-200 group-hover:text-primary group-hover:translate-x-0.5 transition-all duration-150" />
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
      };
      const [va, vb] = vals[sortField];
      return sortDir === "asc"
        ? va.localeCompare(vb, "pt-BR", { sensitivity: "base" })
        : vb.localeCompare(va, "pt-BR", { sensitivity: "base" });
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

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      {/* Header */}
      <div className={cn(
        "px-5 py-3 grid items-center border-b border-slate-100 bg-slate-50/80",
        "grid-cols-[1fr_auto]",
        "sm:grid-cols-[1fr_200px_auto]",
        "lg:grid-cols-[1fr_200px_240px_auto]",
      )}>
        <SortBtn field="name" label="Paciente" sortField={sortField} sortDir={sortDir} onSort={onSort} />
        <SortBtn field="phone" label="Telefone" sortField={sortField} sortDir={sortDir} onSort={onSort} className="hidden sm:inline-flex" />
        <SortBtn field="email" label="E-mail" sortField={sortField} sortDir={sortDir} onSort={onSort} className="hidden lg:inline-flex" />
        <span />
      </div>

      {/* Rows */}
      {shouldVirtualize ? (
        <div ref={scrollRef} className="overflow-auto" style={{ maxHeight: "min(72vh, calc(100vh - 300px))" }}>
          <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
            {virtualizer.getVirtualItems().map(vRow => {
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

      {/* Footer */}
      <div className="px-5 py-2.5 border-t border-slate-50 bg-slate-50/50">
        <p className="text-[11px] text-slate-400">
          {sorted.length === 50
            ? "Exibindo os 50 primeiros resultados. Refine a busca para ver mais."
            : `${sorted.length} paciente${sorted.length !== 1 ? "s" : ""}`}
        </p>
      </div>
    </div>
  );
}

// ─── Create Patient Form ───────────────────────────────────────────────────────
interface CrossClinicPatient {
  id: number; name: string; cpf: string; phone: string;
  email?: string | null; birthDate?: string | null;
  address?: string | null; profession?: string | null; emergencyContact?: string | null;
}

function CreatePatientForm({ onSuccess }: { onSuccess: () => void }) {
  const [formData, setFormData] = useState({
    name: "", cpf: "", phone: "", email: "", birthDate: "",
    profession: "", address: "", emergencyContact: "", notes: "",
  });
  const [cpfLookupState, setCpfLookupState] = useState<"idle" | "loading" | "found" | "not_found" | "already_exists">("idle");
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
      if (body.existsInOtherClinic) { setCrossClinicPatient(body.patient); setCpfLookupState("found"); }
      else { setCpfLookupState("not_found"); }
    } catch { setCpfLookupState("idle"); }
  }

  async function handleImport() {
    if (!crossClinicPatient) return;
    setIsImporting(true);
    try {
      const csrfCookie = document.cookie.split(";").find(c => c.trim().startsWith("fisiogest_csrf="))?.split("=")[1];
      const res = await apiFetch("/api/patients/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(csrfCookie ? { "x-csrf-token": decodeURIComponent(csrfCookie) } : {}) },
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
    } finally { setIsImporting(false); }
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
        headers: { "Content-Type": "application/json", ...(csrfCookie ? { "x-csrf-token": decodeURIComponent(csrfCookie) } : {}) },
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
    } finally { setIsSubmitting(false); }
  }

  const f = formData;
  const set = (k: keyof typeof formData) => (v: string) => setFormData(prev => ({ ...prev, [k]: v }));

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <h2 className="text-xl font-bold font-display text-slate-900 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <UserPlus className="w-4 h-4 text-primary" />
          </div>
          Novo Paciente
        </h2>
        <p className="text-sm text-slate-500 mt-1">Preencha os dados para cadastrar um novo paciente.</p>
      </div>

      {cpfLookupState === "already_exists" && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 font-medium">
          Este CPF já está cadastrado nesta clínica.
        </div>
      )}
      {cpfLookupState === "found" && crossClinicPatient && (
        <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-800">Paciente encontrado em outra clínica</p>
          <p className="text-xs text-slate-500">{crossClinicPatient.name} · {crossClinicPatient.phone}</p>
          <Button type="button" size="sm" className="h-8 gap-1.5 rounded-lg" onClick={handleImport} disabled={isImporting}>
            {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
            Importar este paciente
          </Button>
        </div>
      )}

      <div className="space-y-5">
        <section className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Identificação</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Nome Completo *</Label>
              <Input required value={f.name} onChange={e => set("name")(e.target.value)} className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">CPF *</Label>
              <Input required type="text" inputMode="numeric" maxLength={14} value={f.cpf}
                onChange={e => set("cpf")(maskCpf(e.target.value))} onBlur={handleCpfBlur}
                placeholder="000.000.000-00" className="h-10 rounded-xl font-mono" />
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Contato</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Telefone / WhatsApp *</Label>
              <Input required type="tel" value={f.phone} onChange={e => set("phone")(maskPhone(e.target.value))}
                placeholder="(11) 99999-0000" className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">E-mail</Label>
              <Input type="email" value={f.email} onChange={e => set("email")(e.target.value)} className="h-10 rounded-xl" />
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Dados Pessoais</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Data de Nascimento</Label>
              <DatePickerPTBR value={f.birthDate} onChange={v => set("birthDate")(v)} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Profissão</Label>
              <Input value={f.profession} onChange={e => set("profession")(e.target.value)} placeholder="Ex: Professora" className="h-10 rounded-xl" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">Endereço</Label>
            <Input value={f.address} onChange={e => set("address")(e.target.value)} placeholder="Rua, número, bairro" className="h-10 rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-500" /> Contato de Emergência
            </Label>
            <Input value={f.emergencyContact} onChange={e => set("emergencyContact")(e.target.value)}
              placeholder="Nome — Telefone" className="h-10 rounded-xl" />
          </div>
        </section>

        <section className="space-y-1.5">
          <Label className="text-xs font-medium text-slate-600">Observações internas</Label>
          <Textarea value={f.notes} onChange={e => set("notes")(e.target.value)}
            placeholder="Alergias, restrições, histórico relevante…"
            className="min-h-[80px] resize-none text-sm rounded-xl" />
        </section>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <Button type="submit" className="h-10 px-8 rounded-xl" disabled={isSubmitting || cpfLookupState === "already_exists"}>
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Cadastrar Paciente
        </Button>
      </div>
    </form>
  );
}
