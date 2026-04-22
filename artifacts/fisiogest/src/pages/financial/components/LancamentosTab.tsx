import { useState, useMemo, useEffect, useCallback } from "react";
import { format } from "date-fns";
import {
  AlertCircle, BarChart3, CalendarCheck2, CheckCircle2, ChevronDown, ChevronUp,
  Clock, DollarSign, Edit2, Link2, Loader2, PiggyBank, Plus, RefreshCw, Repeat,
  Stethoscope, Ticket, Trash2, TrendingDown, TrendingUp,
} from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useGetFinancialDashboard, useListFinancialRecords } from "@workspace/api-client-react";
import { authHeaders, formatCurrency } from "../utils";
import { MONTH_NAMES, PIE_COLORS } from "../constants";
import { KpiCard } from "./KpiCard";
import { NewRecordModal } from "./NewRecordModal";
import { EditRecordModal } from "./EditRecordModal";

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1: LANÇAMENTOS
// ═══════════════════════════════════════════════════════════════════════════════

interface BillingStatusData {
  lastRun: {
    id: number; ranAt: string; triggeredBy: string;
    generated: number; skipped: number; errors: number; processed: number; dryRun: boolean;
  } | null;
  upcoming: { id: number; patientName: string; procedureName: string; amount: number; nextBillingDate: string; }[];
  upcomingTotal: number;
  upcomingCount: number;
}

export function LancamentosTab({ month, year }: { month: number; year: number }) {
  const [typeFilter, setTypeFilter] = useState<"all" | "receita" | "despesa">("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; description: string; amount: number } | null>(null);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [billingRunning, setBillingRunning] = useState(false);
  const [billingResult, setBillingResult] = useState<{ generated: number; skipped: number; recordIds: number[] } | null>(null);
  const [showBillingConfirm, setShowBillingConfirm] = useState(false);
  const [billingStatus, setBillingStatus] = useState<BillingStatusData | null>(null);
  const [billingStatusLoading, setBillingStatusLoading] = useState(true);
  const [showUpcoming, setShowUpcoming] = useState(false);
  const [billingPanelOpen, setBillingPanelOpen] = useState(false);
  const { toast } = useToast();

  const { data: dashboard, isLoading: dashLoading, refetch: refetchDash } = useGetFinancialDashboard({ month, year });
  const { data: rawRecords, isLoading: recLoading, refetch: refetchRec } = useListFinancialRecords({ month, year });

  const fetchBillingStatus = useCallback(async () => {
    setBillingStatusLoading(true);
    try {
      const res = await fetch("/api/subscriptions/billing-status", { headers: authHeaders() });
      if (res.ok) setBillingStatus(await res.json());
    } catch { }
    finally { setBillingStatusLoading(false); }
  }, []);

  useEffect(() => { fetchBillingStatus(); }, [fetchBillingStatus]);

  const records = useMemo(() => {
    if (!rawRecords) return [];
    const sorted = [...rawRecords].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (typeFilter === "all") return sorted;
    return sorted.filter((r) => r.type === typeFilter);
  }, [rawRecords, typeFilter]);

  const totalReceitas = useMemo(() => records.filter((r) => r.type === "receita" && (r as any).status !== "cancelado" && (r as any).status !== "estornado" && (r as any).transactionType !== "pendenteFatura").reduce((s, r) => s + Number(r.amount), 0), [records]);
  const totalDespesas = useMemo(() => records.filter((r) => r.type === "despesa" && (r as any).status !== "cancelado" && (r as any).status !== "estornado").reduce((s, r) => s + Number(r.amount), 0), [records]);

  const pieData = useMemo(() => {
    const cats = dashboard?.revenueByCategory ?? [];
    return cats.filter((c: any) => Number(c.revenue) > 0).map((c: any) => ({
      name: c.category === "null" || !c.category ? "Outros" : c.category,
      value: Number(c.revenue),
    }));
  }, [dashboard]);

  // Area chart data from category breakdown
  const areaData = useMemo(() => {
    if (!dashboard) return [];
    const cats = dashboard.revenueByCategory ?? [];
    return cats.filter((c: any) => Number(c.revenue) > 0).map((c: any, i: number) => ({
      name: c.category === "null" || !c.category ? "Outros" : c.category,
      receita: Number(c.revenue),
    }));
  }, [dashboard]);

  const handleSuccess = () => { setIsModalOpen(false); setEditTarget(null); refetchDash(); refetchRec(); };

  const handleDeleteRecord = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/financial/records/${deleteTarget.id}`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ variant: "destructive", title: "Erro ao excluir", description: data.message ?? "Não foi possível excluir." });
      } else {
        toast({ title: "Registro excluído." });
        setDeleteTarget(null);
        refetchDash(); refetchRec();
      }
    } catch { toast({ variant: "destructive", title: "Erro ao excluir registro." }); }
    finally { setIsDeleting(false); }
  };

  const handleRunBilling = async () => {
    setBillingRunning(true); setBillingResult(null);
    try {
      const res = await fetch("/api/subscriptions/run-billing", { method: "POST", headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: "Erro na cobrança mensal", description: data.message });
      } else {
        setBillingResult(data);
        if (data.generated > 0) {
          toast({ title: `${data.generated} lançamento(s) gerado(s).` });
          refetchDash(); refetchRec();
        } else {
          toast({ title: data.skipped > 0 ? `Nenhuma cobrança nova — ${data.skipped} já registrada(s) ou fora da janela.` : "Nenhuma assinatura com vencimento na janela atual." });
        }
        await fetchBillingStatus();
      }
    } catch { toast({ variant: "destructive", title: "Erro ao executar cobrança." }); }
    finally { setBillingRunning(false); setShowBillingConfirm(false); }
  };

  const formatLastRunDate = (ranAt: string) => {
    const d = new Date(ranAt);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffH = Math.floor(diffMs / 3600000);
    const diffM = Math.floor(diffMs / 60000);
    if (diffM < 1) return "agora mesmo";
    if (diffM < 60) return `há ${diffM} min`;
    if (diffH < 24) return `hoje às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  const formatUpcomingDate = (dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr + "T00:00:00");
    const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
    if (diffDays === 0) return "hoje";
    if (diffDays === 1) return "amanhã";
    return `em ${diffDays} dias`;
  };

  const netProfit = (dashboard?.monthlyRevenue ?? 0) - (dashboard?.monthlyExpenses ?? 0);
  const isProfitable = netProfit >= 0;
  const cashReceived = (dashboard as any)?.cashReceived ?? 0;
  const accountsReceivable = (dashboard as any)?.accountsReceivable ?? 0;
  const customerAdvances = (dashboard as any)?.customerAdvances ?? 0;

  return (
    <div className="space-y-6">

      {/* ── Hero KPI Strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <KpiCard
          label="Receita Competência"
          value={formatCurrency(dashboard?.monthlyRevenue ?? 0)}
          icon={<TrendingUp className="w-4 h-4" />}
          accentColor="#10b981"
          loading={dashLoading}
          sub="Reconhecida no DRE"
        />
        <KpiCard
          label="Caixa Recebido"
          value={formatCurrency(cashReceived)}
          icon={<PiggyBank className="w-4 h-4" />}
          accentColor="#0ea5e9"
          loading={dashLoading}
          sub="Dinheiro que entrou"
        />
        <KpiCard
          label="Despesas"
          value={formatCurrency(dashboard?.monthlyExpenses ?? 0)}
          icon={<TrendingDown className="w-4 h-4" />}
          accentColor="#ef4444"
          loading={dashLoading}
        />
        <KpiCard
          label="Lucro Líquido"
          value={formatCurrency(dashboard?.monthlyProfit ?? 0)}
          icon={<DollarSign className="w-4 h-4" />}
          accentColor="#6366f1"
          loading={dashLoading}
          size="md"
        />
        <KpiCard
          label="Ticket Médio"
          value={formatCurrency(dashboard?.averageTicket ?? 0)}
          icon={<Ticket className="w-4 h-4" />}
          accentColor="#8b5cf6"
          loading={dashLoading}
        />
        <KpiCard
          label="Consultas"
          value={`${dashboard?.completedAppointments ?? 0} / ${dashboard?.totalAppointments ?? 0}`}
          icon={<Stethoscope className="w-4 h-4" />}
          accentColor="#0ea5e9"
          loading={dashLoading}
          sub={dashboard?.topProcedure ? `Top: ${dashboard.topProcedure}` : undefined}
        />
      </div>

      {!dashLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <KpiCard
            label="A Receber Contábil"
            value={formatCurrency(accountsReceivable)}
            icon={<Clock className="w-4 h-4" />}
            accentColor="#f59e0b"
            sub="Títulos abertos no ledger"
          />
          <KpiCard
            label="Adiantamentos / Carteira"
            value={formatCurrency(customerAdvances)}
            icon={<PiggyBank className="w-4 h-4" />}
            accentColor="#14b8a6"
            sub="Passivo com pacientes"
          />
        </div>
      )}

      {/* ── Net Result Banner ── */}
      {!dashLoading && (
        <div className={`rounded-2xl px-5 py-4 flex items-center justify-between gap-4 ${isProfitable ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${isProfitable ? "bg-emerald-100" : "bg-red-100"}`}>
              {isProfitable
                ? <TrendingUp className="w-5 h-5 text-emerald-600" />
                : <TrendingDown className="w-5 h-5 text-red-600" />}
            </div>
            <div>
              <p className={`text-sm font-bold ${isProfitable ? "text-emerald-800" : "text-red-800"}`}>
                {isProfitable ? "Clínica no positivo" : "Atenção: resultado negativo"} — {MONTH_NAMES[month - 1]} {year}
              </p>
              <p className={`text-xs ${isProfitable ? "text-emerald-600" : "text-red-600"}`}>
                {isProfitable
                  ? `Resultado: +${formatCurrency(netProfit)} acima das despesas`
                  : `Resultado: ${formatCurrency(netProfit)} abaixo das receitas`}
              </p>
            </div>
          </div>
          <span className={`text-xl font-extrabold tabular-nums ${isProfitable ? "text-emerald-700" : "text-red-700"}`}>
            {isProfitable ? "+" : ""}{formatCurrency(netProfit)}
          </span>
        </div>
      )}

      {/* ── MRR & Subscription Metrics ── */}
      <div>
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
          <Repeat className="w-3 h-3" /> Receita Recorrente (Assinaturas)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <KpiCard
            label="MRR — Receita Mensal Recorrente"
            value={formatCurrency((dashboard as any)?.mrr ?? 0)}
            icon={<Repeat className="w-4 h-4" />}
            accentColor="#6366f1"
            loading={dashLoading}
            sub={`${(dashboard as any)?.activeSubscriptions ?? 0} assinatura(s) ativa(s)`}
          />
          <KpiCard
            label="A Receber — Ledger"
            value={formatCurrency(accountsReceivable)}
            icon={<Clock className="w-4 h-4" />}
            accentColor="#f59e0b"
            loading={dashLoading}
            sub={`${(dashboard as any)?.pendingSubscriptionCharges?.count ?? 0} cobrança(s) recorrente(s) pendente(s)`}
          />
          <div className="relative bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl bg-indigo-400" />
            <div className="pl-5 pr-4 py-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Cobertura do MRR</p>
              {dashLoading ? (
                <div className="h-7 w-24 bg-slate-100 animate-pulse rounded-lg" />
              ) : (() => {
                const mrr = (dashboard as any)?.mrr ?? 0;
                const revenue = dashboard?.monthlyRevenue ?? 0;
                const pct = revenue > 0 ? Math.min(100, Math.round((mrr / revenue) * 100)) : (mrr > 0 ? 100 : 0);
                return (
                  <>
                    <p className="text-2xl font-bold text-slate-900 tabular-nums">{pct}%</p>
                    <p className="text-xs text-slate-400 mt-1">do total de receitas é recorrente</p>
                    <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-indigo-400 transition-all duration-700"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        {/* Revenue by Category (Donut) */}
        {pieData.length > 0 && (
          <Card className="border border-slate-100 shadow-sm rounded-2xl bg-white xl:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-slate-700">Receita por Categoria</CardTitle>
              <p className="text-xs text-slate-400">{MONTH_NAMES[month - 1]} {year}</p>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={210}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {pieData.map((_: any, idx: number) => (
                      <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: number) => formatCurrency(val)}
                    contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 8px 32px rgba(0,0,0,0.12)", fontSize: "12px" }}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => <span className="text-xs text-slate-600">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Revenue Category Bar Chart */}
        {areaData.length > 0 && (
          <Card className={`border border-slate-100 shadow-sm rounded-2xl bg-white ${pieData.length > 0 ? "xl:col-span-3" : "xl:col-span-5"}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-slate-700">Distribuição por Categoria</CardTitle>
              <p className="text-xs text-slate-400">Receita gerada por tipo de serviço</p>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={areaData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} width={90} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(val: number) => formatCurrency(val)}
                    contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 8px 32px rgba(0,0,0,0.12)", fontSize: "12px" }}
                  />
                  <Bar dataKey="receita" name="Receita" fill="#6366f1" radius={[0, 6, 6, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* If no pie data, show a placeholder or nothing */}
        {pieData.length === 0 && areaData.length === 0 && (
          <div className="xl:col-span-5 rounded-2xl border border-dashed border-slate-200 flex items-center justify-center p-10 text-center bg-slate-50">
            <div>
              <BarChart3 className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="text-sm text-slate-400 font-medium">Nenhum dado para exibir nos gráficos</p>
              <p className="text-xs text-slate-300 mt-1">Adicione lançamentos de receita para visualizar a distribuição</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Subscription Billing Panel (Collapsible) ── */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <button
          className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50 transition-colors"
          onClick={() => setBillingPanelOpen(v => !v)}
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
                  : "Nenhuma execução registrada"
                }
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
            {billingPanelOpen
              ? <ChevronUp className="w-4 h-4 text-slate-400" />
              : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </div>
        </button>

        {billingPanelOpen && (
          <div className="border-t border-slate-100 px-5 pb-5 pt-4 space-y-4">
            {/* Status row */}
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

            {/* Upcoming list */}
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

            {/* Billing result */}
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
                onClick={() => setShowBillingConfirm(true)}
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

      {/* ── Transaction List ── */}
      <Card className="border border-slate-100 shadow-sm rounded-2xl overflow-hidden bg-white">
        <CardHeader className="pb-0 px-5 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold text-slate-800">Lançamentos</CardTitle>
              <p className="text-xs text-slate-400 mt-0.5">{records.length} registro(s) · {MONTH_NAMES[month - 1]} {year}</p>
            </div>
            <div className="flex items-center gap-2">
              {/* Filter pills */}
              <div className="flex bg-slate-100 rounded-xl p-0.5 gap-0.5">
                {(["all", "receita", "despesa"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTypeFilter(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${typeFilter === t
                      ? "bg-white shadow-sm text-slate-900"
                      : "text-slate-500 hover:text-slate-700"
                      }`}
                  >
                    {t === "all" ? "Todos" : t === "receita" ? "Entradas" : "Saídas"}
                  </button>
                ))}
              </div>
              <Button
                onClick={() => setIsModalOpen(true)}
                size="sm"
                className="rounded-xl h-8 px-3 text-xs shadow-sm"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Novo
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 mt-4">
          {recLoading ? (
            <div className="p-8 space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="h-4 w-16 bg-slate-100 animate-pulse rounded" />
                  <div className="h-4 flex-1 bg-slate-100 animate-pulse rounded" />
                  <div className="h-4 w-20 bg-slate-100 animate-pulse rounded" />
                  <div className="h-4 w-16 bg-slate-100 animate-pulse rounded" />
                </div>
              ))}
            </div>
          ) : records.length === 0 ? (
            <div className="py-14 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-slate-100 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-500">Nenhum registro encontrado</p>
              <p className="text-xs text-slate-400 mt-1">Adicione receitas e despesas para visualizar os lançamentos</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100">
                    <th className="py-2.5 px-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data/Vencimento</th>
                    <th className="py-2.5 px-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Descrição</th>
                    <th className="py-2.5 px-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden md:table-cell">Categoria</th>
                    <th className="py-2.5 px-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden lg:table-cell">Pagamento</th>
                    <th className="py-2.5 px-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden sm:table-cell">Status</th>
                    <th className="py-2.5 px-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Valor</th>
                    <th className="py-2.5 px-3 w-20" />
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => {
                    const rec = record as any;
                    const recStatus: string = rec.status ?? "pago";
                    const dueDate = rec.dueDate ? new Date(rec.dueDate + "T12:00:00") : null;
                    const paymentDate = rec.paymentDate ? new Date(rec.paymentDate + "T12:00:00") : null;
                    const displayDate = paymentDate ?? dueDate ?? new Date(record.createdAt);

                    // Aging: days overdue for pending records
                    const today = new Date(); today.setHours(0, 0, 0, 0);
                    const daysOverdue = (recStatus === "pendente" && dueDate)
                      ? Math.floor((today.getTime() - dueDate.getTime()) / 86400000)
                      : 0;
                    const isOverdue = daysOverdue > 0;

                    const statusCfg: Record<string, { label: string; dot: string; text: string; bg: string }> = {
                      pago: { label: "Pago", dot: "bg-emerald-400", text: "text-emerald-700", bg: "bg-emerald-50" },
                      pendente: { label: "Pendente", dot: "bg-amber-400", text: "text-amber-700", bg: "bg-amber-50" },
                      estornado: { label: "Estornado", dot: "bg-red-400", text: "text-red-600", bg: "bg-red-50" },
                      cancelado: { label: "Cancelado", dot: "bg-slate-300", text: "text-slate-500", bg: "bg-slate-50" },
                    };
                    const statusInfo = isOverdue
                      ? { label: `Vencido há ${daysOverdue}d`, dot: "bg-red-500", text: "text-red-700", bg: "bg-red-50" }
                      : (statusCfg[recStatus] ?? { label: recStatus, dot: "bg-slate-300", text: "text-slate-500", bg: "bg-slate-50" });

                    return (
                      <tr
                        key={record.id}
                        className={`group border-b border-slate-50 hover:bg-slate-50/60 transition-colors ${isOverdue ? "bg-red-50/30" : ""}`}
                      >
                        <td className="py-3.5 px-5 whitespace-nowrap">
                          <p className="text-xs tabular-nums text-slate-700 font-medium">
                            {format(displayDate, "dd/MM/yy")}
                          </p>
                          {dueDate && recStatus === "pendente" && (
                            <p className={`text-[10px] tabular-nums ${isOverdue ? "text-red-500 font-semibold" : "text-slate-400"}`}>
                              Venc. {format(dueDate, "dd/MM/yy")}
                            </p>
                          )}
                        </td>
                        <td className="py-3.5 px-5 text-sm font-medium text-slate-800 max-w-[180px] truncate">
                          {record.description}
                        </td>
                        <td className="py-3.5 px-5 hidden md:table-cell">
                          <div className="flex flex-col gap-1">
                            {rec.transactionType === "faturaConsolidada" && (
                              <span className="inline-flex items-center gap-1 text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide w-fit">
                                Fatura Consolidada
                              </span>
                            )}
                            {rec.transactionType === "pendenteFatura" && (
                              <span className="inline-flex items-center gap-1 text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide w-fit">
                                Sessão (Pendente Fatura)
                              </span>
                            )}
                            {rec.procedureName ? (
                              <span className="inline-flex items-center gap-1 text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium w-fit">
                                <Link2 className="w-3 h-3" />
                                {rec.procedureName}
                              </span>
                            ) : record.category ? (
                              <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full w-fit">
                                {record.category}
                              </span>
                            ) : !rec.transactionType && <span className="text-xs text-slate-300">—</span>}
                          </div>
                        </td>
                        <td className="py-3.5 px-5 hidden lg:table-cell">
                          {rec.paymentMethod ? (
                            <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full font-medium">
                              {rec.paymentMethod}
                            </span>
                          ) : <span className="text-xs text-slate-300">—</span>}
                        </td>
                        <td className="py-3.5 px-5 hidden sm:table-cell">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${statusInfo.bg} ${statusInfo.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                            {statusInfo.label}
                          </span>
                        </td>
                        <td className={`py-3.5 px-5 text-sm font-bold text-right whitespace-nowrap tabular-nums ${record.type === "receita" ? "text-emerald-600" : "text-red-600"}`}>
                          {record.type === "receita" ? "+" : "−"}{formatCurrency(Number(record.amount))}
                        </td>
                        <td className="py-3.5 px-3 w-20">
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                            <button
                              onClick={() => setEditTarget(record)}
                              className="p-1.5 rounded-lg hover:bg-blue-100 text-slate-300 hover:text-blue-600 transition-all"
                              title="Editar"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget({ id: record.id, description: record.description, amount: Number(record.amount) })}
                              className="p-1.5 rounded-lg hover:bg-red-100 text-slate-300 hover:text-red-500 transition-all"
                              title="Excluir"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {records.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-50 border-t-2 border-slate-200">
                      <td colSpan={6} className="py-3 px-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden md:table-cell">
                        Totais do período
                      </td>
                      <td colSpan={2} className="py-3 px-5 md:hidden" />
                      <td className="py-3 px-5 text-right">
                        {typeFilter !== "despesa" && (
                          <p className="text-sm font-bold text-emerald-600 tabular-nums">+{formatCurrency(totalReceitas)}</p>
                        )}
                        {typeFilter !== "receita" && (
                          <p className="text-sm font-bold text-red-600 tabular-nums">−{formatCurrency(totalDespesas)}</p>
                        )}
                        {typeFilter === "all" && (
                          <p className={`text-sm font-extrabold mt-0.5 tabular-nums ${totalReceitas - totalDespesas >= 0 ? "text-indigo-600" : "text-red-700"}`}>
                            {formatCurrency(totalReceitas - totalDespesas)}
                          </p>
                        )}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modals */}
      <NewRecordModal open={isModalOpen} onClose={() => setIsModalOpen(false)} onSuccess={handleSuccess} />
      <EditRecordModal open={!!editTarget} record={editTarget} onClose={() => setEditTarget(null)} onSuccess={handleSuccess} />

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Excluir Registro</DialogTitle>
            <DialogDescription>
              Confirmar exclusão de <strong>{deleteTarget?.description}</strong> ({formatCurrency(deleteTarget?.amount ?? 0)})?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteRecord} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBillingConfirm} onOpenChange={setShowBillingConfirm}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Executar Cobrança Mensal</DialogTitle>
            <DialogDescription>
              Gera lançamentos financeiros para todas as assinaturas ativas com vencimento em aberto (janela de 3 dias). Esta ação é segura e idempotente — assinaturas já cobradas no mês não serão duplicadas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBillingConfirm(false)}>Cancelar</Button>
            <Button onClick={handleRunBilling} disabled={billingRunning}>
              {billingRunning ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2: CUSTO POR PROCEDIMENTO
// ═══════════════════════════════════════════════════════════════════════════════

