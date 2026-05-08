import { formatCurrency, getMargin } from "../constants";
import { Procedure } from "../types";
import { CategoryBadge } from "./CategoryBadge";
import { MarginBadge } from "./MarginBadge";
import {
  Clock, Globe, Power, PowerOff, DollarSign, Pencil, Trash2, Users, Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function ListView({
  procedures,
  onEdit,
  onDelete,
  isAdmin,
  hasCostFeature,
  onToggleActive,
  onConfigCosts,
}: {
  procedures: Procedure[];
  onEdit: (p: Procedure) => void;
  onDelete: (p: Procedure) => void;
  isAdmin?: boolean;
  hasCostFeature?: boolean;
  onToggleActive?: (p: Procedure) => void;
  onConfigCosts?: (p: Procedure) => void;
}) {
  const showCostCol = hasCostFeature;

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
      {/* Header */}
      <div className={cn(
        "hidden md:grid items-center px-4 py-2.5 border-b border-border bg-muted/40",
        "text-[10px] font-bold uppercase tracking-wider text-muted-foreground",
        showCostCol
          ? "grid-cols-[1fr_100px_96px_80px_64px_92px]"
          : "grid-cols-[1fr_100px_96px_64px_88px]"
      )}>
        <span>Procedimento</span>
        <span>Categoria</span>
        <span className="text-right">Preço</span>
        {showCostCol && <span className="text-right">Custo</span>}
        {showCostCol && <span className="text-right">Margem</span>}
        <span className="text-right">Duração</span>
        <span />
      </div>

      {procedures.map((proc, idx) => {
        const effectivePrice = proc.effectivePrice ?? proc.price;
        const effectiveCost  = proc.effectiveTotalCost ?? proc.cost ?? 0;
        const margin         = getMargin(effectivePrice, effectiveCost);
        const hasClinicOverride = !!proc.clinicCost?.priceOverride;
        const hasClinicCosts    = !!proc.clinicCost;

        return (
          <div
            key={proc.id}
            className={cn(
              "grid items-center px-4 py-3 transition-colors group",
              "grid-cols-[1fr_88px] md:grid-cols-[1fr_100px_96px_64px_88px]",
              showCostCol && "md:grid-cols-[1fr_100px_96px_80px_64px_92px]",
              idx !== procedures.length - 1 && "border-b border-border",
              "hover:bg-muted/30",
              !proc.isActive && "opacity-55"
            )}
          >
            {/* Name */}
            <div className="min-w-0 pr-3 space-y-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-medium text-sm text-foreground truncate">{proc.name}</span>
                {!proc.isActive && (
                  <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                    <PowerOff className="w-2.5 h-2.5" /> Inativo
                  </span>
                )}
                {proc.isGlobal && (
                  <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">
                    <Globe className="w-2.5 h-2.5" /> Global
                  </span>
                )}
                {hasCostFeature && hasClinicCosts && (
                  <span className="shrink-0 hidden sm:inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                    <DollarSign className="w-2.5 h-2.5" /> Config.
                  </span>
                )}
              </div>
              {/* Mobile sub-info */}
              <div className="flex items-center gap-2 md:hidden flex-wrap">
                <CategoryBadge category={proc.category} size="xs" />
                {proc.modalidade !== "individual" && (
                  <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <Users className="w-2.5 h-2.5" />
                    {proc.modalidade === "grupo" ? `Grupo·${proc.maxCapacity}` : "Dupla"}
                  </span>
                )}
                <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                  <Clock className="w-2.5 h-2.5" />{proc.durationMinutes}min
                </span>
              </div>
            </div>

            {/* Categoria — md+ */}
            <div className="hidden md:block">
              <CategoryBadge category={proc.category} size="xs" />
              {proc.modalidade !== "individual" && (
                <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-0.5">
                  <Users className="w-2.5 h-2.5" />
                  {proc.modalidade === "grupo" ? `Grupo · ${proc.maxCapacity}` : "Dupla"}
                </p>
              )}
            </div>

            {/* Preço */}
            <div className="text-right">
              <p className={cn("text-sm font-bold tabular-nums", hasClinicOverride ? "text-primary" : "text-foreground")}>
                {formatCurrency(effectivePrice)}
              </p>
              {hasClinicOverride && (
                <p className="text-[10px] text-muted-foreground line-through tabular-nums">
                  {formatCurrency(proc.price)}
                </p>
              )}
            </div>

            {/* Custo — feature gated */}
            {showCostCol && (
              <div className="hidden md:block text-right">
                <p className={cn("text-xs tabular-nums", hasClinicCosts ? "text-emerald-700 font-semibold" : "text-muted-foreground")}>
                  {formatCurrency(effectiveCost)}
                </p>
              </div>
            )}

            {/* Margem — feature gated */}
            {showCostCol && (
              <div className="hidden md:flex justify-end">
                <MarginBadge margin={margin} />
              </div>
            )}

            {/* Duração — md+ */}
            <div className="hidden md:block text-right">
              <p className="text-xs text-muted-foreground flex items-center justify-end gap-1 tabular-nums">
                <Clock className="w-3 h-3 shrink-0" />{proc.durationMinutes}m
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
                      ? "text-muted-foreground/40 hover:bg-amber-50 hover:text-amber-600"
                      : "text-muted-foreground/40 hover:bg-emerald-50 hover:text-emerald-600"
                  )}
                >
                  {proc.isActive ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                </button>
              )}
              {isAdmin && hasCostFeature && onConfigCosts && (
                <button
                  onClick={() => onConfigCosts(proc)}
                  title="Custos da clínica"
                  className={cn(
                    "p-1.5 rounded-lg transition-colors",
                    hasClinicCosts
                      ? "text-emerald-600 hover:bg-emerald-50"
                      : "text-muted-foreground/40 hover:bg-muted hover:text-muted-foreground"
                  )}
                >
                  <DollarSign className="w-3.5 h-3.5" />
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => onEdit(proc)}
                  className="p-1.5 rounded-lg text-muted-foreground/40 hover:bg-muted hover:text-foreground transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => onDelete(proc)}
                className="p-1.5 rounded-lg text-muted-foreground/40 hover:bg-destructive/10 hover:text-destructive transition-colors"
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
