/**
 * PlanScheduleEditor — editor de agenda do plano (etapa "Agenda" do wizard).
 * Sprint 15 (F7): renomeado a partir de `AcceptanceScheduleEditor` quando
 * o fluxo v1 foi removido. Montado pelo `StepAgenda` em `TreatmentPlanTab`
 * antes do aceite, e também depois do início do plano para reconfigurar.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { apiFetchJson, apiSendJson } from "@/lib/api";
import {
  CalendarDays, Clock, Lock, CheckCircle2, Loader2, AlertTriangle, Sparkles,
  CalendarCheck, MapPin, ChevronRight, Users, Repeat, Package, Hash,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/lib/toast";

// ───────────────────────────────────────────────────────────────────────────
// Editor de agenda do plano (pós-aceite).
//
// Exibe TODOS os itens do plano (mensalidades, pacotes de sessões e avulsos)
// e permite configurar agenda + dias da semana + horário sugerido para cada
// um. A geração efetiva de consultas ocorre na materialização ("Iniciar
// plano"), conforme o tipo do item:
//   - Recorrente mensal: N consultas/mês ao longo de toda a vigência
//   - Pacote de sessões: até `totalSessions` consultas (uma série fechada)
//   - Avulso: 1 consulta única (na próxima ocorrência do dia escolhido)
//
// Fluxo de configuração (sempre o mesmo, independente do tipo):
//   1) Selecionar a AGENDA (calendário/sala/profissional). Define quem
//      atende, dias úteis, faixa horária e duração-padrão dos slots.
//   2) Selecionar os DIAS DA SEMANA, restrito aos dias úteis da agenda.
//   3) Selecionar o HORÁRIO a partir de uma lista de slots realmente livres
//      (intersecção dos slots disponíveis em cada dia escolhido na próxima
//      semana de referência), consultando /api/appointments/available-slots.
// ───────────────────────────────────────────────────────────────────────────

const WEEK_DAYS = [
  { key: "monday",    short: "Seg", long: "Segunda", dow: 1 },
  { key: "tuesday",   short: "Ter", long: "Terça",   dow: 2 },
  { key: "wednesday", short: "Qua", long: "Quarta",  dow: 3 },
  { key: "thursday",  short: "Qui", long: "Quinta",  dow: 4 },
  { key: "friday",    short: "Sex", long: "Sexta",   dow: 5 },
  { key: "saturday",  short: "Sáb", long: "Sábado",  dow: 6 },
  { key: "sunday",    short: "Dom", long: "Domingo", dow: 0 },
] as const;

type WeekDayKey = (typeof WEEK_DAYS)[number]["key"];

type ItemKind = "recorrenteMensal" | "pacoteSessoes" | "avulso";

type PlanItem = {
  id: number;
  kind?: string | null;
  procedureId?: number | null;
  packageId?: number | null;
  procedureName?: string | null;
  packageName?: string | null;
  packageType?: string | null;
  packageProcedureId?: number | null;
  sessionsPerWeek?: number | null;
  totalSessions?: number | null;
  weekDays?: string | string[] | null;
  defaultStartTime?: string | null;
  /** Mapa opcional dia→horário (suporte a horários diferentes por dia). */
  startTimesByDay?: string | Record<string, string> | null;
  defaultProfessionalId?: number | null;
  defaultProfessionalName?: string | null;
  scheduleId?: number | null;
  sessionDurationMinutes?: number | null;
};

type Schedule = {
  id: number;
  name: string;
  type: "clinic" | "professional" | string;
  professionalId: number | null;
  workingDays: string;       // "1,2,3,4,5"
  startTime: string;         // "08:00"
  endTime: string;           // "18:00"
  slotDurationMinutes: number;
  isActive: boolean;
  color?: string | null;
};

interface Props {
  planId: number;
  planItems: PlanItem[];
  planItemsKey: string[] | null;
  isMaterialized: boolean;
}

function resolveItemKind(item: PlanItem): ItemKind {
  if (item.kind === "recorrenteMensal") return "recorrenteMensal";
  if (item.kind === "pacoteSessoes") return "pacoteSessoes";
  if (item.kind === "avulso") return "avulso";
  if (item.packageId != null) {
    if (item.packageType === "mensal" || item.packageType === "faturaConsolidada") {
      return "recorrenteMensal";
    }
    return "pacoteSessoes";
  }
  return "avulso";
}

function parseWeekDays(raw: string | string[] | null | undefined): WeekDayKey[] {
  if (!raw) return [];
  const arr: any[] = Array.isArray(raw)
    ? raw
    : (() => { try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; } })();
  return arr.filter((x): x is WeekDayKey =>
    WEEK_DAYS.some((w) => w.key === x),
  );
}

function workingDayDows(workingDays: string): number[] {
  return workingDays
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 6);
}

/** Retorna data ISO (YYYY-MM-DD) do próximo `dow` (0=Dom..6=Sáb) a partir de hoje. */
function nextDateForDow(dow: number, refDate = new Date()): string {
  const d = new Date(refDate);
  d.setHours(12, 0, 0, 0);
  const today = d.getDay();
  const delta = (dow - today + 7) % 7 || 7; // sempre uma data futura
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

const KIND_META: Record<ItemKind, {
  label: string;
  Icon: typeof Repeat;
  badgeClass: string;
  hint: string;
}> = {
  recorrenteMensal: {
    label: "Mensalidade",
    Icon: Repeat,
    badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200",
    hint: "Consultas recorrentes durante toda a vigência do plano.",
  },
  pacoteSessoes: {
    label: "Pacote de sessões",
    Icon: Package,
    badgeClass: "bg-violet-50 text-violet-700 border-violet-200",
    hint: "Série fechada — limitada ao total de sessões contratadas.",
  },
  avulso: {
    label: "Avulso",
    Icon: Hash,
    badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
    hint: "Sessão única — agendada na próxima ocorrência do dia escolhido.",
  },
};

export function PlanScheduleEditor({
  planId,
  planItems,
  planItemsKey,
  isMaterialized,
}: Props) {
  const allItems = useMemo(() => planItems ?? [], [planItems]);

  const { data: allSchedules = [], isLoading: schedulesLoading } = useQuery<Schedule[]>({
    queryKey: ["/api/schedules"],
    queryFn: () => apiFetchJson<Schedule[]>("/api/schedules"),
  });
  const schedules = useMemo(
    () => allSchedules.filter((s) => s.isActive),
    [allSchedules],
  );

  if (allItems.length === 0) return null;

  const counts = allItems.reduce(
    (acc, i) => {
      const k = resolveItemKind(i);
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    },
    { recorrenteMensal: 0, pacoteSessoes: 0, avulso: 0 } as Record<ItemKind, number>,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(counts) as ItemKind[]).map((k) =>
            counts[k] > 0 ? (
              <Badge
                key={k}
                variant="outline"
                className={`text-[10px] font-normal ${KIND_META[k].badgeClass}`}
              >
                {counts[k]} {KIND_META[k].label.toLowerCase()}
                {counts[k] === 1 ? "" : "s"}
              </Badge>
            ) : null,
          )}
        </div>
        {isMaterialized && (
          <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
            <Lock className="w-3 h-3" /> Plano já iniciado — alterações exigem reverter
          </span>
        )}
      </div>

      <div className="space-y-3">
        {allItems.map((item) => (
          <ItemRow
            key={item.id}
            planId={planId}
            item={item}
            kind={resolveItemKind(item)}
            planItemsKey={planItemsKey}
            disabled={isMaterialized}
            schedules={schedules}
            schedulesLoading={schedulesLoading}
          />
        ))}
      </div>

      <p className="text-[11px] text-slate-500 flex items-start gap-1.5 border-t border-slate-100 pt-3">
        <Sparkles className="w-3 h-3 text-primary mt-0.5 shrink-0" />
        Os horários sugeridos consideram a agenda escolhida e os bloqueios já
        existentes. Mensalidades geram consultas recorrentes; pacotes geram
        uma série limitada às sessões contratadas; avulsos geram uma única
        consulta. Itens sem agenda configurada continuam livres para serem
        marcados manualmente.
      </p>
    </div>
  );
}

function ItemRow({
  planId, item, kind, planItemsKey, disabled, schedules, schedulesLoading,
}: {
  planId: number;
  item: PlanItem;
  kind: ItemKind;
  planItemsKey: string[] | null;
  disabled: boolean;
  schedules: Schedule[];
  schedulesLoading: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const meta = KIND_META[kind];

  // Parse seguro do mapa "dia → horário" persistido. Aceita objeto OU string
  // JSON e descarta entradas inválidas (chaves desconhecidas ou tempos não-HH:MM).
  function parseStartTimesByDay(
    raw: string | Record<string, string> | null | undefined,
  ): Record<WeekDayKey, string> {
    const out = {} as Record<WeekDayKey, string>;
    if (!raw) return out;
    let obj: any = raw;
    if (typeof raw === "string") {
      try { obj = JSON.parse(raw); } catch { return out; }
    }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return out;
    for (const [k, v] of Object.entries(obj)) {
      const key = String(k).toLowerCase() as WeekDayKey;
      if (
        WEEK_DAYS.some((w) => w.key === key) &&
        typeof v === "string" &&
        /^\d{2}:\d{2}$/.test(v)
      ) {
        out[key] = v;
      }
    }
    return out;
  }

  const initialWeekDays = parseWeekDays(item.weekDays);
  // Inicializa o mapa por dia: usa `startTimesByDay` quando disponível e,
  // como fallback (compat com itens antigos), aplica o `defaultStartTime`
  // a todos os dias selecionados.
  const buildInitialStartTimes = (): Record<WeekDayKey, string> => {
    const map = parseStartTimesByDay(item.startTimesByDay);
    if (item.defaultStartTime) {
      for (const k of initialWeekDays) {
        if (!map[k]) map[k] = item.defaultStartTime;
      }
    }
    return map;
  };

  const [scheduleId, setScheduleId] = useState<number | null>(item.scheduleId ?? null);
  const [weekDays, setWeekDays] = useState<WeekDayKey[]>(initialWeekDays);
  const [startTimes, setStartTimes] = useState<Record<WeekDayKey, string>>(
    buildInitialStartTimes(),
  );

  // Snapshot do estado salvo (para detectar dirty). Serializa o mapa de
  // horários de forma estável ordenando por dia da semana.
  const serializeTimes = (m: Record<WeekDayKey, string>): string =>
    WEEK_DAYS.map((w) => `${w.key}:${m[w.key] ?? ""}`).join("|");

  const [savedSnap, setSavedSnap] = useState({
    scheduleId: item.scheduleId ?? null,
    weekDays: initialWeekDays.join(","),
    startTimes: serializeTimes(buildInitialStartTimes()),
  });

  useEffect(() => {
    const wd = parseWeekDays(item.weekDays);
    const times = (() => {
      const map = parseStartTimesByDay(item.startTimesByDay);
      if (item.defaultStartTime) {
        for (const k of wd) {
          if (!map[k]) map[k] = item.defaultStartTime;
        }
      }
      return map;
    })();
    setScheduleId(item.scheduleId ?? null);
    setWeekDays(wd);
    setStartTimes(times);
    setSavedSnap({
      scheduleId: item.scheduleId ?? null,
      weekDays: wd.join(","),
      startTimes: serializeTimes(times),
    });
     
  }, [item.id, item.weekDays, item.defaultStartTime, item.startTimesByDay, item.scheduleId]);

  const selectedSchedule = useMemo(
    () => schedules.find((s) => s.id === scheduleId) ?? null,
    [schedules, scheduleId],
  );

  // Limita os WEEK_DAYS aos dias úteis da agenda escolhida
  const allowedDows = useMemo(
    () => (selectedSchedule ? workingDayDows(selectedSchedule.workingDays) : []),
    [selectedSchedule],
  );
  const allowedWeekDays = useMemo(
    () => WEEK_DAYS.filter((w) => allowedDows.includes(w.dow)),
    [allowedDows],
  );

  // Quando troca a agenda, remove dias que não são mais úteis
  useEffect(() => {
    if (!selectedSchedule) return;
    setWeekDays((prev) => prev.filter((k) => {
      const dow = WEEK_DAYS.find((w) => w.key === k)?.dow;
      return dow !== undefined && allowedDows.includes(dow);
    }));
  }, [selectedSchedule, allowedDows]);

  // Procedimento usado para checar disponibilidade
  const procedureId = item.packageProcedureId ?? item.procedureId ?? null;

  // Para cada dia escolhido, busca a próxima ocorrência real e seus slots.
  const probeDates = useMemo(() => {
    return weekDays.map((key) => {
      const dow = WEEK_DAYS.find((w) => w.key === key)!.dow;
      return { key, dow, date: nextDateForDow(dow) };
    });
  }, [weekDays]);

  // Busca slots livres em cada dia. Sem mais intersecção: cada dia tem seu
  // próprio conjunto de slots e o usuário escolhe um horário INDEPENDENTE
  // por dia (suporta seg 08:00 + qua 10:00, por exemplo).
  type DaySlots = { key: WeekDayKey; date: string; slots: { time: string; spotsLeft: number }[] };
  const availabilityQueries = useQuery<DaySlots[]>({
    queryKey: [
      "available-slots-per-day",
      scheduleId,
      procedureId,
      probeDates.map((p) => `${p.key}:${p.date}`).join(","),
    ],
    queryFn: async () => {
      if (!scheduleId || !procedureId || probeDates.length === 0) return [];
      const results = await Promise.all(
        probeDates.map(async (p) => {
          const data = await apiFetchJson<any>(
            `/api/appointments/available-slots?date=${p.date}&procedureId=${procedureId}&scheduleId=${scheduleId}`,
          );
          const slots: { time: string; available: boolean; spotsLeft: number }[] =
            data?.slots ?? [];
          return {
            key: p.key,
            date: p.date,
            slots: slots
              .filter((s) => s.available)
              .map((s) => ({ time: s.time, spotsLeft: s.spotsLeft }))
              .sort((a, b) => a.time.localeCompare(b.time)),
          };
        }),
      );
      return results;
    },
    enabled: !!scheduleId && !!procedureId && probeDates.length > 0,
  });

  // Mapa key → slots livres (para lookup rápido na renderização)
  const slotsByDay = useMemo(() => {
    const out = {} as Record<WeekDayKey, { time: string; spotsLeft: number }[]>;
    for (const d of availabilityQueries.data ?? []) out[d.key] = d.slots;
    return out;
  }, [availabilityQueries.data]);

  // Para cada dia, indica se o horário atual deixou de estar disponível
  const unavailableDays = useMemo(() => {
    const out = new Set<WeekDayKey>();
    if (!availabilityQueries.data) return out;
    for (const d of availabilityQueries.data) {
      const t = startTimes[d.key];
      if (t && !d.slots.some((s) => s.time === t)) out.add(d.key);
    }
    return out;
  }, [startTimes, availabilityQueries.data]);

  const dirty =
    (scheduleId ?? null) !== savedSnap.scheduleId ||
    weekDays.join(",") !== savedSnap.weekDays ||
    serializeTimes(startTimes) !== savedSnap.startTimes;

  // Item válido = agenda + ≥1 dia + cada dia escolhido tem horário definido
  const allDaysHaveTime =
    weekDays.length > 0 && weekDays.every((k) => !!startTimes[k]);
  const isValid = !!scheduleId && allDaysHaveTime;
  const missingDays = useMemo(
    () => weekDays.filter((k) => !startTimes[k]),
    [weekDays, startTimes],
  );

  // Refs para os cards de cada dia, para permitir scroll-into-view ao
  // primeiro dia pendente quando a validação de salvar falha.
  const dayCardRefs = useRef<Map<WeekDayKey, HTMLDivElement | null>>(new Map());
  const setDayCardRef = (key: WeekDayKey) => (el: HTMLDivElement | null) => {
    if (el) dayCardRefs.current.set(key, el);
    else dayCardRefs.current.delete(key);
  };
  const [pulseDay, setPulseDay] = useState<WeekDayKey | null>(null);
  const slotsPerWeek = weekDays.length;
  const totalSessions = item.totalSessions ?? null;

  // Resumo "X sessões previstas" por tipo
  const projectionLabel = useMemo(() => {
    if (slotsPerWeek === 0) return null;
    if (kind === "recorrenteMensal") {
      return `${slotsPerWeek}x/semana · ~${slotsPerWeek * 4} sessões/mês`;
    }
    if (kind === "pacoteSessoes") {
      const total = totalSessions ?? 0;
      if (total <= 0) return `${slotsPerWeek}x/semana`;
      const weeks = Math.ceil(total / slotsPerWeek);
      return `${total} sessões em ~${weeks} semana${weeks === 1 ? "" : "s"}`;
    }
    // avulso
    return `1 consulta única (próxima ${slotsPerWeek > 1 ? "ocorrência disponível" : "semana"})`;
  }, [kind, slotsPerWeek, totalSessions]);

  const mutation = useMutation({
    mutationFn: (body: object) =>
      apiSendJson<any>(`/api/treatment-plans/${planId}/procedures/${item.id}`, "PUT", body),
    onSuccess: () => {
      setSavedSnap({
        scheduleId: scheduleId ?? null,
        weekDays: weekDays.join(","),
        startTimes: serializeTimes(startTimes),
      });
      queryClient.invalidateQueries({ queryKey: planItemsKey ?? [] });
      toast({
        title: "Agenda atualizada!",
        description: `${item.packageName ?? item.procedureName ?? "Item"} salvo com sucesso.`,
      });
    },
    onError: (err: Error) =>
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" }),
  });

  // Constrói o payload que vai para o servidor: mapa por dia + um
  // `defaultStartTime` legacy (usa o horário do PRIMEIRO dia selecionado
  // como fallback para clientes/processos que ainda leem só esse campo).
  const buildSavePayload = () => {
    const map: Record<string, string> = {};
    for (const k of weekDays) {
      if (startTimes[k]) map[k] = startTimes[k];
    }
    const fallback = weekDays.length > 0 ? startTimes[weekDays[0]] ?? "" : "";
    return {
      scheduleId,
      weekDays: JSON.stringify(weekDays),
      defaultStartTime: fallback,
      startTimesByDay: JSON.stringify(map),
      defaultProfessionalId: selectedSchedule?.professionalId ?? null,
    };
  };

  // Auto-save: assim que o item fica válido (agenda + cada dia com horário)
  // e há alterações pendentes, persistimos após um pequeno debounce. Evita
  // o pitfall do usuário escolher tudo, navegar para a próxima etapa sem
  // clicar em "Salvar" e ver o aviso "item recorrente sem agenda definida"
  // em Iniciar Plano.
  useEffect(() => {
    if (disabled) return;
    if (!dirty) return;
    if (!isValid) return;
    if (mutation.isPending) return;
    const t = setTimeout(() => mutation.mutate(buildSavePayload()), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, scheduleId, weekDays, startTimes, isValid, disabled]);

  // Limite contratado: o número de dias da semana selecionados não pode
  // ultrapassar `sessionsPerWeek` (frequência aprovada no plano). Como a
  // recorrência é semanal, weekDays.length = sessões/semana criadas na
  // materialização inicial. Esta regra vale apenas no setup; após o plano
  // iniciar, o paciente pode exceder o limite via reagendamentos ou
  // créditos de falta.
  const maxWeekDays =
    item.sessionsPerWeek != null && item.sessionsPerWeek > 0
      ? item.sessionsPerWeek
      : null;
  const limitReached = maxWeekDays != null && weekDays.length >= maxWeekDays;

  function toggleDay(key: WeekDayKey) {
    if (disabled) return;
    const isSelected = weekDays.includes(key);
    if (!isSelected && maxWeekDays != null && weekDays.length >= maxWeekDays) {
      toast({
        title: "Limite do plano atingido",
        description:
          `Este item foi contratado para ${maxWeekDays} sessão(ões) por ` +
          `semana. Desmarque outro dia antes de escolher um novo.`,
        variant: "destructive",
      });
      return;
    }
    setWeekDays((prev) =>
      isSelected ? prev.filter((d) => d !== key) : [...prev, key],
    );
    if (isSelected) {
      // Removeu o dia → limpa o horário registrado para ele.
      setStartTimes((prev) => {
        const { [key]: _drop, ...rest } = prev;
        return rest as Record<WeekDayKey, string>;
      });
    }
  }

  function setTimeForDay(key: WeekDayKey, time: string) {
    if (disabled) return;
    setStartTimes((prev) => ({ ...prev, [key]: time }));
  }

  function handleSave() {
    if (disabled || !dirty) return;
    if (!scheduleId) {
      toast({
        title: "Selecione uma agenda",
        description: "É preciso escolher a agenda em que as consultas serão criadas.",
        variant: "destructive",
      });
      return;
    }
    if (weekDays.length === 0) {
      toast({
        title: "Selecione ao menos um dia",
        description: "É preciso definir pelo menos um dia da semana.",
        variant: "destructive",
      });
      return;
    }
    if (!allDaysHaveTime) {
      const faltantes = missingDays
        .map((k) => WEEK_DAYS.find((w) => w.key === k)?.long)
        .join(", ");
      toast({
        title: "Defina um horário para cada dia",
        description: `Falta o horário em: ${faltantes}.`,
        variant: "destructive",
      });
      // Rola até o primeiro dia pendente e dispara um pulso visual para
      // facilitar localizar o card que está faltando preencher.
      const first = missingDays[0];
      if (first) {
        const el = dayCardRefs.current.get(first);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        setPulseDay(first);
        window.setTimeout(() => setPulseDay(null), 1800);
      }
      return;
    }
    mutation.mutate(buildSavePayload());
  }

  // Estados visuais
  const stepBadge = (n: number, active: boolean, done: boolean) => (
    <span
      className={`inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold mr-1.5 ${
        done
          ? "bg-emerald-500 text-white"
          : active
          ? "bg-primary text-white"
          : "bg-slate-200 text-slate-500"
      }`}
    >
      {done ? "✓" : n}
    </span>
  );

  const KindIcon = meta.Icon;

  return (
    <div
      className={`rounded-2xl border ${
        dirty ? "border-amber-300 bg-amber-50/30" : "border-slate-200 bg-white"
      } p-4 space-y-4 transition-colors`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2 min-w-0">
          <Badge
            variant="outline"
            className={`text-[10px] font-medium py-0 px-1.5 flex items-center gap-1 ${meta.badgeClass}`}
          >
            <KindIcon className="w-2.5 h-2.5" />
            {meta.label}
          </Badge>
          <p className="text-sm font-semibold text-slate-700 truncate">
            {item.packageName ?? item.procedureName ?? "Item do plano"}
          </p>
          {projectionLabel && (
            <span className="text-[11px] text-slate-500">{projectionLabel}</span>
          )}
          {!isValid && (
            <Badge
              variant="outline"
              className="text-[10px] py-0 px-1.5 bg-rose-50 text-rose-700 border-rose-200 flex items-center gap-1"
            >
              <AlertTriangle className="w-2.5 h-2.5" /> Pendente
            </Badge>
          )}
          {isValid && !dirty && (
            <Badge
              variant="outline"
              className="text-[10px] py-0 px-1.5 bg-emerald-50 text-emerald-700 border-emerald-200 flex items-center gap-1"
            >
              <CheckCircle2 className="w-2.5 h-2.5" /> Configurado
            </Badge>
          )}
        </div>
        {dirty && (
          <Button
            type="button" size="sm"
            className="h-8 gap-1 rounded-lg text-xs"
            onClick={handleSave}
            disabled={mutation.isPending || disabled}
          >
            {mutation.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <CheckCircle2 className="w-3 h-3" />
            )}
            Salvar alterações
          </Button>
        )}
      </div>

      <p className="text-[11px] text-slate-500 -mt-2">{meta.hint}</p>

      {/* Etapa 1 — Agenda */}
      <div className="space-y-1.5">
        <Label className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide flex items-center">
          {stepBadge(1, !scheduleId, !!scheduleId)}
          <CalendarDays className="w-3 h-3 mr-1" /> Agenda
        </Label>
        <Select
          value={scheduleId != null ? String(scheduleId) : ""}
          onValueChange={(v) => {
            setScheduleId(Number(v));
            setStartTimes({} as Record<WeekDayKey, string>); // muda totalmente o conjunto de slots
          }}
          disabled={disabled || schedulesLoading}
        >
          <SelectTrigger className="h-10 bg-white">
            <SelectValue
              placeholder={schedulesLoading ? "Carregando agendas…" : "Escolha a agenda…"}
            />
          </SelectTrigger>
          <SelectContent>
            {schedules.length === 0 && (
              <SelectItem value="_none" disabled>
                Nenhuma agenda ativa cadastrada
              </SelectItem>
            )}
            {schedules.map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>
                <span className="inline-flex items-center gap-2">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: s.color || "#6366f1" }}
                  />
                  {s.name}
                  <span className="text-[10px] text-slate-400">
                    {s.startTime}–{s.endTime} · {s.type === "professional" ? "Profissional" : "Clínica"}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedSchedule && (
          <p className="text-[11px] text-slate-500 flex items-center gap-1">
            {selectedSchedule.type === "professional" ? (
              <>
                <Users className="w-3 h-3" />
                Profissional fixo desta agenda
              </>
            ) : (
              <>
                <MapPin className="w-3 h-3" />
                Agenda da clínica
              </>
            )}
            <ChevronRight className="w-3 h-3 text-slate-300" />
            Slot de {selectedSchedule.slotDurationMinutes} min · funciona{" "}
            {allowedWeekDays.map((d) => d.short).join(", ")}
          </p>
        )}
      </div>

      {/* Etapa 2 — Dias da semana */}
      <div className="space-y-1.5">
        <Label className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide flex items-center flex-wrap gap-x-2">
          <span className="flex items-center">
            {stepBadge(2, !!scheduleId && weekDays.length === 0, weekDays.length > 0)}
            {kind === "avulso" ? "Dia da semana" : "Dias da semana"}
          </span>
          {!scheduleId && (
            <span className="text-[10px] text-slate-400 normal-case font-normal">
              (escolha a agenda primeiro)
            </span>
          )}
          {maxWeekDays != null && (
            <span
              className={`text-[10px] normal-case font-medium px-1.5 py-0.5 rounded ${
                limitReached
                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                  : "bg-slate-50 text-slate-500 border border-slate-200"
              }`}
              title={`Plano contratado: ${maxWeekDays} sessão(ões) por semana`}
            >
              {weekDays.length}/{maxWeekDays} {maxWeekDays === 1 ? "dia" : "dias"} · máx. do plano
            </span>
          )}
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {WEEK_DAYS.map((d) => {
            const allowed = allowedDows.includes(d.dow);
            const active = weekDays.includes(d.key);
            const blockedByLimit = !active && limitReached;
            const isDisabled = disabled || !scheduleId || !allowed || blockedByLimit;
            const titleText = !allowed
              ? `${d.long} — agenda não funciona neste dia`
              : blockedByLimit
              ? `${d.long} — limite do plano atingido (${maxWeekDays}/semana)`
              : d.long;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => allowed && toggleDay(d.key)}
                disabled={isDisabled}
                title={titleText}
                className={`h-9 px-3 rounded-md border text-xs font-medium transition flex items-center justify-center min-w-[44px] ${
                  active
                    ? "bg-primary text-white border-primary shadow-sm"
                    : allowed && !blockedByLimit
                    ? "bg-white text-slate-600 border-slate-200 hover:border-primary/40 hover:text-primary"
                    : "bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed"
                } ${isDisabled && !active ? "opacity-60" : ""}`}
              >
                {d.short}
              </button>
            );
          })}
        </div>
        {limitReached && (
          <p className="text-[10px] text-amber-700 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Limite contratado atingido. Para escolher outro dia, desmarque um dos selecionados ou renegocie a frequência do plano.
          </p>
        )}
      </div>

      {/* Etapa 3 — Horário POR DIA (cada dia escolhe seu próprio slot) */}
      <div className="space-y-1.5">
        <Label className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide flex items-center">
          {stepBadge(
            3,
            weekDays.length > 0 && !allDaysHaveTime,
            allDaysHaveTime && unavailableDays.size === 0,
          )}
          <Clock className="w-3 h-3 mr-1" /> Horário por dia
          {availabilityQueries.isFetching && (
            <Loader2 className="w-3 h-3 animate-spin text-slate-400 ml-1" />
          )}
          {weekDays.length > 0 && (
            <span
              className={`ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded border normal-case tracking-normal ${
                allDaysHaveTime
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              }`}
              data-testid="status-times-per-day"
            >
              {weekDays.length - missingDays.length}/{weekDays.length} dias preenchidos
              {missingDays.length > 0 && (
                <>
                  {" "}· falta{missingDays.length === 1 ? "" : "m"}:{" "}
                  {missingDays
                    .map((k) => WEEK_DAYS.find((w) => w.key === k)?.short)
                    .filter(Boolean)
                    .join(", ")}
                </>
              )}
            </span>
          )}
        </Label>

        {!scheduleId || weekDays.length === 0 ? (
          <p className="text-[11px] text-slate-400 italic px-1">
            Selecione a agenda e ao menos um dia para ver os horários livres.
          </p>
        ) : availabilityQueries.isLoading ? (
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <Loader2 className="w-3 h-3 animate-spin" /> Buscando horários disponíveis…
          </div>
        ) : (
          <div className="space-y-2">
            {weekDays.map((key) => {
              const dayMeta = WEEK_DAYS.find((w) => w.key === key)!;
              const slots = slotsByDay[key] ?? [];
              const chosen = startTimes[key] ?? "";
              const noLonger = !!chosen && !slots.some((s) => s.time === chosen);
              const isMissing = !chosen;
              const isPulsing = pulseDay === key;
              return (
                <div
                  key={key}
                  ref={setDayCardRef(key)}
                  data-testid={`day-card-${key}`}
                  className={`rounded-lg border p-2.5 transition-colors ${
                    isMissing
                      ? "border-amber-300 bg-amber-50/40"
                      : "border-slate-200 bg-slate-50/40"
                  } ${isPulsing ? "ring-2 ring-amber-400 ring-offset-1 animate-pulse" : ""}`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-semibold text-slate-700 flex items-center gap-1">
                      {dayMeta.long}
                      {isMissing && (
                        <span className="text-[10px] font-normal text-amber-700 bg-amber-100 border border-amber-200 px-1 py-px rounded">
                          escolha um horário
                        </span>
                      )}
                    </span>
                    {chosen && !noLonger && (
                      <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                        {chosen}
                      </span>
                    )}
                  </div>

                  {slots.length === 0 ? (
                    <div className="text-[11px] text-amber-800 flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>
                        Sem horários livres na próxima {dayMeta.long.toLowerCase()}.
                        Tente outra agenda ou outro dia.
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 max-h-[140px] overflow-y-auto p-0.5">
                      {slots.map((s) => {
                        const active = chosen === s.time;
                        return (
                          <button
                            key={s.time}
                            type="button"
                            onClick={() => setTimeForDay(key, s.time)}
                            disabled={disabled}
                            className={`h-7 px-2 rounded-md border text-[11px] font-mono font-medium transition flex items-center gap-1 ${
                              active
                                ? "bg-primary text-white border-primary shadow-sm"
                                : "bg-white text-slate-700 border-slate-200 hover:border-primary/40 hover:bg-primary/5"
                            }`}
                          >
                            <CalendarCheck className={`w-3 h-3 ${active ? "" : "text-emerald-500"}`} />
                            {s.time}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {noLonger && (
                    <p className="text-[11px] text-rose-600 flex items-center gap-1 mt-1.5">
                      <AlertTriangle className="w-3 h-3" />
                      O horário {chosen} deixou de estar livre. Escolha outro acima.
                    </p>
                  )}
                </div>
              );
            })}
            <p className="text-[10px] text-slate-400">
              Cada dia tem seu próprio horário. Considera bloqueios e consultas
              já marcadas para a próxima ocorrência de cada dia.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
