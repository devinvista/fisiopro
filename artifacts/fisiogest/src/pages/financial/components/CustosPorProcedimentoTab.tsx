import { useState, useEffect, useCallback } from "react";
import { Activity, AlertCircle, BarChart3, Clock, Loader2, Target, TrendingDown } from "lucide-react";
import {
  BarChart, Bar, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authHeaders, formatCurrency } from "../utils";
import { MONTH_NAMES } from "../constants";
import { KpiCard } from "./KpiCard";

export function CustosPorProcedimentoTab({ month, year }: { month: number; year: number }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/financial/cost-per-procedure?month=${month}&year=${year}`, { headers: authHeaders() });
      if (res.ok) setData(await res.json());
    } catch { }
    finally { setLoading(false); }
  }, [month, year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const procedures = data?.procedures ?? [];
  const hasData = procedures.length > 0;

  const chartData = procedures
    .filter((p: any) => p.price > 0)
    .map((p: any) => ({
      name: p.name.length > 18 ? p.name.slice(0, 16) + "…" : p.name,
      preço: p.price,
      custoEstimado: p.estimatedTotalCostPerSession,
      custoReal: p.realTotalCostPerSession,
      margemEst: Math.max(0, p.estimatedMarginPerSession),
      margemReal: Math.max(0, p.realMarginPerSession),
    }));

  if (loading) return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 border border-slate-100">
            <div className="h-3 w-20 bg-slate-100 animate-pulse rounded mb-3" />
            <div className="h-7 w-24 bg-slate-100 animate-pulse rounded" />
          </div>
        ))}
      </div>
      <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Despesas Reais (mês)" value={formatCurrency(data?.totalRealOverhead ?? 0)} icon={<TrendingDown className="w-4 h-4" />} accentColor="#ef4444" />
        <KpiCard label="Despesas Estimadas" value={formatCurrency(data?.totalEstimatedOverhead ?? 0)} icon={<Target className="w-4 h-4" />} accentColor="#f59e0b" />
        <KpiCard label="Horas Disponíveis" value={`${data?.totalAvailableHours ?? 0}h`} icon={<Clock className="w-4 h-4" />} accentColor="#0ea5e9" />
        <KpiCard label="Custo/Hora Real" value={formatCurrency(data?.realCostPerHour ?? 0)} icon={<Activity className="w-4 h-4" />} accentColor="#8b5cf6" sub={`Estimado: ${formatCurrency(data?.estCostPerHour ?? 0)}/h`} />
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <Card className="border border-slate-100 shadow-sm rounded-2xl bg-white">
          <CardHeader>
            <CardTitle className="text-base font-bold text-slate-800">Preço vs Custo por Procedimento</CardTitle>
            <p className="text-xs text-slate-400">Comparação de preço de venda com custo estimado e custo real rateado</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(v) => `R$${v}`} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v: number) => formatCurrency(v)}
                  contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 8px 32px rgba(0,0,0,0.12)", fontSize: "12px" }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="preço" name="Preço" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="custoEstimado" name="Custo Estimado" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="custoReal" name="Custo Real" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card className="border border-slate-100 shadow-sm rounded-2xl overflow-hidden bg-white">
        <CardHeader>
          <CardTitle className="text-base font-bold text-slate-800">Análise Detalhada por Procedimento</CardTitle>
          <p className="text-xs text-slate-400">{MONTH_NAMES[month - 1]} {year} · Margem = Preço − Custo Direto − Overhead Rateado</p>
        </CardHeader>
        <CardContent className="p-0">
          {!hasData ? (
            <div className="py-14 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-slate-100 flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-500">Nenhum procedimento encontrado</p>
              <p className="text-xs text-slate-400 mt-1">Cadastre procedimentos para ver a análise de custos</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100">
                    <th className="py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Procedimento</th>
                    <th className="py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Preço</th>
                    <th className="py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Custo Direto</th>
                    <th className="py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right hidden md:table-cell">Overhead Est.</th>
                    <th className="py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Custo Total</th>
                    <th className="py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right hidden lg:table-cell">Custo Real</th>
                    <th className="py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Margem Est.</th>
                    <th className="py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right hidden lg:table-cell">Margem Real</th>
                    <th className="py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right hidden md:table-cell">Sessões</th>
                    <th className="py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right hidden md:table-cell">Receita</th>
                  </tr>
                </thead>
                <tbody>
                  {procedures.map((p: any) => {
                    const marginOk = p.estimatedMarginPct >= 30;
                    const marginWarn = p.estimatedMarginPct >= 10 && p.estimatedMarginPct < 30;
                    return (
                      <tr key={p.procedureId} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{p.name}</p>
                            <p className="text-[11px] text-slate-400">{p.category} · {p.durationMinutes}min</p>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm font-bold text-slate-800 text-right tabular-nums">{formatCurrency(p.price)}</td>
                        <td className="py-3 px-4 text-sm text-slate-500 text-right tabular-nums">{formatCurrency(p.estimatedDirectCost)}</td>
                        <td className="py-3 px-4 text-sm text-slate-500 text-right hidden md:table-cell tabular-nums">{formatCurrency(p.estimatedOverheadPerSession)}</td>
                        <td className="py-3 px-4 text-sm font-semibold text-amber-700 text-right tabular-nums">{formatCurrency(p.estimatedTotalCostPerSession)}</td>
                        <td className="py-3 px-4 text-sm font-semibold text-red-600 text-right hidden lg:table-cell tabular-nums">{formatCurrency(p.realTotalCostPerSession)}</td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex flex-col items-end gap-0.5">
                            <span className={`text-sm font-bold tabular-nums ${marginOk ? "text-emerald-600" : marginWarn ? "text-amber-600" : "text-red-600"}`}>
                              {formatCurrency(p.estimatedMarginPerSession)}
                            </span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${marginOk ? "bg-emerald-100 text-emerald-700" : marginWarn ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                              {p.estimatedMarginPct.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right hidden lg:table-cell">
                          <div className="flex flex-col items-end gap-0.5">
                            <span className={`text-sm font-bold tabular-nums ${p.realMarginPerSession >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                              {formatCurrency(p.realMarginPerSession)}
                            </span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${p.realMarginPct >= 30 ? "bg-emerald-100 text-emerald-700" : p.realMarginPct >= 10 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                              {p.realMarginPct.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm text-center hidden md:table-cell">
                          <span className="text-slate-700 font-medium">{p.completedSessions}</span>
                          <span className="text-slate-300 text-xs">/{p.scheduledSessions}</span>
                        </td>
                        <td className="py-3 px-4 text-sm font-semibold text-emerald-600 text-right hidden md:table-cell tabular-nums">
                          {p.revenueGenerated > 0 ? formatCurrency(p.revenueGenerated) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-2xl p-4 text-xs text-blue-700">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-blue-500" />
        <div>
          <strong>Como funciona o rateio:</strong> O custo overhead por hora é calculado dividindo o total de despesas pagas no mês pelas horas clínicas disponíveis (baseado nos horários de funcionamento cadastrados). Esse valor é então multiplicado pela duração de cada procedimento.
          Configure as <strong>Despesas Fixas</strong> para obter estimativas mais precisas.
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3: ORÇADO VS REALIZADO
// ═══════════════════════════════════════════════════════════════════════════════

