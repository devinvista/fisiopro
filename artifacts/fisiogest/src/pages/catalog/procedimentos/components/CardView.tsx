import { CATEGORIES, CATEGORY_CONFIG, formatCurrency, getMargin } from "../constants";
import { ProcedureCost, OverheadSchedule, OverheadAnalysis, Procedure, ViewMode } from "../types";
import { CategoryBadge, ListView, MarginBadge } from "./";
import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/utils/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Pencil,
  Trash2,
  Clock,
  LayoutGrid,
  LayoutList,
  Search,
  TrendingUp,
  Stethoscope,
  BookOpen,
  Printer,
  Globe,
  Power,
  PowerOff,
  DollarSign,
  Wrench,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/utils/utils";

// ─── Card View ────────────────────────────────────────────────────────────────

export function CardView({ procedures, onEdit, onDelete, isAdmin, onToggleActive, onConfigCosts }: {
  procedures: Procedure[];
  onEdit: (p: Procedure) => void;
  onDelete: (p: Procedure) => void;
  isAdmin?: boolean;
  onToggleActive?: (p: Procedure) => void;
  onConfigCosts?: (p: Procedure) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {procedures.map(proc => {
        const effectivePrice = proc.effectivePrice ?? proc.price;
        const effectiveCost = proc.effectiveTotalCost ?? proc.cost ?? 0;
        const margin = getMargin(effectivePrice, effectiveCost);
        const marginColor = margin >= 60 ? "bg-emerald-500" : margin >= 35 ? "bg-amber-400" : "bg-red-400";
        const hasClinicOverride = !!proc.clinicCost?.priceOverride;

        return (
          <div
            key={proc.id}
            className={cn(
              "bg-white rounded-2xl border overflow-hidden hover:shadow-md transition-shadow group",
              proc.isActive ? "border-slate-200" : "border-slate-200 opacity-60 grayscale-[40%]"
            )}
          >
            {/* Top bar accent */}
            <div className={cn("h-1 w-full", marginColor)} />

            <div className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h3 className="font-semibold text-slate-800 leading-snug truncate">{proc.name}</h3>
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
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <CategoryBadge category={proc.category} />
                    {proc.modalidade && proc.modalidade !== "individual" && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">
                        {proc.modalidade === "grupo" ? "Grupo" : "Dupla"}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  {isAdmin && onToggleActive && (
                    <button
                      onClick={() => onToggleActive(proc)}
                      title={proc.isActive ? "Desativar procedimento" : "Ativar procedimento"}
                      className={cn(
                        "p-1.5 rounded-lg transition-colors",
                        proc.isActive
                          ? "hover:bg-amber-50 text-slate-400 hover:text-amber-500"
                          : "hover:bg-emerald-50 text-slate-400 hover:text-emerald-500"
                      )}
                    >
                      {proc.isActive ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                    </button>
                  )}
                  {isAdmin && onConfigCosts && (
                    <button
                      onClick={() => onConfigCosts(proc)}
                      title="Configurar custos da clínica"
                      className={cn(
                        "p-1.5 rounded-lg transition-colors",
                        proc.clinicCost
                          ? "hover:bg-emerald-50 text-emerald-500 hover:text-emerald-600"
                          : "hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                      )}
                    >
                      <DollarSign className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => onEdit(proc)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDelete(proc)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {proc.description && (
                <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{proc.description}</p>
              )}

              <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-1 border-t border-slate-100">
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">
                    {hasClinicOverride ? "Preço desta clínica" : "Preço padrão / sessão"}
                  </p>
                  <div className="flex items-center gap-1">
                    <p className="text-sm font-bold text-slate-800">{formatCurrency(effectivePrice)}</p>
                    {hasClinicOverride && (
                      <span className="text-[9px] text-slate-400 line-through">{formatCurrency(proc.price)}</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Margem</p>
                  <MarginBadge margin={margin} />
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Modalidade</p>
                  <span className={cn(
                    "inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                    proc.modalidade === "grupo"
                      ? "bg-amber-50 text-amber-700"
                      : proc.modalidade === "dupla"
                      ? "bg-purple-50 text-purple-700"
                      : "bg-sky-50 text-sky-700"
                  )}>
                    {proc.modalidade === "grupo"
                      ? `Grupo · ${proc.maxCapacity} vagas`
                      : proc.modalidade === "dupla"
                      ? "Dupla · 2 vagas"
                      : "Individual"}
                  </span>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Duração</p>
                  <p className="text-xs text-slate-600 flex items-center gap-1">
                    <Clock className="w-3 h-3" />{proc.durationMinutes} min
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Custo / sessão</p>
                  <p className={cn("text-xs", proc.clinicCost ? "text-emerald-700 font-medium" : "text-slate-500")}>
                    {formatCurrency(effectiveCost)}
                    {proc.clinicCost && <Wrench className="inline w-2.5 h-2.5 ml-1 text-emerald-400" />}
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── List View ────────────────────────────────────────────────────────────────

