import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Area, AreaChart,
} from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users, TrendingUp, TrendingDown, Calendar, BarChart3, Clock,
  AlertTriangle, CheckCircle2, XCircle, Activity, CalendarDays,
  ArrowUpRight, ArrowDownRight, Stethoscope, Target, DollarSign,
} from "lucide-react";

// ─── Auth helper ──────────────────────────────────────────────────────────────
function authFetch(url: string): Promise<Response> {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("fisiogest_token") : null;
  return fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const CATEGORY_COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ec4899", "#0ea5e9", "#8b5cf6", "#14b8a6", "#f97316",
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface MonthlyRevenue {
  month: number;
  monthName: string;
  revenue: number;
  expenses: number;
  profit: number;
}

interface ProcedureRevenue {
  procedureId: number;
  procedureName: string;
  category: string;
  totalRevenue: number;
  totalSessions: number;
  averageTicket: number;
}

interface ScheduleOccupation {
  totalSlots: number;
  occupiedSlots: number;
  occupationRate: number;
  canceledCount: number;
  noShowCount: number;
  noShowRate: number;
  activePatients: number;
  byDayOfWeek: { dayOfWeek: string; count: number }[];
}

interface CategoryRevenue {
  category: string;
  revenue: number;
  sessions: number;
}

// ─── KPI Card (same system as financial page) ─────────────────────────────────
function KpiCard({
  label, value, icon, accentColor = "#6366f1", loading, sub, trend, size = "md",
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accentColor?: string;
  loading?: boolean;
  sub?: string;
  trend?: { value: number; label?: string };
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div className="relative bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-shadow duration-200">
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ backgroundColor: accentColor }} />
      <div className="pl-5 pr-4 py-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest leading-tight">{label}</p>
          <div className="p-2 rounded-xl shrink-0 opacity-80" style={{ backgroundColor: `${accentColor}18`, color: accentColor }}>
            {icon}
          </div>
        </div>
        <div className="mt-2">
          {loading ? (
            <div className="space-y-1.5">
              <div className="h-7 w-28 bg-slate-100 animate-pulse rounded-lg" />
              <div className="h-3 w-16 bg-slate-100 animate-pulse rounded" />
            </div>
          ) : (
            <>
              <p className={`font-bold text-slate-900 tabular-nums ${size === "lg" ? "text-3xl" : size === "sm" ? "text-lg" : "text-2xl"}`}>
                {value}
              </p>
              {trend && (
                <div className={`flex items-center gap-1 mt-1 text-xs font-semibold ${trend.value >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {trend.value >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                  {Math.abs(trend.value).toFixed(1)}%
                  <span className="text-slate-400 font-normal">{trend.label ?? "vs período anterior"}</span>
                </div>
              )}
              {sub && !trend && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────
function ChartSkeleton({ height = 280 }: { height?: number }) {
  return (
    <div className="w-full animate-pulse" style={{ height }}>
      <div className="flex items-end gap-3 h-full px-4 pb-6 pt-4">
        {[65, 45, 80, 55, 70, 40, 90, 60, 75, 50, 85, 65].map((h, i) => (
          <div key={i} className="flex-1 bg-slate-100 rounded-t-lg" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
function CustomTooltipContent({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-100 rounded-xl shadow-xl p-3 text-xs min-w-[140px]">
      <p className="font-semibold text-slate-700 mb-2">{label}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
            <span className="text-slate-500">{entry.name}</span>
          </div>
          <span className="font-semibold text-slate-800">
            {typeof entry.value === "number" && entry.value > 100
              ? formatCurrency(entry.value)
              : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Relatorios() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [selectedMonth, setSelectedMonth] = useState(String(currentMonth));

  // ── Data fetching ──
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

  // ── Derived data ──
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

  // Annual totals from monthly data
  const annualTotals = useMemo(() => {
    return monthlyRevenue.reduce((acc, m) => ({
      revenue: acc.revenue + Number(m.revenue),
      expenses: acc.expenses + Number(m.expenses),
      profit: acc.profit + Number(m.profit),
    }), { revenue: 0, expenses: 0, profit: 0 });
  }, [monthlyRevenue]);

  // Best month
  const bestMonth = useMemo(() => {
    if (!monthlyRevenue.length) return null;
    return monthlyRevenue.reduce((best, m) => Number(m.revenue) > Number(best.revenue) ? m : best, monthlyRevenue[0]);
  }, [monthlyRevenue]);

  // Monthly chart data: shorten month names
  const chartMonthlyData = monthlyRevenue.map(m => ({
    ...m,
    monthName: m.monthName.substring(0, 3),
    revenue: Number(m.revenue),
    expenses: Number(m.expenses),
    profit: Number(m.profit),
  }));

  const monthLabel = MONTH_NAMES[parseInt(selectedMonth, 10) - 1];
  const activeProcedures = procedureRevenue.filter(p => Number(p.totalSessions) > 0);
  const maxProcedureRevenue = Math.max(...activeProcedures.map(p => Number(p.totalRevenue)), 1);

  return (
    <AppLayout title="Relatórios">
      <div className="space-y-6">

        {/* ── Page Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Relatórios</h1>
            <p className="text-sm text-slate-400 mt-0.5">Análises e indicadores de desempenho da clínica</p>
          </div>

          {/* Period selector */}
          <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 shadow-sm border border-slate-200">
            <CalendarDays className="w-4 h-4 text-slate-400" />
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="h-8 w-32 rounded-lg border-0 bg-transparent text-sm font-semibold text-slate-700 focus:ring-0 shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map((name, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="h-4 w-px bg-slate-200" />
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="h-8 w-20 rounded-lg border-0 bg-transparent text-sm font-semibold text-slate-700 focus:ring-0 shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── Annual KPI Summary ── */}
        <div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
            Visão Anual — {selectedYear}
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
            />
            <KpiCard
              label="Lucro Anual"
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
              sub={`de ${monthlyRevenue.length} meses`}
            />
          </div>
        </div>

        {/* ── Monthly KPIs (period-specific) ── */}
        <div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
            Período Selecionado — {monthLabel}/{selectedYear}
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label="Receita do Mês"
              value={formatCurrency(totalCategoryRevenue)}
              icon={<BarChart3 className="w-4 h-4" />}
              accentColor="#10b981"
              loading={loadingProcedure}
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
              sub={`${activeProcedures.length} procedimento(s) realizados`}
            />
          </div>
        </div>

        {/* ── Monthly Revenue Chart ── */}
        <Card className="border border-slate-100 shadow-sm rounded-2xl bg-white overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base font-bold text-slate-800">Faturamento Mensal</CardTitle>
                <p className="text-xs text-slate-400 mt-0.5">Receitas, despesas e lucro ao longo do ano {selectedYear}</p>
              </div>
              {!loadingMonthly && annualTotals.profit !== 0 && (
                <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${annualTotals.profit >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                  {annualTotals.profit >= 0 ? "+" : ""}{formatCurrency(annualTotals.profit)} no ano
                </span>
              )}
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
                  <XAxis
                    dataKey="monthName"
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                  />
                  <Tooltip content={<CustomTooltipContent />} cursor={{ fill: "#f8fafc", radius: 4 }} />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 12, paddingTop: 8, paddingLeft: 16 }}
                  />
                  <Bar dataKey="revenue" name="Receita" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="expenses" name="Despesas" fill="#ef4444" radius={[3, 3, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="profit" name="Lucro" fill="#6366f1" radius={[3, 3, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* ── Revenue by Category ── */}
        <Card className="border border-slate-100 shadow-sm rounded-2xl bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold text-slate-800">Receita por Categoria</CardTitle>
            <p className="text-xs text-slate-400 mt-0.5">Distribuição da receita por tipo de procedimento — {monthLabel}/{selectedYear}</p>
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
                <p className="text-sm font-medium text-slate-400">Sem dados para o período selecionado</p>
                <p className="text-xs text-slate-300 mt-1">Registre atendimentos para visualizar a distribuição</p>
              </div>
            ) : (
              <div className="flex flex-col lg:flex-row items-start gap-8">
                {/* Donut */}
                <div className="shrink-0 mx-auto lg:mx-0">
                  <ResponsiveContainer width={200} height={200}>
                    <PieChart>
                      <Pie
                        data={categoryRevenue}
                        dataKey="revenue"
                        nameKey="category"
                        cx="50%"
                        cy="50%"
                        innerRadius={58}
                        outerRadius={90}
                        paddingAngle={3}
                        strokeWidth={0}
                      >
                        {categoryRevenue.map((_, i) => (
                          <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value)}
                        contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 8px 32px rgba(0,0,0,0.12)", fontSize: "12px" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Category breakdown */}
                <div className="flex-1 min-w-0 w-full space-y-3">
                  {categoryRevenue.map((cat, i) => {
                    const pct = totalCategoryRevenue > 0 ? (cat.revenue / totalCategoryRevenue) * 100 : 0;
                    const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
                    return (
                      <div key={cat.category}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                            <span className="text-sm font-semibold text-slate-700 capitalize truncate">{cat.category}</span>
                            <span className="text-xs text-slate-400 shrink-0">
                              {cat.sessions} {cat.sessions === 1 ? "sessão" : "sessões"}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 ml-2">
                            <span className="text-xs font-bold text-slate-400 tabular-nums">{pct.toFixed(1)}%</span>
                            <span className="text-sm font-bold text-slate-800 tabular-nums">{formatCurrency(cat.revenue)}</span>
                          </div>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2">
                          <div
                            className="h-2 rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, backgroundColor: color }}
                          />
                        </div>
                      </div>
                    );
                  })}

                  <div className="pt-3 mt-1 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-500">Total do período</span>
                    <span className="text-base font-extrabold text-indigo-600 tabular-nums">{formatCurrency(totalCategoryRevenue)}</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Schedule Occupation ── */}
        <div className="space-y-4">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
            Ocupação da Agenda — {monthLabel}/{selectedYear}
          </p>

          {/* Occupation KPI Cards */}
          {loadingOccupation ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4">
                  <div className="h-3 w-16 bg-slate-100 animate-pulse rounded mb-3" />
                  <div className="h-8 w-20 bg-slate-100 animate-pulse rounded" />
                </div>
              ))}
            </div>
          ) : scheduleOccupation ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {/* Occupation Rate */}
                <div className="relative bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
                    style={{
                      backgroundColor: scheduleOccupation.occupationRate >= 80
                        ? "#10b981" : scheduleOccupation.occupationRate >= 60
                          ? "#f59e0b" : "#ef4444"
                    }}
                  />
                  <div className="pl-4 pr-3 py-4 text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Ocupação</p>
                    <p className={`text-3xl font-extrabold tabular-nums ${scheduleOccupation.occupationRate >= 80 ? "text-emerald-600" : scheduleOccupation.occupationRate >= 60 ? "text-amber-600" : "text-red-600"}`}>
                      {scheduleOccupation.occupationRate.toFixed(0)}%
                    </p>
                    <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${scheduleOccupation.occupationRate}%`,
                          backgroundColor: scheduleOccupation.occupationRate >= 80 ? "#10b981" : scheduleOccupation.occupationRate >= 60 ? "#f59e0b" : "#ef4444"
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Total Slots */}
                <div className="relative bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl bg-slate-300" />
                  <div className="pl-4 pr-3 py-4 text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Agendamentos</p>
                    <p className="text-3xl font-extrabold text-slate-800 tabular-nums">{scheduleOccupation.totalSlots}</p>
                    <p className="text-[10px] text-slate-400 mt-1">{scheduleOccupation.occupiedSlots} realizados</p>
                  </div>
                </div>

                {/* No-show rate */}
                <div className="relative bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl bg-amber-400" />
                  <div className="pl-4 pr-3 py-4 text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Taxa Faltas</p>
                    <p className="text-3xl font-extrabold text-amber-600 tabular-nums">{scheduleOccupation.noShowRate?.toFixed(0) ?? 0}%</p>
                    <p className="text-[10px] text-slate-400 mt-1">&nbsp;</p>
                  </div>
                </div>

                {/* Faltas */}
                <div className="relative bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl bg-amber-500" />
                  <div className="pl-4 pr-3 py-4 text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Faltas</p>
                    <p className="text-3xl font-extrabold text-amber-600 tabular-nums">{scheduleOccupation.noShowCount}</p>
                    <p className="text-[10px] text-slate-400 mt-1">no-show</p>
                  </div>
                </div>

                {/* Cancelamentos */}
                <div className="relative bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl bg-red-400" />
                  <div className="pl-4 pr-3 py-4 text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Cancelados</p>
                    <p className="text-3xl font-extrabold text-red-600 tabular-nums">{scheduleOccupation.canceledCount}</p>
                    <p className="text-[10px] text-slate-400 mt-1">no período</p>
                  </div>
                </div>

                {/* Pacientes Ativos */}
                <div className="relative bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl bg-sky-400" />
                  <div className="pl-4 pr-3 py-4 text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Pac. Ativos</p>
                    <p className="text-3xl font-extrabold text-sky-600 tabular-nums">{scheduleOccupation.activePatients ?? 0}</p>
                    <p className="text-[10px] text-slate-400 mt-1">pacientes</p>
                  </div>
                </div>
              </div>

              {/* Day-of-week chart */}
              {(scheduleOccupation.byDayOfWeek?.length ?? 0) > 0 && (
                <Card className="border border-slate-100 shadow-sm rounded-2xl bg-white">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold text-slate-700">Atendimentos por Dia da Semana</CardTitle>
                    <p className="text-xs text-slate-400">Volume de atendimentos distribuídos pelos dias úteis</p>
                  </CardHeader>
                  <CardContent className="pb-4 pt-0">
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart
                        data={scheduleOccupation.byDayOfWeek}
                        margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis
                          dataKey="dayOfWeek"
                          tick={{ fontSize: 12, fill: "#94a3b8" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: "#94a3b8" }}
                          allowDecimals={false}
                          axisLine={false}
                          tickLine={false}
                          width={28}
                        />
                        <Tooltip
                          contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 8px 32px rgba(0,0,0,0.12)", fontSize: "12px" }}
                          formatter={(v: number) => [v, "Atendimentos"]}
                        />
                        <Bar
                          dataKey="count"
                          name="Atendimentos"
                          fill="#6366f1"
                          radius={[4, 4, 0, 0]}
                          maxBarSize={40}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 py-10 text-center">
              <Calendar className="w-10 h-10 mx-auto mb-3 text-slate-200" />
              <p className="text-sm font-medium text-slate-400">Sem dados de ocupação para o período</p>
            </div>
          )}
        </div>

        {/* ── Procedure Revenue Table ── */}
        <Card className="border border-slate-100 shadow-sm rounded-2xl overflow-hidden bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold text-slate-800">Receita por Procedimento</CardTitle>
            <p className="text-xs text-slate-400 mt-0.5">{monthLabel}/{selectedYear} · Procedimentos com sessões realizadas</p>
          </CardHeader>
          <CardContent className="p-0">
            {loadingProcedure ? (
              <div className="p-5 space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="h-4 flex-1 bg-slate-100 animate-pulse rounded" />
                    <div className="h-4 w-16 bg-slate-100 animate-pulse rounded" />
                    <div className="h-4 w-12 bg-slate-100 animate-pulse rounded" />
                    <div className="h-4 w-20 bg-slate-100 animate-pulse rounded" />
                  </div>
                ))}
              </div>
            ) : activeProcedures.length === 0 ? (
              <div className="py-14 text-center">
                <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-slate-100 flex items-center justify-center">
                  <Stethoscope className="w-6 h-6 text-slate-300" />
                </div>
                <p className="text-sm font-semibold text-slate-500">Sem dados para o período selecionado</p>
                <p className="text-xs text-slate-400 mt-1">Registre atendimentos para visualizar a receita por procedimento</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-100">
                      <th className="py-2.5 px-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Procedimento</th>
                      <th className="py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden md:table-cell">Categoria</th>
                      <th className="py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Sessões</th>
                      <th className="py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right hidden sm:table-cell">Ticket Médio</th>
                      <th className="py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Receita</th>
                      <th className="py-2.5 px-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden lg:table-cell">Participação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeProcedures
                      .sort((a, b) => Number(b.totalRevenue) - Number(a.totalRevenue))
                      .map((p, idx) => {
                        const pct = maxProcedureRevenue > 0 ? (Number(p.totalRevenue) / maxProcedureRevenue) * 100 : 0;
                        const sharePct = totalCategoryRevenue > 0 ? (Number(p.totalRevenue) / totalCategoryRevenue) * 100 : 0;
                        return (
                          <tr key={p.procedureId} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                            <td className="py-3.5 px-5">
                              <p className="text-sm font-semibold text-slate-800">{p.procedureName}</p>
                            </td>
                            <td className="py-3.5 px-4 hidden md:table-cell">
                              <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full capitalize">
                                {p.category || "Outros"}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-sm text-slate-600 text-right tabular-nums font-medium">
                              {p.totalSessions}
                            </td>
                            <td className="py-3.5 px-4 text-sm text-slate-500 text-right hidden sm:table-cell tabular-nums">
                              {formatCurrency(p.averageTicket)}
                            </td>
                            <td className="py-3.5 px-4 text-sm font-bold text-emerald-600 text-right tabular-nums">
                              {formatCurrency(Number(p.totalRevenue))}
                            </td>
                            <td className="py-3.5 px-5 hidden lg:table-cell">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-indigo-400 rounded-full transition-all duration-500"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-slate-400 w-8 text-right tabular-nums">{sharePct.toFixed(0)}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t-2 border-slate-200">
                      <td colSpan={2} className="py-3 px-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden md:table-cell">
                        Total do período
                      </td>
                      <td className="py-3 px-4 text-sm font-bold text-slate-700 text-right tabular-nums">
                        {activeProcedures.reduce((s, p) => s + Number(p.totalSessions), 0)}
                      </td>
                      <td className="py-3 px-4 hidden sm:table-cell" />
                      <td className="py-3 px-4 text-sm font-extrabold text-emerald-600 text-right tabular-nums">
                        {formatCurrency(totalCategoryRevenue)}
                      </td>
                      <td className="hidden lg:table-cell" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </AppLayout>
  );
}
