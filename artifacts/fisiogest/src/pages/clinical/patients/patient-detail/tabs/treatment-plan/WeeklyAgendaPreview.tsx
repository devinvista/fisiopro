import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { countRecurringSessions } from "../../utils/sessionCount";

type PlanItem = {
  id: number;
  procedureName?: string | null;
  packageName?: string | null;
  packageType?: string | null;
  weekDays?: string | string[] | null;
  defaultStartTime?: string | null;
  defaultProfessionalName?: string | null;
  defaultProfessionalId?: number | null;
  sessionDurationMinutes?: number | null;
};

interface Props {
  planItems: PlanItem[];
  startDate?: string | null;
  durationMonths?: number | null;
}

const WEEK_LABELS_PT: Record<string, string> = {
  monday: "Seg",
  tuesday: "Ter",
  wednesday: "Qua",
  thursday: "Qui",
  friday: "Sex",
  saturday: "Sáb",
  sunday: "Dom",
};

const ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function parseWeekDays(raw: string | string[] | null | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* noop */ }
  return [];
}

function dowKey(d: Date): string {
  const dow = d.getDay();
  return ORDER[(dow + 6) % 7];
}

function startOfWeek(d: Date): Date {
  const out = new Date(d);
  const day = out.getDay();
  const diff = (day + 6) % 7;
  out.setDate(out.getDate() - diff);
  out.setHours(0, 0, 0, 0);
  return out;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function fmtDayMonth(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function WeeklyAgendaPreview({ planItems, startDate, durationMonths }: Props) {
  const recurringItems = useMemo(
    () =>
      planItems
        .filter((i) => i.packageType === "mensal")
        .map((i) => ({ ...i, weekDays: parseWeekDays(i.weekDays as any) }))
        .filter((i) => i.weekDays.length > 0),
    [planItems],
  );

  const [weekOffset, setWeekOffset] = useState(0);

  const baseDate = useMemo(() => {
    if (startDate) {
      const d = new Date(startDate + "T00:00:00");
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  }, [startDate]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const referenceMonday = useMemo(() => {
    const start = baseDate > today ? baseDate : today;
    return startOfWeek(start);
  }, [baseDate, today]);

  const visibleMonday = useMemo(
    () => addDays(referenceMonday, weekOffset * 7),
    [referenceMonday, weekOffset],
  );

  const days = useMemo(() => {
    const out: Date[] = [];
    for (let i = 0; i < 7; i++) out.push(addDays(visibleMonday, i));
    return out;
  }, [visibleMonday]);

  const totalEstimate = useMemo(() => {
    const months = durationMonths ?? 12;
    const start = startDate ?? null;
    return recurringItems.reduce(
      (s, i) => s + countRecurringSessions(start, months, i.weekDays as string[]),
      0,
    );
  }, [recurringItems, durationMonths, startDate]);

  if (recurringItems.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="flex items-center gap-2 mb-1.5">
          <CalendarDays className="w-4 h-4 text-slate-400" />
          <h4 className="text-sm font-semibold text-slate-600">Pré-visualização da agenda</h4>
        </div>
        <p className="text-xs text-slate-500">
          Configure os <strong>dias da semana</strong> e o <strong>horário</strong> de cada item
          recorrente (pacote mensal) na aba <em>Itens</em> para ver aqui como ficará a agenda do
          paciente.
        </p>
      </div>
    );
  }

  const minMondayOffset = (() => {
    const diff = Math.floor((today.getTime() - referenceMonday.getTime()) / (1000 * 60 * 60 * 24));
    return Math.floor(diff / 7);
  })();

  return (
    <div className="rounded-xl border border-primary/20 bg-white p-4 space-y-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-primary" />
          <h4 className="text-sm font-semibold text-slate-700">Pré-visualização da agenda</h4>
          <Badge variant="outline" className="text-[10px] font-normal">
            ~{totalEstimate} consultas no total
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button" size="sm" variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => setWeekOffset((v) => Math.max(minMondayOffset, v - 1))}
            disabled={weekOffset <= minMondayOffset}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs text-slate-600 font-medium min-w-[160px] text-center">
            {fmtDayMonth(days[0])} – {fmtDayMonth(days[6])}
          </span>
          <Button
            type="button" size="sm" variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => setWeekOffset((v) => v + 1)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const key = dowKey(d);
          const slots = recurringItems
            .filter((i) => (i.weekDays as string[]).includes(key))
            .map((i) => ({
              id: i.id,
              label: i.procedureName ?? i.packageName ?? "Sessão",
              time: i.defaultStartTime ?? "—",
              prof: i.defaultProfessionalName ?? null,
            }))
            .sort((a, b) => (a.time > b.time ? 1 : -1));

          const isToday = d.getTime() === today.getTime();
          const isPast = d.getTime() < today.getTime();

          return (
            <div
              key={d.toISOString()}
              className={`rounded-lg border min-h-[110px] p-1.5 flex flex-col ${
                isToday
                  ? "border-primary/40 bg-primary/5"
                  : isPast
                  ? "border-slate-100 bg-slate-50/40 opacity-60"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-[10px] uppercase font-semibold text-slate-500">
                  {WEEK_LABELS_PT[key]}
                </span>
                <span
                  className={`text-[11px] font-semibold ${
                    isToday ? "text-primary" : "text-slate-700"
                  }`}
                >
                  {String(d.getDate()).padStart(2, "0")}
                </span>
              </div>
              <div className="space-y-1 flex-1">
                {slots.length === 0 ? (
                  <span className="text-[10px] text-slate-300 italic">—</span>
                ) : (
                  slots.map((s, idx) => (
                    <div
                      key={`${s.id}-${idx}`}
                      className="rounded-md bg-primary/10 border border-primary/20 px-1.5 py-1 text-[10px] leading-tight"
                      title={`${s.label} • ${s.time}${s.prof ? ` • ${s.prof}` : ""}`}
                    >
                      <div className="flex items-center gap-1 text-primary font-semibold">
                        <Clock className="w-2.5 h-2.5" /> {s.time}
                      </div>
                      <div className="text-slate-700 truncate">{s.label}</div>
                      {s.prof && (
                        <div className="text-slate-500 truncate flex items-center gap-0.5">
                          <User className="w-2.5 h-2.5" /> {s.prof}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-slate-500">
        Esta é uma <strong>simulação</strong> baseada nos dias e horários configurados nos itens
        do plano. As consultas só serão criadas de fato após o aceite e a materialização do plano.
      </p>
    </div>
  );
}
