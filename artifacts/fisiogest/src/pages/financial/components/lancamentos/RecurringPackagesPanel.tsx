/**
 * Sprint 5 — Painel unificado "Pacotes Recorrentes".
 *
 * Substitui o `SubscriptionBillingPanel` (que cobria apenas o legado de
 * `patient_subscriptions`) e passa a mostrar TAMBÉM o status do novo job
 * `monthlyPlanBilling` (Sprint 3+), que gera as faturas mensais dos itens
 * `recorrenteMensal` dos planos de tratamento aceitos.
 *
 * Visualmente, separa as duas fontes em sub-cards lado a lado para o
 * usuário entender de onde vem cada cobrança — durante a transição do
 * legado, ambos coexistem; depois da migração (`migrate-legacy-plans`),
 * a primeira tende a ficar zerada.
 */
import { Button } from "@/components/ui/button";
import {
  AlertCircle, CalendarCheck2, CheckCircle2, ChevronDown, ChevronUp,
  Clock, Loader2, RefreshCw, FileText,
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

interface SourceCardProps {
  title: string;
  badge: string;
  badgeClass: string;
  iconBg: string;
  iconColor: string;
  status: BillingStatusData | null;
  loading: boolean;
  result: { generated: number; skipped: number } | null;
  running: boolean;
  showUpcoming: boolean;
  setShowUpcoming: (v: boolean | ((prev: boolean) => boolean)) => void;
  onRequestRun: () => void;
}

function SourceCard({
  title, badge, badgeClass, iconBg, iconColor,
  status, loading, result, running, showUpcoming, setShowUpcoming, onRequestRun,
}: SourceCardProps) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${iconBg}`}>
            <CalendarCheck2 className={`w-3.5 h-3.5 ${iconColor}`} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-800">{title}</p>
            <p className="text-[10px] text-slate-400">
              {status?.lastRun
                ? `Última: ${formatLastRunDate(status.lastRun.ranAt)}`
                : "Nunca executado"}
            </p>
          </div>
        </div>
        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${badgeClass}`}>
          {badge}
        </span>
      </div>

      <div className="flex items-start gap-2 bg-white rounded-lg p-2.5">
        {loading ? (
          <div className="h-3 w-32 bg-slate-200 animate-pulse rounded" />
        ) : status?.lastRun ? (
          <>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
            <div className="text-[11px] text-slate-600 leading-relaxed">
              {status.lastRun.triggeredBy.includes("scheduler") ? "automática" : "manual"}
              {" · "}
              <span className={status.lastRun.generated > 0 ? "text-emerald-600 font-semibold" : "text-slate-400"}>
                {status.lastRun.generated > 0
                  ? `${status.lastRun.generated} gerada(s)`
                  : "nenhuma gerada"}
              </span>
              {status.lastRun.errors > 0 && (
                <span className="text-red-500 font-semibold"> · {status.lastRun.errors} erro(s)</span>
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
        {loading ? (
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
                onClick={() => setShowUpcoming(v => !v)}
              >
                {showUpcoming ? "ocultar" : "ver"}
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

      {showUpcoming && (status?.upcoming?.length ?? 0) > 0 && (
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

      {result !== null && (
        <div className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold ${result.generated > 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          {result.generated > 0
            ? `${result.generated} lançamento(s) gerado(s)`
            : "Nenhum lançamento gerado"}
        </div>
      )}

      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          className="rounded-lg border-violet-200 text-violet-700 hover:bg-violet-50 h-7 text-[11px] font-semibold"
          onClick={onRequestRun}
          disabled={running}
        >
          {running
            ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
            : <RefreshCw className="w-3 h-3 mr-1" />}
          Executar agora
        </Button>
      </div>
    </div>
  );
}

export function RecurringPackagesPanel({
  // Fonte 1 (legada) — patient_subscriptions
  subscriptionStatus,
  subscriptionStatusLoading,
  subscriptionResult,
  subscriptionRunning,
  onRequestSubscriptionRun,
  showSubscriptionUpcoming,
  setShowSubscriptionUpcoming,
  // Fonte 2 (nova) — treatment-plans/billing
  planBillingStatus,
  planBillingStatusLoading,
  planBillingResult,
  planBillingRunning,
  onRequestPlanBillingRun,
  showPlanBillingUpcoming,
  setShowPlanBillingUpcoming,
  // Painel
  panelOpen,
  setPanelOpen,
}: {
  subscriptionStatus: BillingStatusData | null;
  subscriptionStatusLoading: boolean;
  subscriptionResult: { generated: number; skipped: number; recordIds: number[] } | null;
  subscriptionRunning: boolean;
  onRequestSubscriptionRun: () => void;
  showSubscriptionUpcoming: boolean;
  setShowSubscriptionUpcoming: (v: boolean | ((prev: boolean) => boolean)) => void;
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
  const totalUpcoming =
    (subscriptionStatus?.upcomingCount ?? 0) +
    (planBillingStatus?.upcomingCount ?? 0);
  const totalAmount =
    (subscriptionStatus?.upcomingTotal ?? 0) +
    (planBillingStatus?.upcomingTotal ?? 0);

  const lastAnyRun =
    subscriptionStatus?.lastRun && planBillingStatus?.lastRun
      ? new Date(subscriptionStatus.lastRun.ranAt) > new Date(planBillingStatus.lastRun.ranAt)
        ? subscriptionStatus.lastRun
        : planBillingStatus.lastRun
      : subscriptionStatus?.lastRun ?? planBillingStatus?.lastRun ?? null;

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
            <p className="text-sm font-bold text-slate-800">Pacotes Recorrentes</p>
            <p className="text-xs text-slate-400">
              {lastAnyRun
                ? `Última execução: ${formatLastRunDate(lastAnyRun.ranAt)}`
                : "Nenhuma execução registrada"}
              {" · "}
              <span className="font-semibold text-violet-600">Automático: diariamente às 06:00</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {totalUpcoming > 0 && (
            <span className="text-[11px] font-bold text-amber-600 bg-amber-100 px-2.5 py-1 rounded-full">
              {totalUpcoming} vencendo · {formatCurrency(totalAmount)}
            </span>
          )}
          {panelOpen
            ? <ChevronUp className="w-4 h-4 text-slate-400" />
            : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      {panelOpen && (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4 space-y-4">
          <div className="flex items-start gap-2 rounded-lg bg-blue-50 px-3 py-2 text-[11px] text-blue-700">
            <FileText className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              Há duas fontes de cobrança recorrente convivendo: o
              <strong> legado de assinaturas </strong>(em desuso) e os
              <strong> planos de tratamento aceitos </strong>(novo padrão).
              Use o script de migração para converter o legado.
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <SourceCard
              title="Planos de Tratamento"
              badge="ATUAL"
              badgeClass="bg-emerald-100 text-emerald-700"
              iconBg="bg-emerald-100"
              iconColor="text-emerald-600"
              status={planBillingStatus}
              loading={planBillingStatusLoading}
              result={planBillingResult}
              running={planBillingRunning}
              showUpcoming={showPlanBillingUpcoming}
              setShowUpcoming={setShowPlanBillingUpcoming}
              onRequestRun={onRequestPlanBillingRun}
            />

            <SourceCard
              title="Assinaturas (legado)"
              badge="LEGADO"
              badgeClass="bg-slate-200 text-slate-600"
              iconBg="bg-slate-100"
              iconColor="text-slate-500"
              status={subscriptionStatus}
              loading={subscriptionStatusLoading}
              result={subscriptionResult}
              running={subscriptionRunning}
              showUpcoming={showSubscriptionUpcoming}
              setShowUpcoming={setShowSubscriptionUpcoming}
              onRequestRun={onRequestSubscriptionRun}
            />
          </div>
        </div>
      )}
    </div>
  );
}
