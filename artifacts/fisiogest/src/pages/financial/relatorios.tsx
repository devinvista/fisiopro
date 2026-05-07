import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users, TrendingUp, TrendingDown, BarChart3,
  AlertTriangle, CheckCircle2, CalendarDays, Stethoscope,
  Target, DollarSign, Activity, Layers, BookOpen, Flame,
} from "lucide-react";

import { KpiCard } from "./components/KpiCard";
import { ChartSkeleton } from "./relatorios/ChartSkeleton";
import { CustomTooltipContent } from "./relatorios/CustomTooltipContent";
import { MONTH_NAMES, CATEGORY_COLORS, formatCurrency, authFetch } from "./relatorios/constants";
import type { MonthlyRevenue, ProcedureRevenue, ScheduleOccupation, CategoryRevenue } from "./relatorios/types";

import { DreTab } from "./components/DreTab";
import { OrcadoRealizadoTab } from "./components/OrcadoRealizadoTab";
import { CustosPorProcedimentoTab } from "./components/CustosPorProcedimentoTab";
import { DreByProcedureTab } from "./components/DreByProcedureTab";
import { DiagnosticoTab } from "./components/DiagnosticoTab";
import { ConferenciaContabilTab } from "./components/ConferenciaContabilTab";
import { SazonalidadeTab } from "./components/SazonalidadeTab";
import { useAuth } from "@/hooks/use-auth";
import type { Feature } from "@/utils/plan-features";

const YEARS_LIST = (() => {
  const y = new Date().getFullYear();
  return [y - 1, y, y + 1];
})();

interface TabDef {
  value: string;
  icon: React.ReactNode;
  label: string;
  feature?: Feature;
}

const ALL_TABS: TabDef[] = [
  { value: "desempenho",       icon: <BarChart3 className="w-3.5 h-3.5" />,    label: "Desempenho",          feature: "financial.view.simple" },
  { value: "sazonalidade",     icon: <Flame className="w-3.5 h-3.5" />,        label: "Sazonalidade",        feature: "financial.view.simple" },
  { value: "dre",              icon: <Activity className="w-3.5 h-3.5" />,     label: "DRE Mensal",          feature: "financial.view.dre" },
  { value: "orcado",           icon: <Target className="w-3.5 h-3.5" />,       label: "Orçado vs Realizado", feature: "financial.view.budget" },
  { value: "custos",           icon: <DollarSign className="w-3.5 h-3.5" />,   label: "Custo/Procedimento",  feature: "financial.cost_per_procedure" },
  { value: "dre-procedimento", icon: <Layers className="w-3.5 h-3.5" />,       label: "DRE/Procedimento",    feature: "financial.view.accounting" },
  { value: "diagnostico",      icon: <Stethoscope className="w-3.5 h-3.5" />,  label: "Diagnóstico",         feature: "financial.view.accounting" },
  { value: "conferencia",      icon: <BookOpen className="w-3.5 h-3.5" />,     label: "Conferência Contábil", feature: "financial.view.accounting" },
];

// ─── Desempenho Tab ───────────────────────────────────────────────────────────
function DesempenhoTab({
  selectedMonth,
  selectedYear,
}: {
  selectedMonth: string;
  selectedYear: string;
}) {
  const { data: monthlyRevenueRaw, isLoading: loadingMonthly } = useQuery<MonthlyRevenue[]>({
    queryKey: ["reports-monthly-revenue", selectedYear],
    queryFn: () => authFetch(`/api/reports/monthly-revenue?year=${selectedYear}`).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }),
  });
  const monthlyRevenue: MonthlyRevenue[] = Array.isArray(monthlyRevenueRaw) ? monthlyRevenueRaw : [];

  const { data: procedureRevenueRaw, isLoading: loadingProcedure } = useQuery<ProcedureRevenue[]>({
    queryKey: ["reports-procedure-revenue", selectedMonth, selectedYear],
    queryFn: () => authFetch(`/api/reports/procedure-revenue?month=${selectedMonth}&year=${selectedYear}`).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }),
  });
  const procedureRevenue: ProcedureRevenue[] = Array.isArray(procedureRevenueRaw) ? procedureRevenueRaw : [];

  const { data: scheduleOccupation, isLoading: loadingOccupation } = useQuery<ScheduleOccupation>({
    queryKey: ["reports-schedule-occupation", selectedMonth, selectedYear],
    queryFn: () => authFetch(`/api/reports/schedule-occupation?month=${selectedMonth}&year=${selectedYear}`).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }),
  });

  const categoryRevenue = useMemo<CategoryRevenue[]>(() => {
    const map = new Map<string, CategoryRevenue>();
    for (const p of procedureRevenue.filter(p => Number(p.totalSessions) > 0)) {
      const cat = p.category || "Outros";
      const existing = map.get(cat) ?? { category: cat, revenue: 0, sessions: 0 };
      existing.revenue += Number(p.totalRevenue);
      existing.sessions += Number(p.totalSessions);
      map.set(cat, existing);
    }
    return [...map.values()].sort((a, b) => b.revenue - a.revenue);
  }, [procedureRevenue]);

  const totalCategoryRevenue = categoryRevenue.reduce((s, c) => s + c.revenue, 0);

  const annualTotals = useMemo(() => {
    return monthlyRevenue.reduce((acc, m) => ({
      revenue: acc.revenue + Number(m.revenue),
      expenses: acc.expenses + Number(m.expenses),
      profit: acc.profit + Number(m.profit),
    }), { revenue: 0, expenses: 0, profit: 0 });
  }, [monthlyRevenue]);

  const bestMonth = useMemo(() => {
    if (!monthlyRevenue.length) return null;
    return monthlyRevenue.reduce((best, m) => Number(m.revenue) > Number(best.revenue) ? m : best, monthlyRevenue[0]);
  }, [monthlyRevenue]);

  const chartMonthlyData = monthlyRevenue.map(m => ({
    ...m,
    monthName: m.monthName.substring(0, 3),
    revenue: Number(m.revenue),
    expenses: Number(m.expenses),
    profit: Number(m.profit),
  }));

  const monthLabel = MONTH_NAMES[parseInt(selectedMonth, 10) - 1];
  const activeProcedures = procedureRevenue.filter(p => Number(p.totalSessions) > 0);

  return (
    <div className="space-y-7">

      {/* ── Totais Anuais ─────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
            Acumulado {selectedYear}
          </p>
          {!loadingMonthly && annualTotals.revenue > 0 && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${annualTotals.profit >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
              {annualTotals.profit >= 0 ? "+" : ""}{formatCurrency(annualTotals.profit)} resultado anual
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <KpiCard
            label="Receita Total"
            value={formatCurrency(annualTotals.revenue)}
            icon={<TrendingUp className="w-4 h-4" />}
            accentColor="#10b981"
            loading={loadingMonthly}
            sub={bestMonth ? `Melhor mês: ${bestMonth.monthName.substring(0, 3)}` : undefined}
          />
          <KpiCard
            label="Despesas Totais"
            value={formatCurrency(annualTotals.expenses)}
            icon={<TrendingDown className="w-4 h-4" />}
            accentColor="#ef4444"
            loading={loadingMonthly}
            sub={annualTotals.revenue > 0 ? `${((annualTotals.expenses / annualTotals.revenue) * 100).toFixed(0)}% da receita` : undefined}
          />
          <KpiCard
            label="Lucro Líquido"
            value={formatCurrency(annualTotals.profit)}
            icon={<DollarSign className="w-4 h-4" />}
            accentColor="#6366f1"
            loading={loadingMonthly}
            sub={annualTotals.revenue > 0 ? `Margem: ${((annualTotals.profit / annualTotals.revenue) * 100).toFixed(1)}%` : undefined}
          />
          <KpiCard
            label="Meses com Lucro"
            value={String(monthlyRevenue.filter(m => Number(m.profit) > 0).length)}
            icon={<CheckCircle2 className="w-4 h-4" />}
            accentColor="#8b5cf6"
            loading={loadingMonthly}
            sub={`de ${monthlyRevenue.length} meses com dados`}
          />
        </div>
      </section>

      {/* ── Faturamento Mensal Chart ──────────────────────────────────── */}
      <Card className="border border-slate-100 shadow-sm rounded-2xl bg-white overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-bold text-slate-800">Faturamento Mensal</CardTitle>
              <p className="text-xs text-slate-400 mt-0.5">Receitas, despesas e lucro ao longo de {selectedYear}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 pb-4">
          {loadingMonthly ? (
            <div className="px-4"><ChartSkeleton height={280} /></div>
          ) : monthlyRevenue.length === 0 ? (
            <div className="py-14 text-center">
              <BarChart3 className="w-10 h-10 mx-auto mb-3 text-slate-200" />
              <p className="text-sm font-medium text-slate-400">Sem dados para {selectedYear}</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartMonthlyData} margin={{ top: 16, right: 24, left: 8, bottom: 0 }} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="monthName" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={8} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={52} />
                <Tooltip content={<CustomTooltipContent />} cursor={{ fill: "#f8fafc", radius: 4 }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8, paddingLeft: 16 }} />
                <Bar dataKey="revenue" name="Receita" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={28} />
                <Bar dataKey="expenses" name="Despesas" fill="#ef4444" radius={[3, 3, 0, 0]} maxBarSize={28} />
                <Bar dataKey="profit" name="Lucro" fill="#6366f1" radius={[3, 3, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Indicadores do Período ────────────────────────────────────── */}
      <section>
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
          Período — {monthLabel}/{selectedYear}
        </p>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <KpiCard
            label="Receita do Mês"
            value={formatCurrency(totalCategoryRevenue)}
            icon={<BarChart3 className="w-4 h-4" />}
            accentColor="#10b981"
            loading={loadingProcedure}
            sub={`${activeProcedures.length} procedimento(s) realizados`}
          />
          <KpiCard
            label="Taxa de Ocupação"
            value={scheduleOccupation ? `${scheduleOccupation.occupationRate.toFixed(0)}%` : "—"}
            icon={<Target className="w-4 h-4" />}
            accentColor={
              !scheduleOccupation ? "#94a3b8"
                : scheduleOccupation.occupationRate >= 80 ? "#10b981"
                  : scheduleOccupation.occupationRate >= 60 ? "#f59e0b"
                    : "#ef4444"
            }
            loading={loadingOccupation}
            sub={scheduleOccupation ? `${scheduleOccupation.occupiedSlots} de ${scheduleOccupation.totalSlots} slots` : undefined}
          />
          <KpiCard
            label="Taxa de Faltas"
            value={scheduleOccupation ? `${scheduleOccupation.noShowRate?.toFixed(0) ?? 0}%` : "—"}
            icon={<AlertTriangle className="w-4 h-4" />}
            accentColor="#f59e0b"
            loading={loadingOccupation}
            sub={scheduleOccupation ? `${scheduleOccupation.noShowCount} falta(s) no período` : undefined}
          />
          <KpiCard
            label="Pacientes Ativos"
            value={scheduleOccupation ? String(scheduleOccupation.activePatients ?? 0) : "—"}
            icon={<Users className="w-4 h-4" />}
            accentColor="#0ea5e9"
            loading={loadingOccupation}
          />
        </div>
      </section>

      {/* ── Receita por Categoria + Ocupação Grid ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Category revenue */}
        <Card className="border border-slate-100 shadow-sm rounded-2xl bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold text-slate-800">Receita por Categoria</CardTitle>
            <p className="text-xs text-slate-400 mt-0.5">Distribuição por tipo de procedimento — {monthLabel}/{selectedYear}</p>
          </CardHeader>
          <CardContent>
            {loadingProcedure ? (
              <div className="space-y-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex justify-between">
                      <div className="h-3.5 w-24 bg-slate-100 animate-pulse rounded" />
                      <div className="h-3.5 w-16 bg-slate-100 animate-pulse rounded" />
                    </div>
                    <div className="h-2 bg-slate-100 animate-pulse rounded-full" />
                  </div>
                ))}
              </div>
            ) : categoryRevenue.length === 0 ? (
              <div className="py-10 text-center">
                <BarChart3 className="w-10 h-10 mx-auto mb-3 text-slate-200" />
                <p className="text-sm font-medium text-slate-400">Sem dados para o período</p>
                <p className="text-xs text-slate-300 mt-1">Registre atendimentos para visualizar a distribuição</p>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-start gap-6">
                <div className="shrink-0 mx-auto sm:mx-0">
                  <ResponsiveContainer width={160} height={160}>
                    <PieChart>
                      <Pie data={categoryRevenue} dataKey="revenue" nameKey="category" cx="50%" cy="50%" innerRadius={46} outerRadius={72} paddingAngle={3} strokeWidth={0}>
                        {categoryRevenue.map((_, i) => (
                          <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 8px 32px rgba(0,0,0,0.12)", fontSize: "12px" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 min-w-0 w-full space-y-2.5">
                  {categoryRevenue.map((cat, i) => {
                    const pct = totalCategoryRevenue > 0 ? (cat.revenue / totalCategoryRevenue) * 100 : 0;
                    const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
                    return (
                      <div key={cat.category}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                            <span className="text-xs font-semibold text-slate-700 capitalize truncate">{cat.category}</span>
                            <span className="text-[10px] text-slate-400 shrink-0">{cat.sessions} sess.</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <span className="text-[10px] font-bold text-slate-400 tabular-nums">{pct.toFixed(0)}%</span>
                            <span className="text-xs font-bold text-slate-800 tabular-nums">{formatCurrency(cat.revenue)}</span>
                          </div>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5">
                          <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
                        </div>
                      </div>
                    );
                  })}
                  <div className="pt-2 mt-1 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">Total do período</span>
                    <span className="text-sm font-extrabold text-indigo-600 tabular-nums">{formatCurrency(totalCategoryRevenue)}</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Occupation grid */}
        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
            Ocupação da Agenda — {monthLabel}/{selectedYear}
          </p>
          {loadingOccupation ? (
            <div className="grid grid-cols-3 gap-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4">
                  <div className="h-3 w-12 bg-slate-100 animate-pulse rounded mb-3" />
                  <div className="h-8 w-16 bg-slate-100 animate-pulse rounded" />
                </div>
              ))}
            </div>
          ) : scheduleOccupation ? (
            <div className="grid grid-cols-3 gap-3 flex-1">
              {[
                {
                  label: "Ocupação",
                  value: `${scheduleOccupation.occupationRate.toFixed(0)}%`,
                  sub: null,
                  accent: scheduleOccupation.occupationRate >= 80 ? "#10b981" : scheduleOccupation.occupationRate >= 60 ? "#f59e0b" : "#ef4444",
                  textClass: scheduleOccupation.occupationRate >= 80 ? "text-emerald-600" : scheduleOccupation.occupationRate >= 60 ? "text-amber-600" : "text-red-600",
                  bar: scheduleOccupation.occupationRate,
                },
                {
                  label: "Agendamentos",
                  value: String(scheduleOccupation.totalSlots),
                  sub: `${scheduleOccupation.occupiedSlots} realizados`,
                  accent: "#94a3b8",
                  textClass: "text-slate-800",
                  bar: null,
                },
                {
                  label: "Taxa Faltas",
                  value: `${scheduleOccupation.noShowRate?.toFixed(0) ?? 0}%`,
                  sub: null,
                  accent: "#f59e0b",
                  textClass: "text-amber-600",
                  bar: null,
                },
                {
                  label: "Faltas",
                  value: String(scheduleOccupation.noShowCount),
                  sub: "no-show",
                  accent: "#f59e0b",
                  textClass: "text-amber-600",
                  bar: null,
                },
                {
                  label: "Cancelados",
                  value: String(scheduleOccupation.canceledCount),
                  sub: "no período",
                  accent: "#f87171",
                  textClass: "text-red-600",
                  bar: null,
                },
                {
                  label: "Pac. Ativos",
                  value: String(scheduleOccupation.activePatients ?? 0),
                  sub: "no período",
                  accent: "#38bdf8",
                  textClass: "text-sky-600",
                  bar: null,
                },
              ].map((item) => (
                <div key={item.label} className="relative bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ backgroundColor: item.accent }} />
                  <div className="pl-4 pr-3 py-4 text-center">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">{item.label}</p>
                    <p className={`text-2xl font-extrabold tabular-nums ${item.textClass}`}>{item.value}</p>
                    {item.bar !== null && (
                      <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${item.bar}%`, backgroundColor: item.accent }} />
                      </div>
                    )}
                    {item.sub && <p className="text-[9px] text-slate-400 mt-1">{item.sub}</p>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Card className="border border-dashed border-slate-200 shadow-none rounded-2xl bg-slate-50 flex-1">
              <CardContent className="py-10 text-center">
                <CalendarDays className="w-10 h-10 mx-auto mb-3 text-slate-200" />
                <p className="text-sm font-medium text-slate-400">Sem dados de ocupação para o período</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
function MonthNavigator({
  month, year, onMonthChange, onYearChange,
}: {
  month: number; year: number;
  onMonthChange: (m: number) => void;
  onYearChange: (y: number) => void;
}) {
  const goBack = () => {
    if (month === 1) { onMonthChange(12); onYearChange(year - 1); }
    else onMonthChange(month - 1);
  };
  const goForward = () => {
    if (month === 12) { onMonthChange(1); onYearChange(year + 1); }
    else onMonthChange(month + 1);
  };
  const isCurrentMonth = month === new Date().getMonth() + 1 && year === new Date().getFullYear();

  return (
    <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl shadow-sm px-1 py-1">
      <button
        onClick={goBack}
        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
      >
        <span className="text-sm font-bold">‹</span>
      </button>
      <div className="px-2 min-w-[120px] text-center">
        <span className="text-sm font-semibold text-slate-800">
          {MONTH_NAMES[month - 1]} {year}
        </span>
      </div>
      <button
        onClick={goForward}
        disabled={isCurrentMonth}
        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <span className="text-sm font-bold">›</span>
      </button>
    </div>
  );
}

export default function Contabil() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);
  const selectedMonth = String(month);
  const selectedYear = String(year);

  const { hasFeature } = useAuth();
  const visibleTabs = ALL_TABS.filter((t) => !t.feature || hasFeature(t.feature));
  const [activeTab, setActiveTab] = useState<string>(() => visibleTabs[0]?.value ?? "desempenho");

  return (
    <AppLayout title="Relatórios">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Relatórios</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Indicadores gerenciais, DRE, orçamento e análises contábeis
          </p>
        </div>

        <MonthNavigator
          month={month}
          year={year}
          onMonthChange={setMonth}
          onYearChange={setYear}
        />
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="relative mb-6">
          <div className="overflow-x-auto pr-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabsList className="inline-flex bg-slate-100/80 rounded-xl p-1 gap-1 h-auto min-w-max">
              {visibleTabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="flex items-center gap-1.5 rounded-lg text-xs font-semibold px-4 py-2 text-slate-500 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm transition-all whitespace-nowrap"
                >
                  {tab.icon}
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <div className="pointer-events-none absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-background to-transparent sm:hidden" />
        </div>

        {hasFeature("financial.view.simple") && (
          <TabsContent value="desempenho">
            <DesempenhoTab selectedMonth={selectedMonth} selectedYear={selectedYear} />
          </TabsContent>
        )}
        {hasFeature("financial.view.simple") && (
          <TabsContent value="sazonalidade">
            <SazonalidadeTab selectedYear={selectedYear} selectedMonth={selectedMonth} />
          </TabsContent>
        )}
        {hasFeature("financial.view.dre") && (
          <TabsContent value="dre">
            <DreTab month={month} year={year} />
          </TabsContent>
        )}
        {hasFeature("financial.view.budget") && (
          <TabsContent value="orcado">
            <OrcadoRealizadoTab month={month} year={year} />
          </TabsContent>
        )}
        {hasFeature("financial.cost_per_procedure") && (
          <TabsContent value="custos">
            <CustosPorProcedimentoTab month={month} year={year} />
          </TabsContent>
        )}
        {hasFeature("financial.view.accounting") && (
          <TabsContent value="dre-procedimento">
            <DreByProcedureTab />
          </TabsContent>
        )}
        {hasFeature("financial.view.accounting") && (
          <TabsContent value="diagnostico">
            <DiagnosticoTab />
          </TabsContent>
        )}
        {hasFeature("financial.view.accounting") && (
          <TabsContent value="conferencia">
            <ConferenciaContabilTab month={month} year={year} />
          </TabsContent>
        )}
      </Tabs>
    </AppLayout>
  );
}
