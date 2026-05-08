import { formatCurrency, getMargin } from "../constants";
import { Procedure } from "../types";
import { CategoryBadge } from "./CategoryBadge";
import { MarginBadge } from "./MarginBadge";
import { Clock, Globe, Power, PowerOff, DollarSign, Pencil, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export function ListView({
  procedures,
  onEdit,
  onDelete,
  isAdmin,
  onToggleActive,
  onConfigCosts,
}: {
  procedures: Procedure[];
  onEdit: (p: Procedure) => void;
  onDelete: (p: Procedure) => void;
  isAdmin?: boolean;
  onToggleActive?: (p: Procedure) => void;
  onConfigCosts?: (p: Procedure) => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className={cn(
        "hidden lg:grid items-center px-4 py-2.5 border-b border-slate-100 bg-slate-50/80",
        "text-[10px] font-bold uppercase tracking-wider text-slate-400",
        "grid-cols-[1fr_110px_100px_90px_70px_80px_100px]"
      )}>
        <span>Procedimento</span>
        <span>Categoria</span>
        <span className="text-right">Preço</span>
        <span className="text-right">Custo</span>
        <span className="text-right">Margem</span>
        <span className="text-right">Duração</span>
        <span />
      </div>

      {/* Mobile header */}
      <div className={cn(
        "grid lg:hidden items-center px-4 py-2.5 border-b border-slate-100 bg-slate-50/80",
        "text-[10px] font-bold uppercase tracking-wider text-slate-400",
        "grid-cols-[1fr_90px_88px]"
      )}>
        <span>Procedimento</span>
        <span className="text-right">Preço</span>
        <span />
      </div>

      {procedures.map((proc, idx) => {
        const effectivePrice = proc.effectivePrice ?? proc.price;
        const effectiveCost = proc.effectiveTotalCost ?? proc.cost ?? 0;
        const margin = getMargin(effectivePrice, effectiveCost);
        const hasClinicOverride = !!proc.clinicCost?.priceOverride;
        const hasClinicCosts = !!proc.clinicCost;

        return (
          <div
            key={proc.id}
            className={cn(
              "grid items-center px-4 py-3 transition-colors group",
              "grid-cols-[1fr_90px_88px] lg:grid-cols-[1fr_110px_100px_90px_70px_80px_100px]",
              idx !== procedures.length - 1 && "border-b border-slate-100",
              "hover:bg-slate-50/60",
              !proc.isActive && "opacity-55"
            )}
          >
            {/* Name + badges */}
            <div className="min-w-0 pr-3 space-y-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-medium text-sm text-slate-800 truncate">{proc.name}</span>
                {!proc.isActive && (
                  <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                    <PowerOff className="w-2.5 h-2.5" /> Inativo
                  </span>
                )}
                {proc.isGlobal && (
                  <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">
                    <Globe className="w-2.5 h-2.5" /> Global
                  </span>
                )}
                {hasClinicCosts && (
                  <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                    <DollarSign className="w-2.5 h-2.5" /> Custo config.
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-400 lg:hidden flex-wrap">
                <CategoryBadge category={proc.category} />
                {proc.modalidade !== "individual" && (
                  <span className="flex items-center gap-0.5">
                    <Users className="w-2.5 h-2.5" />
                    {proc.modalidade === "grupo" ? `Grupo · ${proc.maxCapacity}` : "Dupla"}
                  </span>
                )}
                <span className="flex items-center gap-0.5">
                  <Clock className="w-2.5 h-2.5" />{proc.durationMinutes}min
                </span>
              </div>
            </div>

            {/* Categoria — lg+ */}
            <div className="hidden lg:block">
              <CategoryBadge category={proc.category} />
              {proc.modalidade !== "individual" && (
                <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-0.5">
                  <Users className="w-2.5 h-2.5" />
                  {proc.modalidade === "grupo" ? `Grupo · ${proc.maxCapacity} vagas` : "Dupla"}
                </p>
              )}
            </div>

            {/* Preço */}
            <div className="text-right">
              <p className={cn("text-sm font-bold tabular-nums", hasClinicOverride ? "text-emerald-700" : "text-slate-800")}>
                {formatCurrency(effectivePrice)}
              </p>
              {hasClinicOverride && (
                <p className="text-[10px] text-slate-400 line-through tabular-nums">{formatCurrency(proc.price)}</p>
              )}
            </div>

            {/* Custo — lg+ */}
            <div className="hidden lg:block text-right">
              <p className={cn("text-xs tabular-nums", hasClinicCosts ? "text-emerald-700 font-semibold" : "text-slate-500")}>
                {formatCurrency(effectiveCost)}
              </p>
            </div>

            {/* Margem — lg+ */}
            <div className="hidden lg:flex justify-end">
              <MarginBadge margin={margin} />
            </div>

            {/* Duração — lg+ */}
            <div className="hidden lg:block text-right">
              <p className="text-xs text-slate-500 flex items-center justify-end gap-1 tabular-nums">
                <Clock className="w-3 h-3 shrink-0" />{proc.durationMinutes} min
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-0.5">
              {isAdmin && onToggleActive && (
                <button
                  onClick={() => onToggleActive(proc)}
                  title={proc.isActive ? "Desativar" : "Ativar"}
                  className={cn(
                    "p-1.5 rounded-lg transition-colors",
                    proc.isActive
                      ? "hover:bg-amber-50 text-slate-300 hover:text-amber-500"
                      : "hover:bg-emerald-50 text-slate-300 hover:text-emerald-500"
                  )}
                >
                  {proc.isActive ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                </button>
              )}
              {isAdmin && onConfigCosts && (
                <button
                  onClick={() => onConfigCosts(proc)}
                  title="Custos da clínica"
                  className={cn(
                    "p-1.5 rounded-lg transition-colors",
                    hasClinicCosts
                      ? "text-emerald-500 hover:bg-emerald-50 hover:text-emerald-600"
                      : "text-slate-300 hover:bg-slate-100 hover:text-slate-600"
                  )}
                >
                  <DollarSign className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => onEdit(proc)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-300 hover:text-slate-700 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onDelete(proc)}
                className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
