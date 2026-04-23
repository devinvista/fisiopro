import { CheckCircle, ClipboardList, Clock, History, Sparkles, Stethoscope, Users } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { PlanProcedureForAgenda } from "../../types";

interface ProcLite {
  id: number;
  name: string;
  durationMinutes: number;
  maxCapacity: number;
}

export function ProcedureSelector({
  lockProcedure,
  selectedProcedure,
  procedures,
  planProcedures,
  selectedProcedureId,
  onSelect,
  lastProcedureId,
}: {
  lockProcedure: boolean;
  selectedProcedure: ProcLite | undefined;
  procedures: ProcLite[] | undefined;
  planProcedures: PlanProcedureForAgenda[];
  selectedProcedureId: string;
  onSelect: (id: string) => void;
  lastProcedureId: number | null;
}) {
  if (lockProcedure && selectedProcedure) {
    return (
      <div className="flex items-center gap-3 px-3 py-3 rounded-xl border border-violet-200 bg-violet-50">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-violet-100 text-violet-600">
          <Users className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800">{selectedProcedure.name}</p>
          <p className="text-xs text-violet-600">
            {selectedProcedure.durationMinutes} min
            {selectedProcedure.maxCapacity > 1 ? ` · até ${selectedProcedure.maxCapacity} simultâneos` : ""}
          </p>
        </div>
        <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-violet-200 text-violet-700 shrink-0">Sessão em grupo</span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label>Procedimento *</Label>
      <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-0.5">
        {planProcedures.length > 0 && (
          <>
            <div className="flex items-center gap-1.5 px-1 pt-0.5">
              <ClipboardList className="w-3 h-3 text-teal-600" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-teal-600">Do plano de tratamento</span>
            </div>
            {planProcedures.map((item) => {
              const proc = procedures?.find((p) => p.id === item.procedureId);
              if (!proc) return null;
              const isSelected = selectedProcedureId === proc.id.toString();
              const isGroup = proc.maxCapacity > 1;
              return (
                <button
                  key={`plan-${item.id}`}
                  type="button"
                  onClick={() => onSelect(proc.id.toString())}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all",
                    isSelected
                      ? "border-teal-500 bg-teal-50 shadow-sm"
                      : "border-teal-200 bg-teal-50/50 hover:border-teal-400 hover:bg-teal-50"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                    isSelected ? "bg-teal-500 text-white" : "bg-teal-100 text-teal-600"
                  )}>
                    {isGroup ? <Users className="w-4 h-4" /> : <Stethoscope className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold text-slate-800">{proc.name}</span>
                      <span className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700">
                        <Sparkles className="w-2.5 h-2.5" /> Plano
                      </span>
                      {lastProcedureId === proc.id && (
                        <span className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                          <History className="w-2.5 h-2.5" /> Última sessão
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">
                      {proc.durationMinutes} min
                      {isGroup ? ` · até ${proc.maxCapacity} simultâneos` : ""}
                    </p>
                  </div>
                  {isSelected && <CheckCircle className="w-4 h-4 text-teal-500 shrink-0" />}
                </button>
              );
            })}
            <div className="flex items-center gap-1.5 px-1 pt-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Outros procedimentos</span>
            </div>
          </>
        )}

        {procedures
          ?.filter((p) => !planProcedures.some((pp) => pp.procedureId === p.id))
          .map((p) => {
            const isSelected = selectedProcedureId === p.id.toString();
            const isLast = lastProcedureId === p.id;
            const isGroup = p.maxCapacity > 1;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelect(p.id.toString())}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all",
                  isSelected
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                  isSelected ? "bg-primary text-white" : isGroup ? "bg-violet-100 text-violet-600" : "bg-slate-100 text-slate-500"
                )}>
                  {isGroup ? <Users className="w-4 h-4" /> : <Stethoscope className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-semibold text-slate-800">{p.name}</span>
                    {isLast && (
                      <span className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        <History className="w-2.5 h-2.5" /> Última sessão
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    {p.durationMinutes} min
                    {isGroup ? ` · até ${p.maxCapacity} simultâneos` : ""}
                  </p>
                </div>
                {isSelected && <CheckCircle className="w-4 h-4 text-primary shrink-0" />}
              </button>
            );
          })}
      </div>
      {selectedProcedure && (
        <p className="text-xs text-slate-500 flex items-center gap-1 pl-1">
          <Clock className="w-3 h-3" />
          {selectedProcedure.durationMinutes} min
          {selectedProcedure.maxCapacity > 1 && ` · até ${selectedProcedure.maxCapacity} simultâneos`}
        </p>
      )}
    </div>
  );
}
