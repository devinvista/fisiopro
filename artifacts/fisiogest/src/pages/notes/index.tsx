import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetchJson, apiSendJson, API_BASE } from "@/lib/api";
import { useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Plus, CheckCircle2, Circle, Clock, MessageSquare, Bell, ClipboardList,
  Trash2, Pencil, X, ChevronDown, User, UserCircle, Stethoscope,
  AlertTriangle, Filter, Search, RotateCcw,
} from "lucide-react";
import { format, isPast, isToday, parseISO, formatDistanceToNow } from "date-fns";
import { DatePickerPTBR, TimeInputPTBR } from "@/components/ui/date-picker-ptbr";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

const api = (path: string) => `${API_BASE}/api${path}`;

interface NoteItem {
  id: number;
  type: string;
  title: string;
  body: string | null;
  priority: string;
  status: string;
  dueAt: string | null;
  completedAt: string | null;
  seenAt: string | null;
  assignedTo: number | null;
  createdBy: number;
  patientId: number | null;
  assigneeName: string | null;
  creatorName: string | null;
  patientName: string | null;
  createdAt: string;
}

interface ClinicUser {
  id: number;
  name: string;
}

interface Patient {
  id: number;
  name: string;
}

const TYPE_OPTIONS = [
  { value: "tarefa", label: "Tarefa", icon: ClipboardList, color: "text-blue-500", bg: "bg-blue-50", border: "border-blue-200" },
  { value: "recado", label: "Recado", icon: MessageSquare, color: "text-violet-500", bg: "bg-violet-50", border: "border-violet-200" },
  { value: "lembrete", label: "Lembrete", icon: Bell, color: "text-amber-500", bg: "bg-amber-50", border: "border-amber-200" },
];

const PRIORITY_OPTIONS = [
  { value: "baixa", label: "Baixa", dot: "bg-slate-300", text: "text-slate-500" },
  { value: "normal", label: "Normal", dot: "bg-blue-400", text: "text-blue-600" },
  { value: "alta", label: "Alta", dot: "bg-orange-400", text: "text-orange-600" },
  { value: "urgente", label: "Urgente", dot: "bg-red-500", text: "text-red-600" },
];

const STATUS_OPTIONS = [
  { value: "pendente", label: "Pendente" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "concluido", label: "Concluído" },
];

function TypeBadge({ type }: { type: string }) {
  const cfg = TYPE_OPTIONS.find((t) => t.value === type) ?? TYPE_OPTIONS[0];
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full", cfg.bg, cfg.color)}>
      <Icon className="w-2.5 h-2.5" /> {cfg.label}
    </span>
  );
}

function PriorityDot({ priority }: { priority: string }) {
  const cfg = PRIORITY_OPTIONS.find((p) => p.value === priority) ?? PRIORITY_OPTIONS[1];
  return <span className={cn("inline-block w-2 h-2 rounded-full shrink-0", cfg.dot)} title={cfg.label} />;
}

function DueLabel({ dueAt }: { dueAt: string | null }) {
  if (!dueAt) return null;
  const d = parseISO(dueAt);
  const overdue = isPast(d) && !isToday(d);
  const today = isToday(d);
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-[11px] font-medium",
      overdue ? "text-red-500" : today ? "text-amber-600" : "text-slate-400"
    )}>
      <Clock className="w-3 h-3" />
      {overdue
        ? `Atrasado ${formatDistanceToNow(d, { locale: ptBR, addSuffix: false })}`
        : today ? "Vence hoje"
        : format(d, "dd 'de' MMM", { locale: ptBR })}
    </span>
  );
}

interface NoteFormProps {
  users: ClinicUser[];
  patients: Patient[];
  initial?: Partial<NoteItem>;
  currentUserId: number;
  onSubmit: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  loading: boolean;
}

function NoteForm({ users, patients, initial, currentUserId, onSubmit, onCancel, loading }: NoteFormProps) {
  const [type, setType] = useState(initial?.type ?? "tarefa");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [priority, setPriority] = useState(initial?.priority ?? "normal");
  const [assignedTo, setAssignedTo] = useState<number | "">(initial?.assignedTo ?? "");
  const [patientId, setPatientId] = useState<number | "">(initial?.patientId ?? "");

  const parseInitialDue = (dueAt?: string | null) => {
    if (!dueAt) return { date: "", time: "" };
    const d = new Date(dueAt);
    const date = d.toLocaleDateString("sv-SE");
    const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
    return { date, time };
  };
  const initDue = parseInitialDue(initial?.dueAt);
  const [dueDate, setDueDate] = useState(initDue.date);
  const [dueTime, setDueTime] = useState(initDue.time);

  function buildDueAt() {
    if (!dueDate) return null;
    const combined = dueTime ? `${dueDate}T${dueTime}:00` : `${dueDate}T00:00:00`;
    return combined;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({
      type, title, body: body || null, priority,
      assignedTo: assignedTo || null,
      patientId: patientId || null,
      dueAt: buildDueAt(),
    });
  }

  const selectedType = TYPE_OPTIONS.find((t) => t.value === type)!;
  const Icon = selectedType.icon;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Type selector */}
      <div className="flex gap-2">
        {TYPE_OPTIONS.map((t) => {
          const TIcon = t.icon;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all",
                type === t.value
                  ? `${t.bg} ${t.color} ${t.border} shadow-sm`
                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
              )}
            >
              <TIcon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Title */}
      <div>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={type === "recado" ? "Escreva sua mensagem..." : "Título da tarefa..."}
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 placeholder:text-slate-400"
          autoFocus
          required
        />
      </div>

      {/* Body */}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Descrição ou detalhes (opcional)..."
        rows={3}
        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 placeholder:text-slate-400 resize-none"
      />

      <div className="grid grid-cols-2 gap-3">
        {/* Priority */}
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1 block">Prioridade</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>

        {/* Due date */}
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1 block">Vencimento</label>
          <div className="flex gap-1.5">
            <DatePickerPTBR
              value={dueDate}
              onChange={(v) => setDueDate(v)}
              className="flex-1 min-w-0 h-9 rounded-xl border-slate-200"
            />
            <TimeInputPTBR
              value={dueTime}
              onChange={(v) => setDueTime(v)}
              className={`w-24 border border-slate-200 rounded-xl px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 ${!dueDate ? "opacity-40 pointer-events-none" : ""}`}
            />
          </div>
        </div>

        {/* Assigned to */}
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1">
            <User className="w-3 h-3" /> Atribuir a
          </label>
          <select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value ? Number(e.target.value) : "")}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            <option value="">Todos da clínica</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}{u.id === currentUserId ? " (eu)" : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Patient */}
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1">
            <Stethoscope className="w-3 h-3" /> Paciente
          </label>
          <select
            value={patientId}
            onChange={(e) => setPatientId(e.target.value ? Number(e.target.value) : "")}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            <option value="">Nenhum</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="submit" disabled={loading || !title.trim()} className="flex-1 rounded-xl">
          {loading ? "Salvando..." : initial?.id ? "Salvar alterações" : "Criar"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} className="rounded-xl px-4">
          Cancelar
        </Button>
      </div>
    </form>
  );
}

interface NoteCardProps {
  note: NoteItem;
  currentUserId: number;
  onComplete: (id: number) => void;
  onDelete: (id: number) => void;
  onEdit: (note: NoteItem) => void;
  completing: boolean;
}

function NoteCard({ note, currentUserId, onComplete, onDelete, onEdit, completing }: NoteCardProps) {
  const cfg = TYPE_OPTIONS.find((t) => t.value === note.type) ?? TYPE_OPTIONS[0];
  const prio = PRIORITY_OPTIONS.find((p) => p.value === note.priority) ?? PRIORITY_OPTIONS[1];
  const isDone = note.status === "concluido";
  const isOverdue = note.dueAt && isPast(parseISO(note.dueAt)) && !isToday(parseISO(note.dueAt));
  const isUrgent = note.priority === "urgente" && !isDone;
  const isUnread = note.assignedTo === currentUserId && !note.seenAt && note.createdBy !== currentUserId;

  return (
    <div className={cn(
      "group relative bg-white rounded-2xl border shadow-sm transition-all hover:shadow-md",
      isDone ? "opacity-60 border-slate-100" : isUrgent ? "border-red-200" : "border-slate-200",
      isUnread && "ring-2 ring-violet-300",
    )}>
      {isUnread && (
        <div className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-violet-500 rounded-full border-2 border-white" />
      )}
      {isUrgent && (
        <div className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white animate-pulse" />
      )}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <button
            onClick={() => onComplete(note.id)}
            disabled={completing}
            className="mt-0.5 shrink-0 text-slate-300 hover:text-emerald-500 transition-colors"
          >
            {isDone
              ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              : <Circle className="w-5 h-5" />}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <PriorityDot priority={note.priority} />
              <TypeBadge type={note.type} />
              {note.patientName && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-teal-50 text-teal-600 px-1.5 py-0.5 rounded-full">
                  <Stethoscope className="w-2.5 h-2.5" /> {note.patientName}
                </span>
              )}
            </div>

            <p className={cn(
              "text-sm font-semibold text-slate-800 leading-snug",
              isDone && "line-through text-slate-400"
            )}>
              {note.title}
            </p>

            {note.body && (
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">{note.body}</p>
            )}

            <div className="mt-2 flex items-center gap-3 flex-wrap">
              <DueLabel dueAt={note.dueAt} />

              {note.assignedTo && note.assigneeName && note.assignedTo !== currentUserId && (
                <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                  <User className="w-3 h-3" /> Para: <span className="font-medium text-slate-600">{note.assigneeName}</span>
                </span>
              )}

              {note.createdBy !== currentUserId && note.creatorName && (
                <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                  <UserCircle className="w-3 h-3" /> De: <span className="font-medium text-slate-600">{note.creatorName}</span>
                </span>
              )}

              {note.assignedTo === currentUserId && note.seenAt && (
                <span className="text-[10px] text-slate-300">✓ Visto</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            {note.createdBy === currentUserId && (
              <>
                <button
                  onClick={() => onEdit(note)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onDelete(note.id)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NotesPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const openNew = params.get("new") === "1";

  const { user } = useAuth() as any;
  const currentUserId: number = user?.id ?? 0;
  const qc = useQueryClient();
  const { toast } = useToast();

  const [tab, setTab] = useState<"assigned" | "created" | "all">("assigned");
  const [showForm, setShowForm] = useState(openNew);
  const [editingNote, setEditingNote] = useState<NoteItem | null>(null);
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterPatient, setFilterPatient] = useState("");
  const [search2, setSearch2] = useState("");
  const [showDone, setShowDone] = useState(false);

  useEffect(() => { if (openNew) setShowForm(true); }, [openNew]);

  const queryParams = new URLSearchParams();
  queryParams.set("filter", tab);
  if (filterType) queryParams.set("type", filterType);
  if (filterStatus) queryParams.set("status", filterStatus);
  if (filterPatient) queryParams.set("patientId", filterPatient);

  const { data: notes = [], isLoading } = useQuery<NoteItem[]>({
    queryKey: ["notes", tab, filterType, filterStatus, filterPatient],
    queryFn: () => apiFetchJson(api(`/notes?${queryParams}`)),
    staleTime: 30_000,
  });

  const { data: users = [] } = useQuery<ClinicUser[]>({
    queryKey: ["clinic-users-simple"],
    queryFn: () => apiFetchJson(api("/users")),
    staleTime: 300_000,
    select: (rows: any[]) => rows.map((u) => ({ id: u.id, name: u.name })),
  });

  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: ["patients-simple-notes"],
    queryFn: () => apiFetchJson(api("/notes/patients")),
    staleTime: 300_000,
    select: (rows: any) => {
      const list = Array.isArray(rows) ? rows : rows?.data ?? [];
      return list.map((p: any) => ({ id: p.id, name: p.name }));
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["notes"] });
    qc.invalidateQueries({ queryKey: ["notes-summary"] });
    qc.invalidateQueries({ queryKey: ["notes-widget"] });
  };

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiSendJson(api("/notes"), "POST", data),
    onSuccess: () => { invalidate(); setShowForm(false); toast({ title: "Criado com sucesso!" }); },
    onError: (e: any) => toast({ variant: "destructive", title: "Erro ao criar", description: e.message }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      apiSendJson(api(`/notes/${id}`), "PATCH", data),
    onSuccess: () => { invalidate(); setEditingNote(null); toast({ title: "Atualizado!" }); },
    onError: (e: any) => toast({ variant: "destructive", title: "Erro ao atualizar", description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiSendJson(api(`/notes/${id}`), "DELETE"),
    onSuccess: () => { invalidate(); toast({ title: "Excluído." }); },
    onError: (e: any) => toast({ variant: "destructive", title: "Erro ao excluir", description: e.message }),
  });

  const completeMutation = useMutation({
    mutationFn: (id: number) => apiSendJson(api(`/notes/${id}/complete`), "POST"),
    onSuccess: () => invalidate(),
  });

  const seenMutation = useMutation({
    mutationFn: (id: number) => apiSendJson(api(`/notes/${id}/seen`), "POST"),
  });

  useEffect(() => {
    if (!notes.length) return;
    notes.forEach((n) => {
      if (n.assignedTo === currentUserId && !n.seenAt) {
        seenMutation.mutate(n.id);
      }
    });
  }, [notes.map((n) => n.id).join(",")]);

  const filtered = notes.filter((n) => {
    if (!showDone && n.status === "concluido") return false;
    if (filterPriority && n.priority !== filterPriority) return false;
    if (search2 && !n.title.toLowerCase().includes(search2.toLowerCase())) return false;
    return true;
  });

  const pendente = filtered.filter((n) => n.status === "pendente");
  const emAndamento = filtered.filter((n) => n.status === "em_andamento");
  const concluido = filtered.filter((n) => n.status === "concluido");

  const counts = {
    assigned: notes.filter((n) => n.assignedTo === currentUserId).length,
    created: notes.filter((n) => n.createdBy === currentUserId).length,
  };

  const hasFilters = filterType || filterStatus || filterPriority || filterPatient || search2;
  const activePatient = patients.find((p) => String(p.id) === filterPatient);

  return (
    <AppLayout title="Recados & Tarefas">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Recados &amp; Tarefas</h1>
            <p className="text-sm text-slate-500 mt-0.5">Organize lembretes, tarefas e recados da equipe</p>
          </div>
          <Button
            onClick={() => { setEditingNote(null); setShowForm(true); }}
            className="rounded-xl gap-2"
          >
            <Plus className="w-4 h-4" /> Novo
          </Button>
        </div>

        {/* New / Edit form */}
        {(showForm || editingNote) && (
          <div className="bg-white rounded-2xl border border-blue-100 shadow-md p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-700">
                {editingNote ? "Editar item" : "Novo item"}
              </h2>
              <button
                onClick={() => { setShowForm(false); setEditingNote(null); }}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <NoteForm
              users={users}
              patients={patients}
              initial={editingNote ?? undefined}
              currentUserId={currentUserId}
              loading={createMutation.isPending || updateMutation.isPending}
              onCancel={() => { setShowForm(false); setEditingNote(null); }}
              onSubmit={(data) => {
                if (editingNote) {
                  updateMutation.mutate({ id: editingNote.id, data });
                } else {
                  createMutation.mutate(data);
                }
              }}
            />
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          {([
            { key: "assigned", label: "Para mim" },
            { key: "created", label: "Enviados" },
            { key: "all", label: "Todos" },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-semibold transition-all",
                tab === t.key
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              {t.label}
              {(t.key === "assigned" || t.key === "created") && counts[t.key] > 0 && (
                <span className="ml-1.5 text-[10px] font-bold bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">
                  {counts[t.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={search2}
              onChange={(e) => setSearch2(e.target.value)}
              placeholder="Buscar..."
              className="pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300 w-40"
            />
          </div>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            <option value="">Todos os tipos</option>
            {TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>

          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            <option value="">Todas as prioridades</option>
            {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>

          {patients.length > 0 && (
            <select
              value={filterPatient}
              onChange={(e) => setFilterPatient(e.target.value)}
              className={cn(
                "border rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 transition-colors",
                filterPatient
                  ? "border-teal-300 bg-teal-50 text-teal-700 font-semibold"
                  : "border-slate-200"
              )}
            >
              <option value="">Todos os pacientes</option>
              {patients.map((p) => (
                <option key={p.id} value={String(p.id)}>{p.name}</option>
              ))}
            </select>
          )}

          <button
            onClick={() => setShowDone(!showDone)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-xs rounded-xl border font-medium transition-colors",
              showDone
                ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                : "border-slate-200 text-slate-500 hover:border-slate-300"
            )}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {showDone ? "Ocultar concluídos" : "Ver concluídos"}
          </button>

          {hasFilters && (
            <button
              onClick={() => { setFilterType(""); setFilterStatus(""); setFilterPriority(""); setFilterPatient(""); setSearch2(""); }}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              <RotateCcw className="w-3 h-3" /> Limpar filtros
            </button>
          )}
        </div>

        {/* Active patient filter banner */}
        {activePatient && (
          <div className="flex items-center gap-2 px-3 py-2 bg-teal-50 border border-teal-200 rounded-xl w-fit">
            <Stethoscope className="w-3.5 h-3.5 text-teal-600" />
            <span className="text-xs text-teal-700 font-semibold">
              Filtrando por paciente: <span className="font-bold">{activePatient.name}</span>
            </span>
            <button
              onClick={() => setFilterPatient("")}
              className="text-teal-400 hover:text-teal-700 transition-colors ml-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Notes grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-32 bg-slate-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-200 mb-3" />
            <p className="text-base font-semibold text-slate-500">
              {hasFilters ? "Nenhum item encontrado" : "Nenhum item aqui"}
            </p>
            <p className="text-sm text-slate-400 mt-1">
              {hasFilters ? "Tente limpar os filtros." : "Clique em \"Novo\" para criar."}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Urgentes / Atrasados — destaque */}
            {(() => {
              const urgent = filtered.filter(
                (n) => n.status !== "concluido" && (
                  n.priority === "urgente" ||
                  (n.dueAt && isPast(parseISO(n.dueAt)) && !isToday(parseISO(n.dueAt)))
                )
              );
              if (!urgent.length) return null;
              return (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    <span className="text-sm font-bold text-red-600">Atenção Imediata</span>
                    <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-full font-semibold">{urgent.length}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {urgent.map((n) => (
                      <NoteCard
                        key={n.id}
                        note={n}
                        currentUserId={currentUserId}
                        onComplete={completeMutation.mutate}
                        onDelete={deleteMutation.mutate}
                        onEdit={(note) => { setEditingNote(note); setShowForm(false); }}
                        completing={completeMutation.isPending}
                      />
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Pendentes */}
            {pendente.filter((n) => n.priority !== "urgente" && !(n.dueAt && isPast(parseISO(n.dueAt)) && !isToday(parseISO(n.dueAt)))).length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-blue-400" />
                  <span className="text-sm font-bold text-slate-600">Pendentes</span>
                  <span className="text-xs bg-blue-50 text-blue-500 px-2 py-0.5 rounded-full font-semibold">
                    {pendente.filter((n) => n.priority !== "urgente" && !(n.dueAt && isPast(parseISO(n.dueAt)) && !isToday(parseISO(n.dueAt)))).length}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {pendente
                    .filter((n) => n.priority !== "urgente" && !(n.dueAt && isPast(parseISO(n.dueAt)) && !isToday(parseISO(n.dueAt))))
                    .map((n) => (
                      <NoteCard
                        key={n.id}
                        note={n}
                        currentUserId={currentUserId}
                        onComplete={completeMutation.mutate}
                        onDelete={deleteMutation.mutate}
                        onEdit={(note) => { setEditingNote(note); setShowForm(false); }}
                        completing={completeMutation.isPending}
                      />
                    ))}
                </div>
              </div>
            )}

            {/* Em andamento */}
            {emAndamento.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-amber-400" />
                  <span className="text-sm font-bold text-slate-600">Em andamento</span>
                  <span className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full font-semibold">{emAndamento.length}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {emAndamento.map((n) => (
                    <NoteCard
                      key={n.id}
                      note={n}
                      currentUserId={currentUserId}
                      onComplete={completeMutation.mutate}
                      onDelete={deleteMutation.mutate}
                      onEdit={(note) => { setEditingNote(note); setShowForm(false); }}
                      completing={completeMutation.isPending}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Concluídos */}
            {showDone && concluido.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm font-bold text-slate-400">Concluídos</span>
                  <span className="text-xs bg-emerald-50 text-emerald-500 px-2 py-0.5 rounded-full font-semibold">{concluido.length}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {concluido.map((n) => (
                    <NoteCard
                      key={n.id}
                      note={n}
                      currentUserId={currentUserId}
                      onComplete={completeMutation.mutate}
                      onDelete={deleteMutation.mutate}
                      onEdit={(note) => { setEditingNote(note); setShowForm(false); }}
                      completing={completeMutation.isPending}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
