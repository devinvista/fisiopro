import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Pencil, Trash2, User, CalendarDays, Clock, Layers, AlertCircle, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CategoryBadge } from "./CategoryBadge";
import { MODALIDADE_CONFIG, formatCurrency } from "./helpers";
import type { PackageItem } from "./types";

export function PackageCard({
  pkg,
  isAdmin,
  onEdit,
  onDelete,
}: {
  pkg: PackageItem;
  isAdmin: boolean;
  onEdit: (pkg: PackageItem) => void;
  onDelete: (pkg: PackageItem) => void;
}) {
  const isMensal = pkg.packageType === "mensal";
  const isFatura = pkg.packageType === "faturaConsolidada";
  const ModalIcon = MODALIDADE_CONFIG[pkg.procedureModalidade]?.icon ?? User;
  const modalidadeLabel = MODALIDADE_CONFIG[pkg.procedureModalidade]?.label ?? pkg.procedureModalidade;
  const pps = isMensal
    ? (pkg.monthlyPrice ? Number(pkg.monthlyPrice) / (pkg.sessionsPerWeek * 4) : null)
    : (pkg.totalSessions ? Number(pkg.price) / pkg.totalSessions : null);

  return (
    <div className={cn(
      "bg-card border rounded-xl p-5 hover:shadow-md transition-shadow flex flex-col gap-4",
      !pkg.isActive && "opacity-60"
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={cn(
              "text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded",
              isFatura ? "bg-violet-100 text-violet-700" : isMensal ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
            )}>
              {isFatura ? "Fatura" : isMensal ? "Mensal" : "Sessões"}
            </span>
            {!pkg.isActive && <Badge variant="secondary" className="text-[10px]">Inativo</Badge>}
          </div>
          <h3 className="font-semibold text-foreground truncate">{pkg.name}</h3>
          {pkg.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{pkg.description}</p>
          )}
        </div>
        {isAdmin && (
          <div className="flex gap-1 shrink-0">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(pkg)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(pkg)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <CategoryBadge category={pkg.procedureCategory} />
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
          <ModalIcon className="h-3 w-3" />
          {modalidadeLabel}
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        Procedimento: <span className="text-foreground font-medium">{pkg.procedureName}</span>
        <span className="text-muted-foreground"> ({pkg.procedureDurationMinutes} min)</span>
      </p>

      {isMensal || isFatura ? (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-muted/50 rounded-lg p-2">
            {isFatura ? <FileText className="h-3 w-3 mx-auto mb-0.5 text-muted-foreground" /> : <CalendarDays className="h-3 w-3 mx-auto mb-0.5 text-muted-foreground" />}
            <p className="text-base font-bold">{isFatura ? "uso" : `${pkg.sessionsPerWeek}x`}</p>
            <p className="text-[10px] text-muted-foreground">{isFatura ? "por sessão" : "por semana"}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-2">
            <AlertCircle className="h-3 w-3 mx-auto mb-0.5 text-muted-foreground" />
            <p className="text-base font-bold">{isFatura ? "fim" : pkg.absenceCreditLimit}</p>
            <p className="text-[10px] text-muted-foreground">{isFatura ? "do ciclo" : "faltas/mês"}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-2">
            <Clock className="h-3 w-3 mx-auto mb-0.5 text-muted-foreground" />
            <p className="text-base font-bold">dia {pkg.billingDay}</p>
            <p className="text-[10px] text-muted-foreground">cobrança</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-muted/50 rounded-lg p-2">
            <Layers className="h-3 w-3 mx-auto mb-0.5 text-muted-foreground" />
            <p className="text-base font-bold">{pkg.totalSessions}</p>
            <p className="text-[10px] text-muted-foreground">sessões</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-2">
            <CalendarDays className="h-3 w-3 mx-auto mb-0.5 text-muted-foreground" />
            <p className="text-base font-bold">{pkg.sessionsPerWeek}x</p>
            <p className="text-[10px] text-muted-foreground">por semana</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-2">
            <Clock className="h-3 w-3 mx-auto mb-0.5 text-muted-foreground" />
            <p className="text-base font-bold">{pkg.validityDays}</p>
            <p className="text-[10px] text-muted-foreground">dias valid.</p>
          </div>
        </div>
      )}

      <div className="flex items-end justify-between pt-1 border-t">
        <div>
          <p className="text-xl font-bold">
            {isMensal ? formatCurrency(pkg.monthlyPrice) : formatCurrency(pkg.price)}
            <span className="text-xs font-normal text-muted-foreground ml-1">
              {isFatura ? "/sessão" : isMensal ? "/mês" : "total"}
            </span>
          </p>
          {pps !== null && (
            <p className="text-xs text-muted-foreground">{formatCurrency(pps)}/sessão</p>
          )}
        </div>
        {pps !== null && Number(pkg.procedurePricePerSession) > 0 && (
          <span className="text-xs font-semibold text-emerald-600">
            {(((Number(pkg.procedurePricePerSession) - pps) / Number(pkg.procedurePricePerSession)) * 100).toFixed(0)}% desc.
          </span>
        )}
      </div>
    </div>
  );
}
