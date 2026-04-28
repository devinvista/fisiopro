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

export function SubscriptionBillingPanel({
  billingStatus,
  billingStatusLoading,
  billingResult,
  billingRunning,
  panelOpen,
  setPanelOpen,
  showUpcoming,
  setShowUpcoming,
  onRequestRun,
}: {
  billingStatus: BillingStatusData | null;
  billingStatusLoading: boolean;
  billingResult: { generated: number; skipped: number; recordIds: number[] } | null;
  billingRunning: boolean;
  panelOpen: boolean;
  setPanelOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  showUpcoming: boolean;
  setShowUpcoming: (v: boolean | ((prev: boolean) => boolean)) => void;
  onRequestRun: () => void;
}) {
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
            <p className="text-sm font-bold text-slate-800">Cobrança de Assinaturas</p>
            <p className="text-xs text-slate-400">
              {billingStatus?.lastRun
                ? `Última execução: ${formatLastRunDate(billingStatus.lastRun.ranAt)}`
                : "Nenhuma execução registrada"}
              {" · "}
              <span className="font-semibold text-violet-600">Automático: diariamente às 06:00</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {(billingStatus?.upcomingCount ?? 0) > 0 && (
            <span className="text-[11px] font-bold text-amber-600 bg-amber-100 px-2.5 py-1 rounded-full">
              {billingStatus!.upcomingCount} vencendo
            </span>
          )}
          {panelOpen
            ? <ChevronUp className="w-4 h-4 text-slate-400" />
            : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      {panelOpen && (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-start gap-2 bg-slate-50 rounded-xl p-3">
              {billingStatusLoading ? (
                <div className="h-4 w-40 bg-slate-200 animate-pulse rounded" />
              ) : billingStatus?.lastRun ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <div className="text-xs text-slate-600">
                    <span className="font-semibold">Última execução:</span>{" "}
                    {formatLastRunDate(billingStatus.lastRun.ranAt)}
                    {" · "}{billingStatus.lastRun.triggeredBy === "scheduler" ? "automática" : "manual"}
                    {" · "}
                    <span className={billingStatus.lastRun.generated > 0 ? "text-emerald-600 font-semibold" : "text-slate-400"}>
                      {billingStatus.lastRun.generated > 0
                        ? `${billingStatus.lastRun.generated} gerada(s)`
                        : "nenhuma gerada"}
                    </span>
                    {billingStatus.lastRun.errors > 0 && (
                      <span className="text-red-500 font-semibold"> · {billingStatus.lastRun.errors} erro(s)</span>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <Clock className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-slate-400">Nenhuma execução registrada ainda</p>
                </>
              )}
            </div>

            <div className="flex items-start gap-2 bg-slate-50 rounded-xl p-3">
              {billingStatusLoading ? (
                <div className="h-4 w-36 bg-slate-200 animate-pulse rounded" />
              ) : (billingStatus?.upcomingCount ?? 0) > 0 ? (
                <>
                  <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <div className="text-xs text-slate-600">
                    <span className="font-semibold text-amber-600">{billingStatus!.upcomingCount} assinatura(s)</span>
                    {" "}vencem nos próximos 7 dias{" · "}
                    <span className="font-semibold">{formatCurrency(billingStatus!.upcomingTotal)}</span>
                    <button
                      className="ml-1 text-violet-500 hover:text-violet-700 font-semibold"
                      onClick={() => setShowUpcoming(v => !v)}
                    >
                      {showUpcoming ? "ocultar" : "ver"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-slate-400">Nenhuma assinatura vence nos próximos 7 dias</p>
                </>
              )}
            </div>
          </div>

          {showUpcoming && (billingStatus?.upcoming?.length ?? 0) > 0 && (
            <div className="rounded-xl border border-slate-100 divide-y divide-slate-100">
              {billingStatus!.upcoming.map(s => (
                <div key={s.id} className="flex items-center justify-between gap-2 px-4 py-3 text-xs">
                  <span className="text-slate-700 truncate flex-1">
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

          {billingResult !== null && (
            <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-semibold ${billingResult.generated > 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-500"}`}>
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              {billingResult.generated > 0
                ? `${billingResult.generated} lançamento(s) gerado(s) agora`
                : "Nenhum lançamento gerado — assinaturas já cobradas ou fora da janela"}
            </div>
          )}

          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl border-violet-200 text-violet-700 hover:bg-violet-50 h-8 text-xs font-semibold"
              onClick={onRequestRun}
              disabled={billingRunning}
            >
              {billingRunning
                ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
              Executar cobrança agora
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
