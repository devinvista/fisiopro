import { useState, useMemo, useEffect, useCallback } from "react";
import {
  BarChart3, Clock, DollarSign, Loader2, PiggyBank, RefreshCw, Repeat,
  Stethoscope, Ticket, TrendingDown, TrendingUp,
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
import { useToast } from "@/lib/toast";
import { useGetFinancialDashboard, useListFinancialRecords } from "@workspace/api-client-react";
import { authHeaders, formatCurrency } from "../utils";
import { MONTH_NAMES, PIE_COLORS } from "../constants";
import { KpiCard } from "./KpiCard";
import { NewRecordModal } from "./NewRecordModal";
import { EditRecordModal } from "./EditRecordModal";
import { SubscriptionBillingPanel, type BillingStatusData } from "./lancamentos/SubscriptionBillingPanel";
import { RecordsTable } from "./lancamentos/RecordsTable";

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1: LANÇAMENTOS
// ═══════════════════════════════════════════════════════════════════════════════

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
      <SubscriptionBillingPanel
        billingStatus={billingStatus}
        billingStatusLoading={billingStatusLoading}
        billingResult={billingResult}
        billingRunning={billingRunning}
        panelOpen={billingPanelOpen}
        setPanelOpen={setBillingPanelOpen}
        showUpcoming={showUpcoming}
        setShowUpcoming={setShowUpcoming}
        onRequestRun={() => setShowBillingConfirm(true)}
      />

      {/* ── Transaction List ── */}
      <RecordsTable
        records={records}
        recLoading={recLoading}
        month={month}
        year={year}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        totalReceitas={totalReceitas}
        totalDespesas={totalDespesas}
        onNew={() => setIsModalOpen(true)}
        onEdit={(record) => setEditTarget(record)}
        onDelete={(info) => setDeleteTarget(info)}
      />
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

