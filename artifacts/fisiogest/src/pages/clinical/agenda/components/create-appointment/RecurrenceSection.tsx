import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Repeat } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { DAYS_OF_WEEK } from "../../constants";

export function RecurrenceSection({
  isRecurring,
  setIsRecurring,
  recurDays,
  toggleRecurDay,
  recurSessions,
  setRecurSessions,
  date,
  startTime,
}: {
  isRecurring: boolean;
  setIsRecurring: (v: boolean | ((prev: boolean) => boolean)) => void;
  recurDays: number[];
  toggleRecurDay: (dow: number) => void;
  recurSessions: number;
  setRecurSessions: (n: number) => void;
  date: string;
  startTime: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer select-none"
        onClick={() => setIsRecurring((v) => !v)}
        onKeyDown={(e) => e.key === "Enter" || e.key === " " ? setIsRecurring((v) => !v) : undefined}
      >
        <div className="flex items-center gap-2">
          <Repeat className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-slate-700">Agendamento recorrente</span>
        </div>
        <div className={cn(
          "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors pointer-events-none",
          isRecurring ? "bg-primary" : "bg-input"
        )}>
          <span className={cn(
            "block h-4 w-4 rounded-full bg-background shadow-lg transition-transform",
            isRecurring ? "translate-x-4" : "translate-x-0"
          )} />
        </div>
      </div>

      {isRecurring && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-slate-100 bg-slate-50/60">
          <p className="text-xs text-slate-500">
            Cria automaticamente todas as sessões com o mesmo horário nos dias selecionados, a partir da data escolhida.
          </p>

          <div className="space-y-1.5">
            <Label className="text-xs">Dias da semana *</Label>
            <div className="flex gap-1.5 flex-wrap">
              {DAYS_OF_WEEK.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleRecurDay(d.value)}
                  className={cn(
                    "w-10 h-9 rounded-lg text-xs font-semibold transition-all border",
                    recurDays.includes(d.value)
                      ? "bg-primary text-white border-primary shadow-sm"
                      : "bg-white text-slate-600 border-slate-200 hover:border-primary"
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Total de sessões *</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={100}
                value={recurSessions}
                onChange={(e) => setRecurSessions(Number(e.target.value))}
                className="h-9 w-24 rounded-xl text-sm"
              />
              <span className="text-xs text-slate-500">sessões · a partir de {date ? format(new Date(date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR }) : "—"}</span>
            </div>
          </div>

          {recurDays.length > 0 && recurSessions > 0 && (
            <div className="flex items-center gap-1.5 bg-primary/5 rounded-xl px-3 py-2">
              <Repeat className="w-3 h-3 text-primary shrink-0" />
              <p className="text-xs text-primary font-medium">
                {recurSessions} sessão(ões) toda(s){" "}
                {recurDays.map((d) => DAYS_OF_WEEK.find((x) => x.value === d)?.label).join(", ")}{" "}
                às {startTime || "—"}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
