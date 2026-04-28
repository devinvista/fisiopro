import { Button } from "@/components/ui/button";
import {
  AlertCircle, CalendarCheck2, CheckCircle2, ChevronDown, ChevronUp,
  Clock, Loader2, RefreshCw,
} from "lucide-react";
import { formatCurrency } from "../../utils";

export interface BillingStatusData {
  lastRun: {
    id: number; ranAt: string; triggeredBy: string;
    generated: number; skipped: number; errors: number; processed: number; dryRun: boolean;
  } | null;
  upcoming: { id: number; patientName: string; procedureName: string; amount: number; nextBillingDate: string; }[];
  upcomingTotal: number;
  upcomingCount: number;
}

function formatLastRunDate(ranAt: string) {
  const d = new Date(ranAt);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / 3600000);
  const diffM = Math.floor(diffMs / 60000);
  if (diffM < 1) return "agora mesmo";
  if (diffM < 60) return `há ${diffM} min`;
  if (diffH < 24) return `hoje às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatUpcomingDate(dateStr: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0) return "hoje";
  if (diffDays === 1) return "amanhã";
  return `em ${diffDays} dias`;
}

export function RecurringPackagesPanel({
  planBillingStatus,
  planBillingStatusLoading,
  planBillingResult,
  planBillingRunning,
  onRequestPlanBillingRun,
  showPlanBillingUpcoming,
  setShowPlanBillingUpcoming,
  panelOpen,
  setPanelOpen,
}: {
  planBillingStatus: BillingStatusData | null;
  planBillingStatusLoading: boolean;
  planBillingResult: { generated: number; skipped: number; recordIds: number[] } | null;
  planBillingRunning: boolean;
  onRequestPlanBillingRun: () => void;
  showPlanBillingUpcoming: boolean;
  setShowPlanBillingUpcoming: (v: boolean | ((prev: boolean) => boolean)) => void;
  panelOpen: boolean;
  setPanelOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
}) {
  const status = planBillingStatus;
  const lastRun = status?.lastRun ?? null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <button
        className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50 transition-colors"
        onClick={() => setPanelOpen(v => !v)}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-violet-100">
            <CalendarCheck2 className="w-4 h-4 text-violet-600" />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-slate-800">Faturas dos Planos de Tratamento</p>
            <p className="text-xs text-slate-400">
              {lastRun
                ? `Última execução: ${formatLastRunDate(lastRun.ranAt)}`
                : "Nenhuma execução registrada"}
              {" · "}
              <span className="font-semibold text-violet-600">Automático: diariamente às 06:00</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {(status?.upcomingCount ?? 0) > 0 && (
            <span className="text-[11px] font-bold text-amber-600 bg-amber-100 px-2.5 py-1 rounded-full">
              {status!.upcomingCount} vencendo · {formatCurrency(status!.upcomingTotal)}
            </span>
          )}
          {panelOpen
            ? <ChevronUp className="w-4 h-4 text-slate-400" />
            : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      {panelOpen && (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4 space-y-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4 space-y-3">
            <div className="flex items-start gap-2 bg-white rounded-lg p-2.5">
              {planBillingStatusLoading ? (
                <div className="h-3 w-32 bg-slate-200 animate-pulse rounded" />
              ) : lastRun ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                  <div className="text-[11px] text-slate-600 leading-relaxed">
                    {lastRun.triggeredBy.includes("scheduler") ? "automática" : "manual"}
                    {" · "}
                    <span className={lastRun.generated > 0 ? "text-emerald-600 font-semibold" : "text-slate-400"}>
                      {lastRun.generated > 0
                        ? `${lastRun.generated} fatura(s) gerada(s)`
                        : "nenhuma fatura gerada"}
                    </span>
                    {lastRun.errors > 0 && (
                      <span className="text-red-500 font-semibold"> · {lastRun.errors} erro(s)</span>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <Clock className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-slate-400">Aguardando primeira execução</p>
                </>
              )}
            </div>

            <div className="flex items-start gap-2 bg-white rounded-lg p-2.5">
              {planBillingStatusLoading ? (
                <div className="h-3 w-32 bg-slate-200 animate-pulse rounded" />
              ) : (status?.upcomingCount ?? 0) > 0 ? (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                  <div className="text-[11px] text-slate-600 leading-relaxed">
                    <span className="font-semibold text-amber-600">{status!.upcomingCount}</span>
                    {" "}vencem em 7d{" · "}
                    <span className="font-semibold">{formatCurrency(status!.upcomingTotal)}</span>
                    <button
                      className="ml-1 text-violet-500 hover:text-violet-700 font-semibold"
                      onClick={() => setShowPlanBillingUpcoming(v => !v)}
                    >
                      {showPlanBillingUpcoming ? "ocultar" : "ver"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-slate-400">Nada nos próximos 7 dias</p>
                </>
              )}
            </div>

            {showPlanBillingUpcoming && (status?.upcoming?.length ?? 0) > 0 && (
              <div className="rounded-lg border border-slate-100 bg-white divide-y divide-slate-100 max-h-44 overflow-y-auto">
                {status!.upcoming.map(s => (
                  <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 text-[11px]">
                    <span className="text-slate-700 truncate flex-1 min-w-0">
                      <span className="font-semibold">{s.patientName}</span>
                      <span className="text-slate-400 mx-1">·</span>
                      <span className="text-slate-500">{s.procedureName}</span>
                    </span>
                    <span className="text-amber-600 font-semibold shrink-0">{formatUpcomingDate(s.nextBillingDate)}</span>
                    <span className="text-slate-900 font-bold shrink-0">{formatCurrency(s.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {planBillingResult !== null && (
              <div className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold ${planBillingResult.generated > 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                {planBillingResult.generated > 0
                  ? `${planBillingResult.generated} fatura(s) gerada(s)`
                  : "Nenhuma fatura gerada"}
              </div>
            )}

            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg border-violet-200 text-violet-700 hover:bg-violet-50 h-7 text-[11px] font-semibold"
                onClick={onRequestPlanBillingRun}
                disabled={planBillingRunning}
              >
                {planBillingRunning
                  ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  : <RefreshCw className="w-3 h-3 mr-1" />}
                Executar agora
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
