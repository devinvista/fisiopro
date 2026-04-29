import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { apiFetchJson, apiSendJson } from "@/lib/api";
import {
  CalendarDays, Clock, User, Lock, CheckCircle2, Loader2, AlertTriangle, Sparkles,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/lib/toast";

const WEEK_DAYS = [
  { key: "monday", short: "Seg", long: "Segunda" },
  { key: "tuesday", short: "Ter", long: "Terça" },
  { key: "wednesday", short: "Qua", long: "Quarta" },
  { key: "thursday", short: "Qui", long: "Quinta" },
  { key: "friday", short: "Sex", long: "Sexta" },
  { key: "saturday", short: "Sáb", long: "Sábado" },
  { key: "sunday", short: "Dom", long: "Domingo" },
] as const;

type PlanItem = {
  id: number;
  procedureName?: string | null;
  packageName?: string | null;
  packageType?: string | null;
  sessionsPerWeek?: number | null;
  weekDays?: string | string[] | null;
  defaultStartTime?: string | null;
  defaultProfessionalId?: number | null;
  defaultProfessionalName?: string | null;
  sessionDurationMinutes?: number | null;
};

interface Props {
  planId: number;
  planItems: PlanItem[];
  planItemsKey: string[] | null;
  isMaterialized: boolean;
  isAccepted: boolean;
}

function parseWeekDays(raw: string | string[] | null | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

export function AcceptanceScheduleEditor({
  planId,
  planItems,
  planItemsKey,
  isMaterialized,
  isAccepted,
}: Props) {
  const recurringItems = useMemo(
    () => planItems.filter((i) => i.packageType === "mensal"),
    [planItems],
  );

  if (recurringItems.length === 0) return null;

  return (
    <div className="rounded-xl border border-primary/20 bg-white p-4 space-y-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-primary" />
          <h4 className="text-sm font-semibold text-slate-700">
            Dias e horários da agenda
          </h4>
          <Badge variant="outline" className="text-[10px] font-normal">
            {recurringItems.length} item{recurringItems.length === 1 ? "" : "s"} recorrente{recurringItems.length === 1 ? "" : "s"}
          </Badge>
        </div>
        {isMaterialized && (
          <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
            <Lock className="w-3 h-3" /> Plano já materializado — alterações requerem
            reverter a materialização
          </span>
        )}
      </div>

      <p className="text-[11px] text-slate-500 leading-relaxed">
        Defina aqui os dias da semana, horário e profissional de cada item recorrente
        antes de gerar a agenda do paciente. Estas configurações são usadas para criar
        as consultas quando o plano é materializado.
      </p>

      <div className="space-y-3">
        {recurringItems.map((item) => (
          <ItemRow
            key={item.id}
            planId={planId}
            item={item}
            planItemsKey={planItemsKey}
            disabled={isMaterialized}
          />
        ))}
      </div>

      {!isAccepted && (
        <p className="text-[11px] text-slate-500 flex items-start gap-1.5 border-t border-slate-100 pt-2">
          <Sparkles className="w-3 h-3 text-primary mt-0.5 shrink-0" />
          Após o aceite formal do plano, basta clicar em <strong>Materializar plano</strong>
          para gerar todas as consultas com base nestes horários.
        </p>
      )}
    </div>
  );
}

function ItemRow({
  planId, item, planItemsKey, disabled,
}: {
  planId: number;
  item: PlanItem;
  planItemsKey: string[] | null;
  disabled: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const initialWeekDays = parseWeekDays(item.weekDays);
  const [weekDays, setWeekDays] = useState<string[]>(initialWeekDays);
  const [startTime, setStartTime] = useState<string>(item.defaultStartTime ?? "");
  const [duration, setDuration] = useState<string>(
    item.sessionDurationMinutes ? String(item.sessionDurationMinutes) : "60",
  );
  const [professionalId, setProfessionalId] = useState<string>(
    item.defaultProfessionalId != null ? String(item.defaultProfessionalId) : "",
  );

  const [savedSnap, setSavedSnap] = useState({
    weekDays: initialWeekDays.join(","),
    startTime: item.defaultStartTime ?? "",
    duration: item.sessionDurationMinutes ? String(item.sessionDurationMinutes) : "60",
    professionalId: item.defaultProfessionalId != null ? String(item.defaultProfessionalId) : "",
  });

  useEffect(() => {
    const wd = parseWeekDays(item.weekDays);
    setWeekDays(wd);
    setStartTime(item.defaultStartTime ?? "");
    setDuration(item.sessionDurationMinutes ? String(item.sessionDurationMinutes) : "60");
    setProfessionalId(item.defaultProfessionalId != null ? String(item.defaultProfessionalId) : "");
    setSavedSnap({
      weekDays: wd.join(","),
      startTime: item.defaultStartTime ?? "",
      duration: item.sessionDurationMinutes ? String(item.sessionDurationMinutes) : "60",
      professionalId: item.defaultProfessionalId != null ? String(item.defaultProfessionalId) : "",
    });
  }, [item.id, item.weekDays, item.defaultStartTime, item.sessionDurationMinutes, item.defaultProfessionalId]);

  const { data: professionals = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/users/professionals"],
    queryFn: () => apiFetchJson<{ id: number; name: string }[]>("/api/users/professionals"),
  });

  const dirty =
    weekDays.join(",") !== savedSnap.weekDays ||
    startTime !== savedSnap.startTime ||
    duration !== savedSnap.duration ||
    professionalId !== savedSnap.professionalId;

  const mutation = useMutation({
    mutationFn: (body: object) =>
      apiSendJson<any>(`/api/treatment-plans/${planId}/procedures/${item.id}`, "PUT", body),
    onSuccess: () => {
      setSavedSnap({
        weekDays: weekDays.join(","),
        startTime,
        duration,
        professionalId,
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

  function toggleDay(key: string) {
    if (disabled) return;
    setWeekDays((prev) =>
      prev.includes(key) ? prev.filter((d) => d !== key) : [...prev, key],
    );
  }

  function handleSave() {
    if (disabled || !dirty) return;
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
        title: "Defina o horário",
        description: "O horário de início é obrigatório para gerar a agenda.",
        variant: "destructive",
      });
      return;
    }
    mutation.mutate({
      weekDays: JSON.stringify(weekDays),
      defaultStartTime: startTime,
      sessionDurationMinutes: Number(duration) || 60,
      defaultProfessionalId: professionalId ? Number(professionalId) : null,
    });
  }

  const slotsPerWeek = weekDays.length;
  const isValid = weekDays.length > 0 && !!startTime;

  return (
    <div
      className={`rounded-lg border ${
        dirty ? "border-amber-300 bg-amber-50/30" : "border-slate-200 bg-white"
      } p-3 space-y-3 transition-colors`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <p className="text-sm font-semibold text-slate-700">
            {item.packageName ?? item.procedureName ?? "Item recorrente"}
          </p>
          {slotsPerWeek > 0 && (
            <span className="text-[11px] text-slate-500">
              {slotsPerWeek}x/semana · ~{slotsPerWeek * 4} sessões/mês
            </span>
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
            className="h-7 gap-1 rounded-md text-xs"
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

      <div className="space-y-1.5">
        <Label className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide">
          Dias da semana
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {WEEK_DAYS.map((d) => {
            const active = weekDays.includes(d.key);
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => toggleDay(d.key)}
                disabled={disabled}
                title={d.long}
                className={`h-9 px-3 rounded-md border text-xs font-medium transition flex items-center justify-center min-w-[44px] ${
                  active
                    ? "bg-primary text-white border-primary shadow-sm"
                    : "bg-white text-slate-600 border-slate-200 hover:border-primary/40 hover:text-primary"
                } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                {d.short}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide flex items-center gap-1">
            <Clock className="w-3 h-3" /> Horário
          </Label>
          <Input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            disabled={disabled}
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide">
            Duração (min)
          </Label>
          <Select
            value={duration}
            onValueChange={setDuration}
            disabled={disabled}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[30, 45, 60, 75, 90, 120].map((m) => (
                <SelectItem key={m} value={String(m)}>{m} min</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide flex items-center gap-1">
            <User className="w-3 h-3" /> Profissional
          </Label>
          <Select
            value={professionalId || "_none"}
            onValueChange={(v) => setProfessionalId(v === "_none" ? "" : v)}
            disabled={disabled}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Selecionar..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Sem profissional fixo</SelectItem>
              {professionals.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
