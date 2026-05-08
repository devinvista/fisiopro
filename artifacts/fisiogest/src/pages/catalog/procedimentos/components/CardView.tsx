import { formatCurrency, getMargin } from "../constants";
import { Procedure } from "../types";
import { CategoryBadge } from "./CategoryBadge";
import { MarginBadge } from "./MarginBadge";
import { Clock, Globe, Power, PowerOff, DollarSign, Pencil, Trash2, Users, User } from "lucide-react";
import { cn } from "@/lib/utils";

export function CardView({
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
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {procedures.map((proc) => {
        const effectivePrice = proc.effectivePrice ?? proc.price;
        const effectiveCost = proc.effectiveTotalCost ?? proc.cost ?? 0;
        const margin = getMargin(effectivePrice, effectiveCost);
        const accentColor =
          margin >= 60 ? "bg-emerald-500" : margin >= 35 ? "bg-amber-400" : "bg-rose-400";
        const hasClinicOverride = !!proc.clinicCost?.priceOverride;
        const hasClinicCosts = !!proc.clinicCost;

        return (
          <div
            key={proc.id}
            className={cn(
              "bg-white rounded-2xl border overflow-hidden transition-shadow hover:shadow-md group flex flex-col",
              proc.isActive ? "border-slate-200" : "border-slate-200 opacity-55 grayscale-[30%]"
            )}
          >
            {/* Accent bar */}
            <div className={cn("h-0.5 w-full", accentColor)} />

            <div className="p-4 flex flex-col gap-3 flex-1">
              {/* Title row */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h3 className="font-semibold text-slate-800 leading-snug text-sm">{proc.name}</h3>
                    {!proc.isActive && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                        <PowerOff className="w-2.5 h-2.5" /> Inativo
                      </span>
                    )}
                    {proc.isGlobal && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">
                        <Globe className="w-2.5 h-2.5" /> Global
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <CategoryBadge category={proc.category} />
                    {proc.modalidade === "grupo" && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700">
                        <Users className="w-2.5 h-2.5" /> Grupo · {proc.maxCapacity} vagas
                      </span>
                    )}
                    {proc.modalidade === "dupla" && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-700">
                        <Users className="w-2.5 h-2.5" /> Dupla
                      </span>
                    )}
                    {proc.modalidade === "individual" && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-50 text-slate-500">
                        <User className="w-2.5 h-2.5" /> Individual
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
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

              {proc.description && (
                <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{proc.description}</p>
              )}

              {/* Metrics */}
              <div className="mt-auto pt-2.5 border-t border-slate-100 grid grid-cols-3 gap-2">
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide leading-none mb-1">
                    {hasClinicOverride ? "Preço clínica" : "Preço / sessão"}
                  </p>
                  <div className="flex items-baseline gap-1 flex-wrap">
                    <p className={cn("text-sm font-bold", hasClinicOverride ? "text-emerald-700" : "text-slate-800")}>
                      {formatCurrency(effectivePrice)}
                    </p>
                    {hasClinicOverride && (
                      <span className="text-[9px] text-slate-400 line-through">{formatCurrency(proc.price)}</span>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide leading-none mb-1">Custo / sessão</p>
                  <p className={cn("text-sm font-semibold", hasClinicCosts ? "text-emerald-700" : "text-slate-500")}>
                    {formatCurrency(effectiveCost)}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide leading-none mb-1">Duração</p>
                  <p className="text-xs text-slate-600 flex items-center gap-0.5">
                    <Clock className="w-3 h-3 shrink-0" />{proc.durationMinutes} min
                  </p>
                </div>
              </div>

              {/* Margem */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">Margem</span>
                <MarginBadge margin={margin} />
              </div>

              {/* Clinic costs banner */}
              {hasClinicCosts && (
                <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-100 px-2.5 py-1.5 text-[10px] text-emerald-700 font-semibold">
                  <DollarSign className="w-3 h-3 shrink-0" />
                  Custos da clínica configurados
                  {proc.clinicCost?.notes && (
                    <span className="font-normal opacity-70 truncate ml-1">· {proc.clinicCost.notes}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
