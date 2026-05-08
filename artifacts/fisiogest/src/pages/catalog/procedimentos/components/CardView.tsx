import { formatCurrency, getMargin } from "../constants";
import { Procedure } from "../types";
import { CategoryBadge } from "./CategoryBadge";
import { MarginBadge } from "./MarginBadge";
import {
  Clock, Globe, Power, PowerOff, DollarSign, Pencil, Trash2,
  Users, User, Lock, Wifi, WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MODALIDADE_CONFIG = {
  individual: { label: "Individual", icon: <User className="w-2.5 h-2.5" />, cls: "bg-sky-50 text-sky-700" },
  dupla:      { label: "Dupla",      icon: <Users className="w-2.5 h-2.5" />, cls: "bg-indigo-50 text-indigo-700" },
  grupo:      { label: "Grupo",      icon: <Users className="w-2.5 h-2.5" />, cls: "bg-violet-50 text-violet-700" },
};

export function CardView({
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
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {procedures.map((proc) => {
        const effectivePrice = proc.effectivePrice ?? proc.price;
        const effectiveCost  = proc.effectiveTotalCost ?? proc.cost ?? 0;
        const margin         = getMargin(effectivePrice, effectiveCost);
        const hasClinicOverride = !!proc.clinicCost?.priceOverride;
        const hasClinicCosts    = !!proc.clinicCost;
        const mod = MODALIDADE_CONFIG[proc.modalidade] ?? MODALIDADE_CONFIG.individual;

        const accentBar =
          margin >= 60 ? "bg-emerald-400" :
          margin >= 35 ? "bg-amber-400"   : "bg-rose-400";

        return (
          <div
            key={proc.id}
            className={cn(
              "bg-card rounded-2xl border border-border shadow-sm flex flex-col",
              "hover:shadow-md transition-all duration-200 group",
              !proc.isActive && "opacity-55 grayscale-[20%]"
            )}
          >
            {/* Accent bar */}
            {hasCostFeature && <div className={cn("h-0.5 rounded-t-2xl w-full", accentBar)} />}

            <div className="p-4 flex flex-col gap-3 flex-1">

              {/* ── Top row: category + status | actions ── */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap gap-1 items-center">
                  <CategoryBadge category={proc.category} />
                  {!proc.isActive && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                      <PowerOff className="w-2.5 h-2.5" /> Inativo
                    </span>
                  )}
                  {proc.isGlobal && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">
                      <Globe className="w-2.5 h-2.5" /> Global
                    </span>
                  )}
                </div>

                {/* Actions — visible on hover or always on mobile */}
                <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity sm:opacity-0">
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

              {/* ── Name & description ── */}
              <div className="space-y-0.5">
                <h3 className="font-semibold text-foreground text-[15px] leading-snug">
                  {proc.name}
                </h3>
                {proc.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {proc.description}
                  </p>
                )}
              </div>

              {/* ── Key facts row ── */}
              <div className="flex flex-wrap gap-1.5">
                <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full", mod.cls)}>
                  {mod.icon}
                  {proc.modalidade === "grupo"
                    ? `Grupo · ${proc.maxCapacity} vagas`
                    : mod.label}
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                  <Clock className="w-2.5 h-2.5" />
                  {proc.durationMinutes} min
                </span>
                {proc.onlineBookingEnabled && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-700">
                    <Wifi className="w-2.5 h-2.5" /> Online
                  </span>
                )}
              </div>

              {/* ── Pricing ── */}
              <div className="mt-auto pt-3 border-t border-border">
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-0.5">
                      {hasClinicOverride ? "Preço desta clínica" : "Preço / sessão"}
                    </p>
                    <div className="flex items-baseline gap-1.5">
                      <span className={cn("text-xl font-bold tabular-nums", hasClinicOverride ? "text-primary" : "text-foreground")}>
                        {formatCurrency(effectivePrice)}
                      </span>
                      {hasClinicOverride && (
                        <span className="text-[10px] text-muted-foreground line-through tabular-nums">
                          {formatCurrency(proc.price)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Cost + Margin — feature gated */}
                  {hasCostFeature ? (
                    <div className="text-right space-y-0.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Custo · Margem</p>
                      <div className="flex items-center gap-1.5 justify-end">
                        <span className={cn("text-xs font-semibold tabular-nums", hasClinicCosts ? "text-emerald-700" : "text-muted-foreground")}>
                          {formatCurrency(effectiveCost)}
                        </span>
                        <MarginBadge margin={margin} />
                      </div>
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full bg-muted text-muted-foreground opacity-60">
                      <Lock className="w-2.5 h-2.5" /> Pro
                    </span>
                  )}
                </div>

                {/* Clinic costs badge */}
                {hasCostFeature && hasClinicCosts && (
                  <div className="mt-2 flex items-center gap-1.5 text-[10px] text-emerald-700 font-medium">
                    <DollarSign className="w-3 h-3 shrink-0" />
                    <span>Custos configurados para esta clínica</span>
                    {proc.clinicCost?.notes && (
                      <span className="text-muted-foreground font-normal truncate">· {proc.clinicCost.notes}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
