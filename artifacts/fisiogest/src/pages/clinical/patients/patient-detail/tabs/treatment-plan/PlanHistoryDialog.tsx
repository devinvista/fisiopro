import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, BadgeCheck, History } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { formatDate, formatDateTime } from "../../utils/format";

type PlanHistoryFilter = "todos" | "ativo" | "concluido" | "cancelado";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plans: any[];
  selectedPlanId: number | null;
  onSelect: (id: number) => void;
}

export function PlanHistoryDialog({
  open, onOpenChange, plans, selectedPlanId, onSelect,
}: Props) {
  const [filter, setFilter] = useState<PlanHistoryFilter>("todos");

  useEffect(() => {
    if (open) setFilter("todos");
  }, [open]);

  const counts = useMemo(() => {
    const c = { todos: plans.length, ativo: 0, concluido: 0, cancelado: 0 };
    for (const p of plans) {
      const s = (p.status as string) ?? "ativo";
      if (s === "ativo") c.ativo += 1;
      else if (s === "concluido") c.concluido += 1;
      else if (s === "cancelado") c.cancelado += 1;
    }
    return c;
  }, [plans]);

  const sorted = useMemo(() => {
    const filtered = filter === "todos"
      ? plans
      : plans.filter((p) => (p.status ?? "ativo") === filter);
    return [...filtered].sort((a, b) => {
      const da = a.startDate ? new Date(a.startDate).getTime() : 0;
      const db = b.startDate ? new Date(b.startDate).getTime() : 0;
      if (db !== da) return db - da;
      return (b.id ?? 0) - (a.id ?? 0);
    });
  }, [plans, filter]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" /> Histórico de planos
          </DialogTitle>
          <DialogDescription>
            Linha do tempo cronológica de todos os planos do paciente.
            Clique em um cartão para abri-lo na aba.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5 pb-1 pt-1 border-b border-slate-100">
          {(
            [
              { key: "todos", label: "Todos", count: counts.todos },
              { key: "ativo", label: "Ativos", count: counts.ativo },
              { key: "concluido", label: "Concluídos", count: counts.concluido },
              { key: "cancelado", label: "Cancelados", count: counts.cancelado },
            ] as { key: PlanHistoryFilter; label: string; count: number }[]
          ).map((opt) => {
            const active = filter === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setFilter(opt.key)}
                disabled={opt.count === 0 && opt.key !== "todos"}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                }`}
              >
                {opt.label}
                <span className={`ml-1.5 text-[10px] font-semibold ${
                  active ? "text-primary-foreground/80" : "text-slate-400"
                }`}>
                  {opt.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto -mx-6 px-6 py-2 space-y-2">
          {sorted.length === 0 ? (
            <div className="text-center py-10 text-sm text-slate-400">
              Nenhum plano com este filtro.
            </div>
          ) : (
            sorted.map((p) => (
              <PlanHistoryCard
                key={p.id}
                plan={p}
                isSelected={p.id === selectedPlanId}
                onClick={() => onSelect(p.id)}
              />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PlanHistoryCard({
  plan, isSelected, onClick,
}: {
  plan: any;
  isSelected: boolean;
  onClick: () => void;
}) {
  const status = (plan.status as string) ?? "ativo";
  const accepted = !!plan.acceptedAt;

  const statusStyle =
    status === "ativo"
      ? { border: "border-emerald-200", badge: "bg-emerald-100 text-emerald-700", label: "Ativo" }
      : status === "concluido"
      ? { border: "border-blue-200", badge: "bg-blue-100 text-blue-700", label: "Concluído" }
      : status === "cancelado"
      ? { border: "border-slate-200", badge: "bg-slate-100 text-slate-600", label: "Cancelado" }
      : { border: "border-slate-200", badge: "bg-slate-100 text-slate-600", label: status };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-xl border bg-white p-3.5 transition-all hover:shadow-sm hover:border-primary/30 ${
        isSelected
          ? "ring-2 ring-primary/40 border-primary/50 shadow-sm"
          : statusStyle.border
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusStyle.badge}`}>
              {statusStyle.label}
            </span>
            {accepted && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                <BadgeCheck className="w-3 h-3" /> Assinado
              </span>
            )}
            {isSelected && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                Selecionado
              </span>
            )}
          </div>

          <div className="text-sm font-semibold text-slate-800 truncate">
            Plano iniciado em {formatDate(plan.startDate) || "—"}
          </div>

          <div className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-0.5">
            {plan.endDate && (
              <span>
                <span className="text-slate-400">Término previsto:</span>{" "}
                {formatDate(plan.endDate)}
              </span>
            )}
            {plan.durationMonths != null && (
              <span>
                <span className="text-slate-400">Prazo:</span>{" "}
                {plan.durationMonths} {plan.durationMonths === 1 ? "mês" : "meses"}
              </span>
            )}
            {plan.responsibleProfessional && (
              <span className="truncate max-w-[200px]">
                <span className="text-slate-400">Profissional:</span>{" "}
                {plan.responsibleProfessional}
              </span>
            )}
          </div>

          {accepted && plan.acceptedAt && (
            <div className="text-[11px] text-emerald-700 pt-0.5">
              Assinado em {formatDateTime(plan.acceptedAt)}
              {plan.acceptedVia && (
                <span className="text-emerald-600/80"> ({plan.acceptedVia})</span>
              )}
            </div>
          )}
        </div>

        <ArrowUpRight className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
      </div>
    </button>
  );
}
