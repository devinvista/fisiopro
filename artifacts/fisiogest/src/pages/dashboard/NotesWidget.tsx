import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetchJson, apiSendJson, API_BASE } from "@/lib/api";
import { Link } from "wouter";
import { CheckCircle2, Circle, Clock, MessageSquare, Bell, ClipboardList, ArrowRight, Plus, CalendarClock, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, isPast, isToday, parseISO, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";

const api = (path: string) => `${API_BASE}/api${path}`;

interface NoteSummary {
  unread: number;
  overdue: number;
  dueToday: number;
  pending: number;
}

interface NoteItem {
  id: number;
  type: string;
  title: string;
  priority: string;
  status: string;
  dueAt: string | null;
  assignedTo: number | null;
  createdBy: number;
  seenAt: string | null;
  assigneeName: string | null;
  creatorName: string | null;
  patientName: string | null;
  patientId: number | null;
}

interface AppointmentItem {
  id: number;
  patientId: number;
  date: string;
  startTime: string;
  status: string;
}

type AppointmentProximity = "hoje" | "amanha";

const TYPE_CFG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  tarefa: { icon: ClipboardList, color: "text-blue-500", label: "Tarefa" },
  recado: { icon: MessageSquare, color: "text-violet-500", label: "Recado" },
  lembrete: { icon: Bell, color: "text-amber-500", label: "Lembrete" },
};

const PRIORITY_CFG: Record<string, { dot: string; label: string }> = {
  baixa: { dot: "bg-slate-300", label: "Baixa" },
  normal: { dot: "bg-blue-400", label: "Normal" },
  alta: { dot: "bg-orange-400", label: "Alta" },
  urgente: { dot: "bg-red-500", label: "Urgente" },
};

function DueLabel({ dueAt }: { dueAt: string | null }) {
  if (!dueAt) return null;
  const d = parseISO(dueAt);
  const overdue = isPast(d) && !isToday(d);
  const today = isToday(d);
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-[10px] font-semibold",
      overdue ? "text-red-500" : today ? "text-amber-600" : "text-slate-400"
    )}>
      <Clock className="w-3 h-3" />
      {overdue ? "Atrasado" : today ? "Hoje" : format(d, "dd/MM", { locale: ptBR })}
    </span>
  );
}

function AppointmentBadge({ proximity }: { proximity: AppointmentProximity }) {
  if (proximity === "hoje") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full">
        <CalendarClock className="w-2.5 h-2.5" />
        Consulta hoje
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-sky-50 text-sky-600 border border-sky-200 px-1.5 py-0.5 rounded-full">
      <Calendar className="w-2.5 h-2.5" />
      Consulta amanhã
    </span>
  );
}

function useUpcomingAppointmentPatients() {
  const today = format(new Date(), "yyyy-MM-dd");
  const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");

  const { data: todayAppts = [] } = useQuery<AppointmentItem[]>({
    queryKey: ["appointments-widget-today", today],
    queryFn: () => apiFetchJson(api(`/appointments?date=${today}`)),
    staleTime: 5 * 60_000,
    select: (rows: any[]) => rows.map((a) => ({
      id: a.id,
      patientId: a.patientId,
      date: a.date,
      startTime: a.startTime,
      status: a.status,
    })),
  });

  const { data: tomorrowAppts = [] } = useQuery<AppointmentItem[]>({
    queryKey: ["appointments-widget-tomorrow", tomorrow],
    queryFn: () => apiFetchJson(api(`/appointments?date=${tomorrow}`)),
    staleTime: 5 * 60_000,
    select: (rows: any[]) => rows.map((a) => ({
      id: a.id,
      patientId: a.patientId,
      date: a.date,
      startTime: a.startTime,
      status: a.status,
    })),
  });

  const proximityMap = new Map<number, AppointmentProximity>();

  const activeStatuses = new Set(["agendado", "confirmado", "compareceu"]);

  for (const appt of tomorrowAppts) {
    if (activeStatuses.has(appt.status)) {
      proximityMap.set(appt.patientId, "amanha");
    }
  }
  for (const appt of todayAppts) {
    if (activeStatuses.has(appt.status)) {
      proximityMap.set(appt.patientId, "hoje");
    }
  }

  return proximityMap;
}

export function NotesWidget() {
  const qc = useQueryClient();
  const appointmentProximity = useUpcomingAppointmentPatients();

  const { data: summary } = useQuery<NoteSummary>({
    queryKey: ["notes-summary"],
    queryFn: () => apiFetchJson(api("/notes/summary")),
    staleTime: 60_000,
  });

  const { data: notes, isLoading } = useQuery<NoteItem[]>({
    queryKey: ["notes-widget"],
    queryFn: () => apiFetchJson(api("/notes?filter=assigned")),
    staleTime: 60_000,
    select: (rows) => rows
      .filter((n) => n.status !== "concluido")
      .slice(0, 5),
  });

  const completeMutation = useMutation({
    mutationFn: (id: number) => apiSendJson(api(`/notes/${id}/complete`), "POST"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes-widget"] });
      qc.invalidateQueries({ queryKey: ["notes-summary"] });
    },
  });

  const hasActivity = (summary?.unread ?? 0) > 0 || (summary?.overdue ?? 0) > 0 || (summary?.dueToday ?? 0) > 0;
  if (!hasActivity && (!notes || notes.length === 0) && !isLoading) return null;

  return (
    <div className="rounded-2xl border border-blue-100 bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-50 flex items-center gap-3">
        <div className="p-2 bg-blue-50 rounded-xl shrink-0">
          <ClipboardList className="w-4 h-4 text-blue-500" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-slate-800">Recados &amp; Tarefas</h3>
          {summary && (
            <p className="text-xs text-slate-400">
              {summary.unread > 0 && `${summary.unread} recado${summary.unread !== 1 ? "s" : ""} não lido${summary.unread !== 1 ? "s" : ""}`}
              {summary.unread > 0 && summary.overdue > 0 && " · "}
              {summary.overdue > 0 && <span className="text-red-500 font-medium">{summary.overdue} atrasado{summary.overdue !== 1 ? "s" : ""}</span>}
              {(summary.unread > 0 || summary.overdue > 0) && summary.dueToday > 0 && " · "}
              {summary.dueToday > 0 && `${summary.dueToday} para hoje`}
              {summary.unread === 0 && summary.overdue === 0 && summary.dueToday === 0 && `${summary.pending} pendente${summary.pending !== 1 ? "s" : ""}`}
            </p>
          )}
        </div>
        <Link href="/recados">
          <button className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 font-medium transition-colors">
            Ver todos <ArrowRight className="w-3 h-3" />
          </button>
        </Link>
      </div>

      <div className="divide-y divide-slate-50">
        {isLoading ? (
          <div className="px-5 py-4 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-5 h-5 bg-slate-100 rounded-full shrink-0" />
                <div className="flex-1 h-4 bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        ) : notes && notes.length > 0 ? (
          <>
            {notes.map((note) => {
              const cfg = TYPE_CFG[note.type] ?? TYPE_CFG.tarefa;
              const prio = PRIORITY_CFG[note.priority] ?? PRIORITY_CFG.normal;
              const Icon = cfg.icon;
              const isDone = note.status === "concluido";
              const proximity = note.patientId != null
                ? appointmentProximity.get(note.patientId)
                : undefined;
              const isHighlighted = proximity != null;

              return (
                <div
                  key={note.id}
                  className={cn(
                    "px-5 py-3 flex items-start gap-3 transition-colors group relative",
                    isHighlighted && proximity === "hoje"
                      ? "bg-emerald-50/60 hover:bg-emerald-50 border-l-2 border-l-emerald-400"
                      : isHighlighted && proximity === "amanha"
                      ? "bg-sky-50/50 hover:bg-sky-50/80 border-l-2 border-l-sky-400"
                      : "hover:bg-slate-50/60",
                  )}
                >
                  <button
                    onClick={() => completeMutation.mutate(note.id)}
                    disabled={completeMutation.isPending}
                    className="mt-0.5 shrink-0 text-slate-300 hover:text-emerald-500 transition-colors"
                  >
                    {isDone
                      ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      : <Circle className="w-5 h-5" />
                    }
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", prio.dot)} />
                      <Icon className={cn("w-3 h-3", cfg.color)} />
                      <span className={cn("text-sm font-medium truncate", isDone && "line-through text-slate-400")}>
                        {note.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {note.patientName && (
                        <span className={cn(
                          "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                          isHighlighted
                            ? "text-teal-700 bg-teal-100"
                            : "text-teal-600 bg-teal-50"
                        )}>
                          {note.patientName}
                        </span>
                      )}
                      {proximity && <AppointmentBadge proximity={proximity} />}
                      <DueLabel dueAt={note.dueAt} />
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="px-5 py-3 flex items-center justify-between">
              <Link href="/recados">
                <button className="text-xs text-slate-400 hover:text-blue-500 transition-colors flex items-center gap-1">
                  Ver todos <ArrowRight className="w-3 h-3" />
                </button>
              </Link>
              <Link href="/recados?new=1">
                <button className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 font-medium transition-colors">
                  <Plus className="w-3 h-3" /> Novo
                </button>
              </Link>
            </div>
          </>
        ) : (
          <div className="px-5 py-6 flex flex-col items-center gap-2 text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-300" />
            <p className="text-sm font-medium text-slate-500">Tudo em dia!</p>
            <p className="text-xs text-slate-400">Nenhuma tarefa ou recado pendente.</p>
            <Link href="/recados?new=1">
              <button className="mt-1 text-xs text-blue-500 hover:text-blue-700 font-medium transition-colors flex items-center gap-1">
                <Plus className="w-3 h-3" /> Criar tarefa
              </button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
