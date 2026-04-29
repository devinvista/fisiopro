import { useEffect, useMemo, useState } from "react";
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
  isAccepted: boolean;
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

export function AcceptanceScheduleEditor({
  planId,
  planItems,
  planItemsKey,
  isMaterialized,
  isAccepted,
}: Props) {
  const allItems = useMemo(() => planItems ?? [], [planItems]);

  const { data: allSchedules = [], isLoading: schedulesLoading } = useQuery<Schedule[]>({
    queryKey: ["/api/schedules"],
    queryFn: () => apiFetchJson<Schedule[]>("/api/schedules"),
    enabled: isAccepted,
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

  const initialWeekDays = parseWeekDays(item.weekDays);
  const [scheduleId, setScheduleId] = useState<number | null>(item.scheduleId ?? null);
  const [weekDays, setWeekDays] = useState<WeekDayKey[]>(initialWeekDays);
  const [startTime, setStartTime] = useState<string>(item.defaultStartTime ?? "");

  const [savedSnap, setSavedSnap] = useState({
    scheduleId: item.scheduleId ?? null,
    weekDays: initialWeekDays.join(","),
    startTime: item.defaultStartTime ?? "",
  });

  useEffect(() => {
    const wd = parseWeekDays(item.weekDays);
    setScheduleId(item.scheduleId ?? null);
    setWeekDays(wd);
    setStartTime(item.defaultStartTime ?? "");
    setSavedSnap({
      scheduleId: item.scheduleId ?? null,
      weekDays: wd.join(","),
      startTime: item.defaultStartTime ?? "",
    });
  }, [item.id, item.weekDays, item.defaultStartTime, item.scheduleId]);

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

  // Para cada dia escolhido, busca a próxima ocorrência real e seus slots
  const probeDates = useMemo(() => {
    return weekDays
      .map((k) => WEEK_DAYS.find((w) => w.key === k)!.dow)
      .map((dow) => ({ dow, date: nextDateForDow(dow) }));
  }, [weekDays]);

  // Busca os slots disponíveis em cada data (1 query por data)
  const availabilityQueries = useQuery({
    queryKey: [
      "available-slots-batch",
      scheduleId,
      procedureId,
      probeDates.map((p) => p.date).join(","),
    ],
    queryFn: async () => {
      if (!scheduleId || !procedureId || probeDates.length === 0) return [];
      const results = await Promise.all(
        probeDates.map(async (p) => {
          const data = await apiFetchJson<any>(
            `/api/appointments/available-slots?date=${p.date}&procedureId=${procedureId}&scheduleId=${scheduleId}`,
          );
          return { date: p.date, dow: p.dow, ...data };
        }),
      );
      return results;
    },
    enabled: !!scheduleId && !!procedureId && probeDates.length > 0,
  });

  // Intersecção: horários disponíveis em TODOS os dias selecionados
  const intersectedSlots = useMemo(() => {
    const data = availabilityQueries.data;
    if (!data || data.length === 0) return [];
    let common: { time: string; spotsLeft: number }[] | null = null;
    for (const day of data) {
      const slots: { time: string; available: boolean; spotsLeft: number }[] = day.slots ?? [];
      const availableTimes = slots.filter((s) => s.available);
      if (common === null) {
        common = availableTimes.map((s) => ({ time: s.time, spotsLeft: s.spotsLeft }));
      } else {
        const set = new Set(availableTimes.map((s) => s.time));
        common = common.filter((c) => set.has(c.time));
      }
    }
    return (common ?? []).sort((a, b) => a.time.localeCompare(b.time));
  }, [availabilityQueries.data]);

  // Se o startTime atual deixou de estar livre, marca para o usuário ver
  const startTimeNoLongerAvailable = useMemo(() => {
    if (!startTime || !availabilityQueries.data || availabilityQueries.data.length === 0) return false;
    return !intersectedSlots.some((s) => s.time === startTime);
  }, [startTime, intersectedSlots, availabilityQueries.data]);

  const dirty =
    (scheduleId ?? null) !== savedSnap.scheduleId ||
    weekDays.join(",") !== savedSnap.weekDays ||
    startTime !== savedSnap.startTime;

  const isValid = !!scheduleId && weekDays.length > 0 && !!startTime;
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
        startTime,
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

  function toggleDay(key: WeekDayKey) {
    if (disabled) return;
    setWeekDays((prev) =>
      prev.includes(key) ? prev.filter((d) => d !== key) : [...prev, key],
    );
    setStartTime(""); // muda o conjunto de slots disponíveis
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
    if (!startTime) {
      toast({
        title: "Escolha um horário",
        description: "O horário é obrigatório para gerar a agenda.",
        variant: "destructive",
      });
      return;
    }
    mutation.mutate({
      scheduleId,
      weekDays: JSON.stringify(weekDays),
      defaultStartTime: startTime,
      defaultProfessionalId: selectedSchedule?.professionalId ?? null,
    });
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
            setStartTime(""); // muda totalmente o conjunto de slots
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
        <Label className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide flex items-center">
          {stepBadge(2, !!scheduleId && weekDays.length === 0, weekDays.length > 0)}
          {kind === "avulso" ? "Dia da semana" : "Dias da semana"}
          {!scheduleId && (
            <span className="ml-2 text-[10px] text-slate-400 normal-case font-normal">
              (escolha a agenda primeiro)
            </span>
          )}
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {WEEK_DAYS.map((d) => {
            const allowed = allowedDows.includes(d.dow);
            const active = weekDays.includes(d.key);
            const isDisabled = disabled || !scheduleId || !allowed;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => allowed && toggleDay(d.key)}
                disabled={isDisabled}
                title={allowed ? d.long : `${d.long} — agenda não funciona neste dia`}
                className={`h-9 px-3 rounded-md border text-xs font-medium transition flex items-center justify-center min-w-[44px] ${
                  active
                    ? "bg-primary text-white border-primary shadow-sm"
                    : allowed
                    ? "bg-white text-slate-600 border-slate-200 hover:border-primary/40 hover:text-primary"
                    : "bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed"
                } ${isDisabled && !active ? "opacity-60" : ""}`}
              >
                {d.short}
              </button>
            );
          })}
        </div>
      </div>

      {/* Etapa 3 — Horário (sugestões reais) */}
      <div className="space-y-1.5">
        <Label className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide flex items-center">
          {stepBadge(3, weekDays.length > 0 && !startTime, !!startTime && !startTimeNoLongerAvailable)}
          <Clock className="w-3 h-3 mr-1" /> Horário sugerido
          {availabilityQueries.isFetching && (
            <Loader2 className="w-3 h-3 animate-spin text-slate-400 ml-1" />
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
        ) : intersectedSlots.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-[11px] text-amber-800 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              Não encontramos horários livres em comum nos dias escolhidos.
              Tente reduzir os dias ou escolher outra agenda.
            </span>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5 max-h-[220px] overflow-y-auto p-0.5">
              {intersectedSlots.map((s) => {
                const active = startTime === s.time;
                return (
                  <button
                    key={s.time}
                    type="button"
                    onClick={() => setStartTime(s.time)}
                    disabled={disabled}
                    className={`h-8 px-2.5 rounded-md border text-xs font-mono font-medium transition flex items-center gap-1 ${
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
            <p className="text-[10px] text-slate-400">
              {intersectedSlots.length} horário(s) livre(s) em comum nos dias selecionados.
              Considera bloqueios e consultas já marcadas para a próxima ocorrência de cada dia.
            </p>
          </>
        )}

        {startTimeNoLongerAvailable && startTime && (
          <p className="text-[11px] text-rose-600 flex items-center gap-1 mt-1">
            <AlertTriangle className="w-3 h-3" />
            O horário {startTime} deixou de estar livre. Escolha outro acima.
          </p>
        )}
      </div>
    </div>
  );
}
