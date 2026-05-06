import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, Loader2, Repeat, Users, ChevronDown, ChevronUp, TrendingUp, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authHeaders, formatCurrency } from "../utils";
import { KpiCard } from "./KpiCard";
import { MetricStrip } from "./MetricStrip";

export function OrcadoRealizadoTab({ month, year }: { month: number; year: number }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showPatients, setShowPatients] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/financial/dre?month=${month}&year=${year}`, { headers: authHeaders() });
      if (res.ok) setData(await res.json());
    } catch { }
    finally { setLoading(false); }
  }, [month, year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const est = data?.estimated ?? {};
  const cur = data?.current ?? {};
  const variance = data?.variance ?? {};

  const revPct = est.revenue > 0 ? Math.min(100, (cur.grossRevenue / est.revenue) * 100) : 0;
  const expPct = est.expenses > 0 ? Math.min(100, (cur.totalExpenses / est.expenses) * 100) : 0;

  const hasRecurring = (data?.recurringExpenses ?? []).length > 0;
  const byPatient: { patientId: number; patientName: string; mrr: number; pending: number; total: number }[] =
    est.revenueByPatient ?? [];
  const isComputed = est.revenueSource === "computed";

  return (
    <div className="space-y-6">
      {!hasRecurring && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Despesas fixas não configuradas</p>
            <p className="text-xs text-amber-600 mt-0.5">Configure suas despesas fixas recorrentes na aba "Despesas Fixas" para obter estimativas precisas de orçamento.</p>
          </div>
        </div>
      )}

      {/* Revenue comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
        {/* Revenue */}
        <Card className="border border-slate-100 shadow-sm rounded-2xl bg-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-slate-800">Receita</CardTitle>
            <p className="text-xs text-slate-400">Realizado vs Orçado</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Realizado</p>
                <p className="text-2xl font-bold text-emerald-600 tabular-nums">{formatCurrency(cur.grossRevenue ?? 0)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Orçado</p>
                <p className="text-lg font-semibold text-slate-400 tabular-nums">{formatCurrency(est.revenue ?? 0)}</p>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                <span>Execução</span>
                <span className="font-semibold">{revPct.toFixed(0)}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${revPct >= 90 ? "bg-emerald-500" : revPct >= 60 ? "bg-amber-400" : "bg-red-400"}`}
                  style={{ width: `${revPct}%` }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              {variance.revenuePct !== undefined && (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${variance.revenuePct >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                  {variance.revenuePct >= 0 ? "+" : ""}{variance.revenuePct?.toFixed(1)}% vs orçado
                </span>
              )}
              {isComputed && (
                <span className="text-[10px] text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">
                  Estimativa automática
                </span>
              )}
            </div>

            {/* MRR + Pending breakdown pills — only when computed */}
            {isComputed && (est.mrr > 0 || est.pendingReceivable > 0) && (
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                {est.mrr > 0 && (
                  <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-1.5">
                    <TrendingUp className="w-3 h-3 text-indigo-500 shrink-0" />
                    <div>
                      <p className="text-[9px] font-bold text-indigo-500 uppercase leading-none">MRR</p>
                      <p className="text-xs font-bold text-indigo-700 tabular-nums">{formatCurrency(est.mrr)}</p>
                    </div>
                  </div>
                )}
                {est.pendingReceivable > 0 && (
                  <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                    <Clock className="w-3 h-3 text-amber-500 shrink-0" />
                    <div>
                      <p className="text-[9px] font-bold text-amber-500 uppercase leading-none">A Receber</p>
                      <p className="text-xs font-bold text-amber-700 tabular-nums">{formatCurrency(est.pendingReceivable)}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Expenses */}
        <Card className="border border-slate-100 shadow-sm rounded-2xl bg-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-slate-800">Despesas</CardTitle>
            <p className="text-xs text-slate-400">Realizado vs Orçado</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Realizado</p>
                <p className="text-2xl font-bold text-red-600 tabular-nums">{formatCurrency(cur.totalExpenses ?? 0)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Orçado</p>
                <p className="text-lg font-semibold text-slate-400 tabular-nums">{formatCurrency(est.expenses ?? 0)}</p>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                <span>Utilização do orçamento</span>
                <span className="font-semibold">{expPct.toFixed(0)}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${expPct <= 80 ? "bg-emerald-500" : expPct <= 100 ? "bg-amber-400" : "bg-red-400"}`}
                  style={{ width: `${Math.min(expPct, 100)}%` }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              {variance.expensesPct !== undefined && (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${variance.expensesPct <= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                  {variance.expensesPct >= 0 ? "+" : ""}{variance.expensesPct?.toFixed(1)}% vs orçado
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Net Result */}
      <Card className={`border shadow-sm rounded-2xl overflow-hidden ${(cur.netProfit ?? 0) >= 0 ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
        <CardContent className="p-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">Resultado Líquido</p>
            <p className={`text-xl sm:text-3xl font-extrabold tabular-nums break-words leading-tight ${(cur.netProfit ?? 0) >= 0 ? "text-emerald-700" : "text-red-700"}`}>
              {formatCurrency(cur.netProfit ?? 0)}
            </p>
            {est.netProfit !== undefined && (
              <p className="text-xs text-slate-500 mt-1">Orçado: {formatCurrency(est.netProfit)}</p>
            )}
          </div>
          {cur.netMarginPct !== undefined && (
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Margem Líquida</p>
              <p className={`text-2xl font-extrabold ${cur.netMarginPct >= 20 ? "text-emerald-700" : cur.netMarginPct >= 10 ? "text-amber-700" : "text-red-700"}`}>
                {cur.netMarginPct.toFixed(1)}%
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">Meta: ≥ 20%</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-patient revenue breakdown */}
      {byPatient.length > 0 && (
        <Card className="border border-slate-100 shadow-sm rounded-2xl bg-white">
          <CardHeader className="pb-0">
            <button
              type="button"
              className="w-full flex items-center justify-between gap-2 text-left"
              onClick={() => setShowPatients(v => !v)}
            >
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                <CardTitle className="text-base font-bold text-slate-800">
                  Orçado por Cliente
                </CardTitle>
                <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  {byPatient.length} clientes
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-bold text-slate-600 tabular-nums">
                  {formatCurrency(est.revenue ?? 0)}
                </span>
                {showPatients
                  ? <ChevronUp className="w-4 h-4 text-slate-400" />
                  : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </div>
            </button>
            <p className="text-xs text-slate-400 mt-1 pb-3">
              {isComputed ? "MRR do plano mensal + receitas pendentes do mês por paciente" : "Composição da meta configurada não é detalhável por paciente"}
            </p>
          </CardHeader>

          {showPatients && (
            <CardContent className="pt-0">
              <div className="border-t border-slate-100 pt-3 space-y-0">
                {/* Header row */}
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-slate-400 px-1 pb-2">
                  <span>Cliente</span>
                  <div className="flex items-center gap-6">
                    <span className="w-20 text-right">MRR</span>
                    <span className="w-20 text-right">A Receber</span>
                    <span className="w-20 text-right">Total</span>
                  </div>
                </div>
                {byPatient.map((p, idx) => {
                  const pct = (est.revenue ?? 0) > 0 ? (p.total / est.revenue) * 100 : 0;
                  return (
                    <div
                      key={p.patientId}
                      className={`flex items-center justify-between py-2.5 px-1 ${idx < byPatient.length - 1 ? "border-b border-slate-50" : ""}`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-[11px] font-bold text-primary">
                          {p.patientName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-700 truncate">{p.patientName}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <div className="h-1 rounded-full bg-primary/20 overflow-hidden" style={{ width: 60 }}>
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-slate-400">{pct.toFixed(0)}%</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-6 shrink-0">
                        <span className="w-20 text-right text-xs tabular-nums text-indigo-600 font-medium">
                          {p.mrr > 0 ? formatCurrency(p.mrr) : <span className="text-slate-300">—</span>}
                        </span>
                        <span className="w-20 text-right text-xs tabular-nums text-amber-600 font-medium">
                          {p.pending > 0 ? formatCurrency(p.pending) : <span className="text-slate-300">—</span>}
                        </span>
                        <span className="w-20 text-right text-sm tabular-nums font-bold text-slate-700">
                          {formatCurrency(p.total)}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {/* Total footer */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-200 px-1">
                  <span className="text-sm font-bold text-slate-700">Total Orçado</span>
                  <div className="flex items-center gap-6 shrink-0">
                    <span className="w-20 text-right text-xs tabular-nums font-bold text-indigo-600">
                      {formatCurrency(est.mrr ?? 0)}
                    </span>
                    <span className="w-20 text-right text-xs tabular-nums font-bold text-amber-600">
                      {formatCurrency(est.pendingReceivable ?? 0)}
                    </span>
                    <span className="w-20 text-right text-sm tabular-nums font-extrabold text-slate-800">
                      {formatCurrency(est.revenue ?? 0)}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Recurring Expenses breakdown */}
      {(data?.recurringExpenses ?? []).length > 0 && (
        <Card className="border border-slate-100 shadow-sm rounded-2xl bg-white">
          <CardHeader>
            <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Repeat className="w-4 h-4 text-indigo-500" /> Despesas Fixas Configuradas
            </CardTitle>
            <p className="text-xs text-slate-400">Base para o orçamento estimado de despesas</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {data.recurringExpenses.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between text-sm py-2.5 border-b border-slate-50 last:border-0">
                  <div>
                    <p className="font-medium text-slate-700">{r.name}</p>
                    <p className="text-[11px] text-slate-400">{r.category} · {r.frequency}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-red-600 tabular-nums">{formatCurrency(r.amount)}</p>
                    {r.frequency !== "mensal" && (
                      <p className="text-[11px] text-slate-400 tabular-nums">≈ {formatCurrency(r.monthlyEquivalent)}/mês</p>
                    )}
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between font-bold text-sm pt-3 border-t border-slate-200">
                <span className="text-slate-700">Total Mensal Estimado</span>
                <span className="text-red-600 tabular-nums">{formatCurrency(est.expenses ?? 0)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 4: DRE MENSAL
// ═══════════════════════════════════════════════════════════════════════════════
