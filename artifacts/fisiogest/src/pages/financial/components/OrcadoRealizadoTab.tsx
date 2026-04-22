import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, Loader2, Repeat } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authHeaders, formatCurrency } from "../utils";
import { MONTH_NAMES } from "../constants";
import { KpiCard } from "./KpiCard";
import { MetricStrip } from "./MetricStrip";

export function OrcadoRealizadoTab({ month, year }: { month: number; year: number }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            </div>
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
            <p className={`text-3xl font-extrabold tabular-nums ${(cur.netProfit ?? 0) >= 0 ? "text-emerald-700" : "text-red-700"}`}>
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

