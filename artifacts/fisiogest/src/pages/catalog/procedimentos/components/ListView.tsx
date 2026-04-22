import { CATEGORIES, CATEGORY_CONFIG, formatCurrency, getMargin } from "../constants";
import { ProcedureCost, OverheadSchedule, OverheadAnalysis, Procedure, ViewMode } from "../types";
import { CardView, CategoryBadge, MarginBadge } from "./";
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

export function ListView({ procedures, onEdit, onDelete, isAdmin, onToggleActive, onConfigCosts }: {
  procedures: Procedure[];
  onEdit: (p: Procedure) => void;
  onDelete: (p: Procedure) => void;
  isAdmin?: boolean;
  onToggleActive?: (p: Procedure) => void;
  onConfigCosts?: (p: Procedure) => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* Header row */}
      <div className="grid items-center border-b border-slate-100 bg-slate-50/80 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400
        grid-cols-[1fr_90px_96px]
        md:grid-cols-[1fr_120px_90px_96px]
        lg:grid-cols-[1fr_120px_90px_90px_70px_70px_96px]">
        <span>Procedimento</span>
        <span className="hidden md:block">Categoria</span>
        <span className="text-right">Preço</span>
        <span className="text-right hidden lg:block">Custo</span>
        <span className="text-right hidden lg:block">Margem</span>
        <span className="text-right hidden lg:block">Duração</span>
        <span />
      </div>

      {/* Rows */}
      {procedures.map((proc, idx) => {
        const effectivePrice = proc.effectivePrice ?? proc.price;
        const effectiveCost = proc.effectiveTotalCost ?? proc.cost ?? 0;
        const margin = getMargin(effectivePrice, effectiveCost);
        const hasClinicOverride = !!proc.clinicCost?.priceOverride;
        return (
          <div
            key={proc.id}
            className={cn(
              "grid items-center px-4 py-3 hover:bg-slate-50/70 transition-colors group",
              "grid-cols-[1fr_90px_96px] md:grid-cols-[1fr_120px_90px_96px] lg:grid-cols-[1fr_120px_90px_90px_70px_70px_96px]",
              idx !== procedures.length - 1 && "border-b border-slate-100",
              !proc.isActive && "opacity-60"
            )}
          >
            <div className="min-w-0 pr-3">
              <div className="flex items-center gap-1.5">
                <p className="font-medium text-sm text-slate-800 truncate">{proc.name}</p>
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
              </div>
              {proc.description && (
                <p className="text-xs text-slate-400 truncate mt-0.5">{proc.description}</p>
              )}
            </div>

            {/* Categoria — md+ */}
            <div className="hidden md:block"><CategoryBadge category={proc.category} /></div>

            {/* Preço — sempre visível */}
            <div className="text-right">
              <p className={cn("text-sm font-semibold", hasClinicOverride ? "text-emerald-700" : "text-slate-800")}>
                {formatCurrency(effectivePrice)}
              </p>
              {hasClinicOverride && (
                <p className="text-[10px] text-slate-400 line-through">{formatCurrency(proc.price)}</p>
              )}
            </div>

            {/* Custo — lg+ */}
            <div className="text-right hidden lg:block">
              <p className={cn("text-xs", proc.clinicCost ? "text-emerald-700 font-medium" : "text-slate-500")}>
                {formatCurrency(effectiveCost)}
              </p>
            </div>

            {/* Margem — lg+ */}
            <div className="text-right hidden lg:block">
              <MarginBadge margin={margin} />
            </div>

            {/* Duração — lg+ */}
            <div className="text-right hidden lg:block">
              <p className="text-xs text-slate-500 flex items-center justify-end gap-1">
                <Clock className="w-3 h-3" />{proc.durationMinutes}m
              </p>
            </div>

            <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              {isAdmin && onToggleActive && (
                <button
                  onClick={() => onToggleActive(proc)}
                  title={proc.isActive ? "Desativar" : "Ativar"}
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
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
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
        );
      })}
    </div>
  );
}
