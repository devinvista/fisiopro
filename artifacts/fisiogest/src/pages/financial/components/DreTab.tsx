import { useState, useEffect, useCallback } from "react";
import {
  ArrowDownRight, ArrowUpRight, DollarSign, Loader2, PiggyBank, Repeat,
  TrendingDown, TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authHeaders, formatCurrency } from "../utils";
import { MONTH_NAMES } from "../constants";
import { KpiCard } from "./KpiCard";
import { MetricStrip } from "./MetricStrip";

export function DreTab({ month, year }: { month: number; year: number }) {
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
  const prev = data?.previous ?? {};
  const variance = data?.variance ?? {};

  function ChangeChip({ value, inverted }: { value: number; inverted?: boolean }) {
    const positive = inverted ? value <= 0 : value >= 0;
    if (value === 0) return <span className="text-[10px] text-slate-300 font-medium">—</span>;
    return (
      <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${positive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
        {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
        {value >= 0 ? "+" : ""}{value.toFixed(1)}%
      </span>
    );
  }

  function DreRow({ label, current, previous, estimated, isTotal, isSubtotal, isNegative, indent }: {
    label: string; current: number; previous?: number; estimated?: number;
    isTotal?: boolean; isSubtotal?: boolean; isNegative?: boolean; indent?: boolean;
  }) {
    const pctChange = previous && previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : 0;
    const executionPct = estimated && estimated !== 0 ? (current / estimated) * 100 : null;
    return (
      <tr className={`border-b border-slate-50 ${isTotal ? "bg-primary/5" : isSubtotal ? "bg-slate-50/80" : "hover:bg-slate-50/40"} transition-colors`}>
        <td className={`py-3 px-5 text-sm ${indent ? "pl-10 text-slate-400 font-normal" : isTotal ? "font-extrabold text-slate-900" : isSubtotal ? "font-bold text-slate-700" : "text-slate-600"}`}>
          {label}
        </td>
        {estimated !== undefined && (
          <td className="py-3 px-4 text-sm text-right text-slate-400 tabular-nums">{formatCurrency(estimated)}</td>
        )}
        {previous !== undefined && (
          <td className="py-3 px-4 text-sm text-right text-slate-400 tabular-nums">{formatCurrency(previous)}</td>
        )}
        <td className={`py-3 px-5 text-sm text-right font-semibold tabular-nums ${isTotal ? (current >= 0 ? "text-primary font-extrabold" : "text-red-600 font-extrabold") : isNegative ? "text-red-600" : current < 0 ? "text-red-600" : "text-slate-800"}`}>
          {isNegative && current > 0 ? `(${formatCurrency(current)})` : formatCurrency(current)}
        </td>
        {previous !== undefined && (
          <td className="py-3 px-4 text-right">
            <ChangeChip value={pctChange} inverted={isNegative} />
          </td>
        )}
        {executionPct !== null && (
          <td className="py-3 px-4 text-right">
            <div className="flex items-center justify-end gap-1.5">
              <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${executionPct >= 90 ? "bg-emerald-500" : executionPct >= 60 ? "bg-amber-400" : "bg-red-400"}`}
                  style={{ width: `${Math.min(100, executionPct)}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-400">{executionPct.toFixed(0)}%</span>
            </div>
          </td>
        )}
      </tr>
    );
  }

  const hasEstimated = est.revenue > 0 || est.expenses > 0;
  const hasPrev = prev.grossRevenue !== undefined;

  return (
    <div className="space-y-6">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Receita Bruta"
          value={formatCurrency(cur.grossRevenue ?? 0)}
          icon={<TrendingUp className="w-4 h-4" />}
          accentColor="#10b981"
          trend={hasPrev && prev.grossRevenue ? { value: ((cur.grossRevenue - prev.grossRevenue) / Math.abs(prev.grossRevenue)) * 100 } : undefined}
        />
        <KpiCard
          label="Total Despesas"
          value={formatCurrency(cur.totalExpenses ?? 0)}
          icon={<TrendingDown className="w-4 h-4" />}
          accentColor="#ef4444"
          trend={hasPrev && prev.totalExpenses ? { value: ((cur.totalExpenses - prev.totalExpenses) / Math.abs(prev.totalExpenses)) * 100 } : undefined}
        />
        <KpiCard
          label="Resultado Líquido"
          value={formatCurrency(cur.netProfit ?? 0)}
          icon={<DollarSign className="w-4 h-4" />}
          accentColor="#6366f1"
          trend={variance.netProfitChangeVsPrevMonth ? { value: variance.netProfitChangeVsPrevMonth } : undefined}
        />
        <KpiCard
          label="Margem Líquida"
          value={`${cur.netMarginPct?.toFixed(1) ?? 0}%`}
          icon={<PiggyBank className="w-4 h-4" />}
          accentColor="#8b5cf6"
          sub="Meta: ≥ 20%"
        />
      </div>

      {/* DRE Table */}
      <Card className="border border-slate-100 shadow-sm rounded-2xl overflow-hidden bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-bold text-slate-800">Demonstrativo de Resultado</CardTitle>
          <p className="text-xs text-slate-400">{MONTH_NAMES[month - 1]} {year}</p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200">
                  <th className="py-2.5 px-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Item</th>
                  {hasEstimated && <th className="py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Orçado</th>}
                  {hasPrev && <th className="py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Mês Ant.</th>}
                  <th className="py-2.5 px-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Realizado</th>
                  {hasPrev && <th className="py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Variação</th>}
                  {hasEstimated && <th className="py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Execução</th>}
                </tr>
              </thead>
              <tbody>
                <DreRow
                  label="(+) Receita Bruta"
                  current={cur.grossRevenue ?? 0}
                  previous={hasPrev ? prev.grossRevenue : undefined}
                  estimated={hasEstimated ? est.revenue : undefined}
                  isSubtotal
                />
                {(cur.expensesByCategory ?? []).map((cat: any) => (
                  <DreRow key={cat.category} label={cat.category} current={cat.amount} indent isNegative />
                ))}
                {(cur.expensesByCategory ?? []).length > 0 && (
                  <DreRow
                    label="(−) Total Despesas"
                    current={cur.totalExpenses ?? 0}
                    previous={hasPrev ? prev.totalExpenses : undefined}
                    estimated={hasEstimated ? est.expenses : undefined}
                    isSubtotal
                    isNegative
                  />
                )}
                <DreRow
                  label="(=) Resultado Líquido"
                  current={cur.netProfit ?? 0}
                  previous={hasPrev ? prev.netProfit : undefined}
                  estimated={hasEstimated ? est.netProfit : undefined}
                  isTotal
                />
              </tbody>
            </table>
          </div>

          {/* Margin footer */}
          <div className={`grid gap-px bg-slate-100 border-t border-slate-200 ${hasEstimated && hasPrev ? "grid-cols-3" : hasEstimated || hasPrev ? "grid-cols-2" : "grid-cols-1"}`}>
            {hasEstimated && (
              <div className="bg-white py-3 px-5 text-center">
                <p className="text-[10px] text-slate-400 uppercase tracking-widest">Margem Estimada</p>
                <p className="text-base font-bold text-slate-500 mt-0.5 tabular-nums">
                  {est.revenue > 0 ? ((est.netProfit / est.revenue) * 100).toFixed(1) : 0}%
                </p>
              </div>
            )}
            {hasPrev && (
              <div className="bg-white py-3 px-5 text-center">
                <p className="text-[10px] text-slate-400 uppercase tracking-widest">Margem Anterior</p>
                <p className="text-base font-bold text-slate-500 mt-0.5 tabular-nums">{prev.netMarginPct?.toFixed(1) ?? 0}%</p>
              </div>
            )}
            <div className={`py-3 px-5 text-center ${(cur.netMarginPct ?? 0) >= 20 ? "bg-emerald-50" : (cur.netMarginPct ?? 0) >= 10 ? "bg-amber-50" : "bg-red-50"}`}>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest">Margem Realizada</p>
              <p className={`text-base font-bold mt-0.5 tabular-nums ${(cur.netMarginPct ?? 0) >= 20 ? "text-emerald-700" : (cur.netMarginPct ?? 0) >= 10 ? "text-amber-700" : "text-red-700"}`}>
                {cur.netMarginPct?.toFixed(1) ?? 0}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recurring expenses breakdown */}
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
// TAB 5: DESPESAS FIXAS RECORRENTES
// ═══════════════════════════════════════════════════════════════════════════════

