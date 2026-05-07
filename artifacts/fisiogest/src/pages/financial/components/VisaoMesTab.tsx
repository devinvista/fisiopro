import { useState, useMemo, useEffect, useCallback } from "react";
import {
  TrendingUp, TrendingDown, Clock, Ticket,
  Stethoscope, Repeat, ArrowUpRight, ArrowDownRight,
  PiggyBank, CalendarCheck2, LayoutDashboard,
} from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { useGetFinancialDashboard } from "@workspace/api-client-react";
import { authHeaders, formatCurrency } from "../utils";
import { MONTH_NAMES, PIE_COLORS } from "../constants";
import { KpiCard } from "./KpiCard";
import { RecurringPackagesPanel, type BillingStatusData } from "./lancamentos/RecurringPackagesPanel";

function Skeleton({ className }: { className?: string }) {
  return <div className={`bg-slate-100 animate-pulse rounded-lg ${className ?? ""}`} />;
}

export function VisaoMesTab({ month, year }: { month: number; year: number }) {
  const [billingPanelOpen, setBillingPanelOpen] = useState(false);
  const [planBillingStatus, setPlanBillingStatus] = useState<BillingStatusData | null>(null);
  const [planBillingStatusLoading, setPlanBillingStatusLoading] = useState(true);
  const [planBillingResult, setPlanBillingResult] = useState<{ generated: number; skipped: number; recordIds: number[] } | null>(null);
  const [planBillingRunning, setPlanBillingRunning] = useState(false);
  const [showPlanBillingUpcoming, setShowPlanBillingUpcoming] = useState(false);

  const { data: dashboard, isLoading: dashLoading } = useGetFinancialDashboard({ month, year });

  const fetchPlanBillingStatus = useCallback(async () => {
    setPlanBillingStatusLoading(true);
    try {
      const res = await fetch("/api/treatment-plans/billing/status", { headers: authHeaders() });
      if (res.ok) setPlanBillingStatus(await res.json());
    } catch { }
    finally { setPlanBillingStatusLoading(false); }
  }, []);

  useEffect(() => { fetchPlanBillingStatus(); }, [fetchPlanBillingStatus]);

  const handleRunPlanBilling = async () => {
    setPlanBillingRunning(true); setPlanBillingResult(null);
    try {
      const res = await fetch("/api/treatment-plans/billing/run", { method: "POST", headers: authHeaders() });
      const data = await res.json();
      if (res.ok) { setPlanBillingResult(data); await fetchPlanBillingStatus(); }
    } catch { }
    finally { setPlanBillingRunning(false); }
  };

  const revenue = Number(dashboard?.monthlyRevenue ?? 0);
  const expenses = Number(dashboard?.monthlyExpenses ?? 0);
  const netProfit = revenue - expenses;
  const isProfitable = netProfit >= 0;
  const marginPct = revenue > 0 ? (netProfit / revenue) * 100 : 0;
  const expenseRatioPct = revenue > 0 ? Math.min(100, (expenses / revenue) * 100) : 0;
  const cashReceived = Number((dashboard as any)?.cashReceived ?? 0);
  const accountsReceivable = Number((dashboard as any)?.accountsReceivable ?? 0);
  const mrr = Number((dashboard as any)?.mrr ?? 0);
  const activeSubscriptions = Number((dashboard as any)?.activeSubscriptions ?? 0);
  const monthLabel = MONTH_NAMES[month - 1];

  const pieData = useMemo(() => {
    const cats = (dashboard as any)?.revenueByCategory ?? [];
    return cats
      .filter((c: any) => Number(c.revenue) > 0)
      .map((c: any) => ({
        name: c.category === "null" || !c.category ? "Outros" : c.category,
        value: Number(c.revenue),
      }));
  }, [dashboard]);

  const barData = useMemo(() => [
    { name: "Receitas", value: revenue, fill: "#10b981" },
    { name: "Despesas", value: expenses, fill: "#f43f5e" },
    { name: "Resultado", value: Math.abs(netProfit), fill: isProfitable ? "#6366f1" : "#ef4444" },
  ], [revenue, expenses, netProfit, isProfitable]);

  return (
    <div className="space-y-5">

      {/* ── HERO RESULTADO ─────────────────────────────────────────────────── */}
      <div className={`relative rounded-2xl overflow-hidden px-5 sm:px-8 py-6 shadow-sm ${
        isProfitable
          ? "bg-gradient-to-br from-emerald-500 via-emerald-500 to-teal-600"
          : "bg-gradient-to-br from-rose-500 via-rose-500 to-red-600"
      }`}>
        <div className="pointer-events-none absolute -right-10 -top-10 w-48 h-48 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute right-12 -bottom-12 w-32 h-32 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute left-1/2 -bottom-8 w-64 h-24 rounded-full bg-black/5" />

        <div className="relative">
          {/* Title row */}
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 rounded-lg bg-white/15">
              <LayoutDashboard className="w-4 h-4 text-white" />
            </div>
            <p className="text-xs font-bold uppercase tracking-widest text-white/70">
              Resultado — {monthLabel} {year}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
            {/* Left: main number */}
            <div>
              {dashLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-44 bg-white/20" />
                  <Skeleton className="h-4 w-28 bg-white/10" />
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2.5">
                    <p className="text-4xl sm:text-5xl font-black text-white tabular-nums tracking-tight">
                      {isProfitable ? "+" : ""}{formatCurrency(netProfit)}
                    </p>
                    {isProfitable
                      ? <ArrowUpRight className="w-7 h-7 text-white/70" />
                      : <ArrowDownRight className="w-7 h-7 text-white/70" />}
                  </div>
                  <p className="text-sm text-white/60 mt-1.5 font-medium">
                    {isProfitable
                      ? `Margem líquida de ${marginPct.toFixed(1)}%`
                      : "Resultado negativo no período"}
                  </p>
                  {/* Expense bar */}
                  <div className="mt-4 max-w-sm">
                    <div className="flex justify-between text-[10px] font-semibold text-white/50 mb-1.5">
                      <span>Despesas / Receitas</span>
                      <span>{expenseRatioPct.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/20 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-white/70 transition-all duration-700"
                        style={{ width: `${expenseRatioPct}%` }}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Right: breakdown stats */}
            <div className="flex sm:flex-col gap-6 sm:gap-3 sm:text-right">
              {dashLoading ? (
                <>
                  <Skeleton className="h-10 w-28 bg-white/20" />
                  <Skeleton className="h-10 w-28 bg-white/20" />
                </>
              ) : (
                <>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-0.5">Receitas</p>
                    <p className="text-xl font-bold text-white tabular-nums">{formatCurrency(revenue)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-0.5">Despesas</p>
                    <p className="text-xl font-bold text-white/75 tabular-nums">{formatCurrency(expenses)}</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── KPIs SECUNDÁRIOS ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Caixa Recebido"
          value={dashLoading ? "—" : formatCurrency(cashReceived)}
          sub="Entradas confirmadas"
          icon={<PiggyBank className="w-4 h-4" />}
          accentColor="#0ea5e9"
          loading={dashLoading}
        />
        <KpiCard
          label="A Receber"
          value={dashLoading ? "—" : formatCurrency(accountsReceivable)}
          sub="Títulos em aberto"
          icon={<Clock className="w-4 h-4" />}
          accentColor="#f59e0b"
          loading={dashLoading}
        />
        <KpiCard
          label="MRR"
          value={dashLoading ? "—" : formatCurrency(mrr)}
          sub={`${activeSubscriptions} pacote(s) ativo(s)`}
          icon={<Repeat className="w-4 h-4" />}
          accentColor="#8b5cf6"
          loading={dashLoading}
        />
        <KpiCard
          label="Ticket Médio"
          value={dashLoading ? "—" : formatCurrency((dashboard as any)?.averageTicket ?? 0)}
          sub={(dashboard as any)?.completedAppointments != null
            ? `${(dashboard as any).completedAppointments}/${(dashboard as any).totalAppointments} consultas`
            : undefined}
          icon={<Ticket className="w-4 h-4" />}
          accentColor="#10b981"
          loading={dashLoading}
        />
      </div>

      {/* ── GRÁFICOS + INDICADORES ───────────────────────────────────────── */}
      {!dashLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* Bar chart resumo */}
          <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
              Resumo Financeiro — {monthLabel} {year}
            </p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={barData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barGap={6}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={48} />
                <Tooltip
                  formatter={(v: number) => [formatCurrency(v), ""]}
                  contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 8px 32px rgba(0,0,0,0.1)", fontSize: 12 }}
                />
                <Bar dataKey="value" radius={[5, 5, 0, 0]} maxBarSize={60}>
                  {barData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Right column */}
          <div className="lg:col-span-2 flex flex-col gap-3">
            {/* Pie: receita por categoria */}
            {pieData.length > 0 ? (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex-1">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                  Receita por Categoria
                </p>
                <div className="flex items-center gap-4">
                  <div className="shrink-0">
                    <PieChart width={100} height={100}>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={30} outerRadius={46} paddingAngle={3} dataKey="value" strokeWidth={0}>
                        {pieData.map((_: any, idx: number) => (
                          <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(val: number) => formatCurrency(val)} contentStyle={{ borderRadius: 10, border: "none", boxShadow: "0 8px 24px rgba(0,0,0,0.1)", fontSize: 11 }} />
                    </PieChart>
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    {pieData.slice(0, 4).map((item: any, idx: number) => {
                      const total = pieData.reduce((s: number, p: any) => s + p.value, 0);
                      const pct = total > 0 ? (item.value / total) * 100 : 0;
                      const color = PIE_COLORS[idx % PIE_COLORS.length];
                      return (
                        <div key={item.name} className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                          <span className="text-xs text-slate-600 truncate flex-1">{item.name}</span>
                          <span className="text-[10px] font-bold text-slate-400 tabular-nums">{pct.toFixed(0)}%</span>
                        </div>
                      );
                    })}
                    {pieData.length > 4 && (
                      <p className="text-[10px] text-slate-400">+{pieData.length - 4} categorias</p>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {/* Top procedure + consultas */}
            <div className="flex gap-3 flex-1">
              {(dashboard as any)?.topProcedure && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 rounded-lg bg-violet-50">
                      <Stethoscope className="w-3.5 h-3.5 text-violet-500" />
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Top Proc.</p>
                  </div>
                  <p className="text-xs font-bold text-slate-800 leading-snug">{(dashboard as any).topProcedure}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Mais realizado</p>
                </div>
              )}

              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-lg bg-sky-50">
                    <TrendingUp className="w-3.5 h-3.5 text-sky-500" />
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Consultas</p>
                </div>
                <div className="flex items-end gap-1.5">
                  <p className="text-xl font-extrabold text-slate-900 tabular-nums">{(dashboard as any)?.completedAppointments ?? 0}</p>
                  <p className="text-xs text-slate-400 mb-0.5">/ {(dashboard as any)?.totalAppointments ?? 0}</p>
                </div>
                {((dashboard as any)?.totalAppointments ?? 0) > 0 && (
                  <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-sky-400 transition-all duration-700"
                      style={{ width: `${Math.min(100, (((dashboard as any)?.completedAppointments ?? 0) / ((dashboard as any)?.totalAppointments ?? 1)) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── PANEL FATURAS PLANOS ────────────────────────────────────────── */}
      <RecurringPackagesPanel
        planBillingStatus={planBillingStatus}
        planBillingStatusLoading={planBillingStatusLoading}
        planBillingResult={planBillingResult}
        planBillingRunning={planBillingRunning}
        onRequestPlanBillingRun={handleRunPlanBilling}
        showPlanBillingUpcoming={showPlanBillingUpcoming}
        setShowPlanBillingUpcoming={setShowPlanBillingUpcoming}
        panelOpen={billingPanelOpen}
        setPanelOpen={setBillingPanelOpen}
      />
    </div>
  );
}
