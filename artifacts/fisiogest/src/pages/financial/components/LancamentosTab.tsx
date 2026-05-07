import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Loader2, TrendingUp, TrendingDown, Clock, Ticket,
  Stethoscope, Repeat, ArrowUpRight, ArrowDownRight,
  BarChart3, PiggyBank,
} from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/lib/toast";
import { useGetFinancialDashboard, useListFinancialRecords } from "@workspace/api-client-react";
import { authHeaders, formatCurrency } from "../utils";
import { MONTH_NAMES, PIE_COLORS } from "../constants";
import { NewRecordModal } from "./NewRecordModal";
import { EditRecordModal } from "./EditRecordModal";
import { RecurringPackagesPanel, type BillingStatusData } from "./lancamentos/RecurringPackagesPanel";
import { RecordsTable } from "./lancamentos/RecordsTable";

const NON_REVENUE_TX_TYPES = new Set([
  "pagamento", "depositoCarteira", "vendaPacote",
  "faturaConsolidada", "faturaMensalAvulso", "pendenteFatura",
]);

// ── Skeleton helper ───────────────────────────────────────────────────────────
function Skeleton({ className }: { className?: string }) {
  return <div className={`bg-slate-100 animate-pulse rounded-lg ${className ?? ""}`} />;
}

// ── Mini stat inside hero card ────────────────────────────────────────────────
function HeroStat({
  label, value, color = "text-white",
}: { label: string; value: string; color?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-widest opacity-60 mb-0.5">{label}</p>
      <p className={`text-sm sm:text-base font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

// ── Small secondary KPI card ──────────────────────────────────────────────────
function StatCard({
  label, value, sub, icon, loading,
  accentColor = "#6366f1",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  loading?: boolean;
  accentColor?: string;
}) {
  return (
    <div className="relative bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow duration-150">
      <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: accentColor }} />
      <div className="pl-4 pr-3 py-3.5 sm:py-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight">{label}</p>
          <div className="p-1.5 rounded-lg shrink-0" style={{ backgroundColor: `${accentColor}18`, color: accentColor }}>
            {icon}
          </div>
        </div>
        {loading ? (
          <Skeleton className="h-6 w-20 mt-1" />
        ) : (
          <>
            <p className="text-lg font-extrabold text-slate-900 tabular-nums leading-tight">{value}</p>
            {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function LancamentosTab({ month, year }: { month: number; year: number }) {
  const [typeFilter, setTypeFilter] = useState<"all" | "receita" | "despesa">("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; description: string; amount: number } | null>(null);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [billingPanelOpen, setBillingPanelOpen] = useState(false);
  const [planBillingStatus, setPlanBillingStatus] = useState<BillingStatusData | null>(null);
  const [planBillingStatusLoading, setPlanBillingStatusLoading] = useState(true);
  const [planBillingResult, setPlanBillingResult] = useState<{ generated: number; skipped: number; recordIds: number[] } | null>(null);
  const [planBillingRunning, setPlanBillingRunning] = useState(false);
  const [showPlanBillingUpcoming, setShowPlanBillingUpcoming] = useState(false);
  const { toast } = useToast();

  const { data: dashboard, isLoading: dashLoading, refetch: refetchDash } = useGetFinancialDashboard({ month, year });
  const { data: rawRecords, isLoading: recLoading, refetch: refetchRec } = useListFinancialRecords({ month, year });

  const fetchPlanBillingStatus = useCallback(async () => {
    setPlanBillingStatusLoading(true);
    try {
      const res = await fetch("/api/treatment-plans/billing/status", { headers: authHeaders() });
      if (res.ok) setPlanBillingStatus(await res.json());
    } catch { }
    finally { setPlanBillingStatusLoading(false); }
  }, []);

  useEffect(() => { fetchPlanBillingStatus(); }, [fetchPlanBillingStatus]);

  const records = useMemo(() => {
    const list = ((rawRecords as any)?.data ?? rawRecords ?? []) as any[];
    if (list.length === 0) return [];
    const sorted = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (typeFilter === "all") return sorted;
    return sorted.filter((r) => r.type === typeFilter);
  }, [rawRecords, typeFilter]);

  const totalReceitas = useMemo(() =>
    records.filter((r) =>
      r.type === "receita" &&
      (r as any).status !== "cancelado" &&
      (r as any).status !== "estornado" &&
      !NON_REVENUE_TX_TYPES.has((r as any).transactionType)
    ).reduce((s, r) => s + Number(r.amount), 0),
    [records]);

  const totalDespesas = useMemo(() =>
    records.filter((r) =>
      r.type === "despesa" &&
      (r as any).status !== "cancelado" &&
      (r as any).status !== "estornado"
    ).reduce((s, r) => s + Number(r.amount), 0),
    [records]);

  const pieData = useMemo(() => {
    const cats = dashboard?.revenueByCategory ?? [];
    return cats
      .filter((c: any) => Number(c.revenue) > 0)
      .map((c: any) => ({
        name: c.category === "null" || !c.category ? "Outros" : c.category,
        value: Number(c.revenue),
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

  const handleRunPlanBilling = async () => {
    setPlanBillingRunning(true); setPlanBillingResult(null);
    try {
      const res = await fetch("/api/treatment-plans/billing/run", { method: "POST", headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: "Erro nas faturas mensais", description: data.message });
      } else {
        setPlanBillingResult(data);
        if (data.generated > 0) {
          toast({ title: `${data.generated} fatura(s) mensal(is) gerada(s).` });
          refetchDash(); refetchRec();
        } else {
          toast({ title: data.skipped > 0 ? `Nenhuma fatura nova — ${data.skipped} já existente(s).` : "Nenhum plano com vencimento na janela atual." });
        }
        await fetchPlanBillingStatus();
      }
    } catch { toast({ variant: "destructive", title: "Erro ao executar faturas mensais." }); }
    finally { setPlanBillingRunning(false); }
  };

  // Derived values
  const revenue = dashboard?.monthlyRevenue ?? 0;
  const expenses = dashboard?.monthlyExpenses ?? 0;
  const netProfit = revenue - expenses;
  const isProfitable = netProfit >= 0;
  const marginPct = revenue > 0 ? (netProfit / revenue) * 100 : 0;
  const expenseRatioPct = revenue > 0 ? Math.min(100, (expenses / revenue) * 100) : 0;
  const cashReceived = (dashboard as any)?.cashReceived ?? 0;
  const accountsReceivable = (dashboard as any)?.accountsReceivable ?? 0;
  const mrr = (dashboard as any)?.mrr ?? 0;
  const activeSubscriptions = (dashboard as any)?.activeSubscriptions ?? 0;
  const monthLabel = MONTH_NAMES[month - 1];

  return (
    <div className="space-y-5">

      {/* ── HERO: Resultado do Mês ───────────────────────────────────────── */}
      <div className={`relative rounded-2xl overflow-hidden px-5 sm:px-7 py-6 ${isProfitable
        ? "bg-gradient-to-br from-emerald-500 to-emerald-600"
        : "bg-gradient-to-br from-red-500 to-red-600"
        }`}>
        {/* Decorative circles */}
        <div className="pointer-events-none absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -right-4 -bottom-10 w-28 h-28 rounded-full bg-white/5" />

        <div className="relative flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
          {/* Left: main number */}
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/60 mb-1.5">
              Resultado — {monthLabel} {year}
            </p>

            {dashLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-36 bg-white/20" />
                <Skeleton className="h-4 w-24 bg-white/10" />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <p className="text-3xl sm:text-4xl font-black text-white tabular-nums tracking-tight">
                    {isProfitable ? "+" : ""}{formatCurrency(netProfit)}
                  </p>
                  {isProfitable
                    ? <ArrowUpRight className="w-6 h-6 text-white/70" />
                    : <ArrowDownRight className="w-6 h-6 text-white/70" />}
                </div>
                <p className="text-xs text-white/60 mt-1 font-medium">
                  {isProfitable ? `Margem de ${marginPct.toFixed(1)}%` : "Resultado negativo no período"}
                </p>
              </>
            )}

            {/* Expense ratio bar */}
            {!dashLoading && (
              <div className="mt-4 max-w-xs">
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
            )}
          </div>

          {/* Right: breakdown stats */}
          <div className="flex sm:flex-col gap-5 sm:gap-4 sm:min-w-[160px]">
            {dashLoading ? (
              <>
                <Skeleton className="h-10 w-28 bg-white/20" />
                <Skeleton className="h-10 w-28 bg-white/20" />
              </>
            ) : (
              <>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-white/60" />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">Receitas</p>
                  </div>
                  <p className="text-lg sm:text-xl font-bold text-white tabular-nums">{formatCurrency(revenue)}</p>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">Despesas</p>
                  </div>
                  <p className="text-lg sm:text-xl font-bold text-white/80 tabular-nums">{formatCurrency(expenses)}</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── SECONDARY KPIs ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Caixa Recebido"
          value={dashLoading ? "—" : formatCurrency(cashReceived)}
          sub="Entradas no período"
          icon={<PiggyBank className="w-3.5 h-3.5" />}
          accentColor="#0ea5e9"
          loading={dashLoading}
        />
        <StatCard
          label="A Receber"
          value={dashLoading ? "—" : formatCurrency(accountsReceivable)}
          sub="Títulos em aberto"
          icon={<Clock className="w-3.5 h-3.5" />}
          accentColor="#f59e0b"
          loading={dashLoading}
        />
        <StatCard
          label="MRR"
          value={dashLoading ? "—" : formatCurrency(mrr)}
          sub={`${activeSubscriptions} pacote(s) ativo(s)`}
          icon={<Repeat className="w-3.5 h-3.5" />}
          accentColor="#8b5cf6"
          loading={dashLoading}
        />
        <StatCard
          label="Ticket Médio"
          value={dashLoading ? "—" : formatCurrency(dashboard?.averageTicket ?? 0)}
          sub={dashboard?.completedAppointments != null
            ? `${dashboard.completedAppointments}/${dashboard.totalAppointments} consultas`
            : undefined}
          icon={<Ticket className="w-3.5 h-3.5" />}
          accentColor="#10b981"
          loading={dashLoading}
        />
      </div>

      {/* ── CHART + TOP PROCEDURE ROW ────────────────────────────────────── */}
      {!dashLoading && (pieData.length > 0 || (dashboard?.topProcedure)) && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* Donut: receita por categoria */}
          {pieData.length > 0 && (
            <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
                Receita por Categoria — {monthLabel} {year}
              </p>
              <div className="flex flex-col sm:flex-row items-center gap-5">
                <div className="shrink-0">
                  <ResponsiveContainer width={160} height={160}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={48}
                        outerRadius={72}
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
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 min-w-0 w-full space-y-2">
                  {pieData.map((item: any, idx: number) => {
                    const total = pieData.reduce((s: number, p: any) => s + p.value, 0);
                    const pct = total > 0 ? (item.value / total) * 100 : 0;
                    const color = PIE_COLORS[idx % PIE_COLORS.length];
                    return (
                      <div key={item.name} className="flex items-center gap-2.5">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-xs text-slate-600 truncate flex-1">{item.name}</span>
                        <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">{pct.toFixed(0)}%</span>
                        <span className="text-xs font-semibold text-slate-700 tabular-nums shrink-0">{formatCurrency(item.value)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Side: top procedure + consultas */}
          <div className={`flex flex-col gap-3 ${pieData.length > 0 ? "lg:col-span-2" : "lg:col-span-5"}`}>
            {/* Top procedure */}
            {dashboard?.topProcedure && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 rounded-xl bg-violet-50">
                    <Stethoscope className="w-4 h-4 text-violet-500" />
                  </div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Top Procedimento</p>
                </div>
                <p className="text-sm font-bold text-slate-800 leading-snug">{dashboard.topProcedure}</p>
                <p className="text-xs text-slate-400 mt-1">Mais realizado no período</p>
              </div>
            )}

            {/* Consultas realizadas */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex-1">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 rounded-xl bg-sky-50">
                  <TrendingUp className="w-4 h-4 text-sky-500" />
                </div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Consultas</p>
              </div>
              <div className="flex items-end gap-2">
                <p className="text-2xl font-extrabold text-slate-900 tabular-nums">{dashboard?.completedAppointments ?? 0}</p>
                <p className="text-sm text-slate-400 mb-0.5">de {dashboard?.totalAppointments ?? 0} agendadas</p>
              </div>
              {(dashboard?.totalAppointments ?? 0) > 0 && (
                <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-sky-400 transition-all duration-700"
                    style={{ width: `${Math.min(100, ((dashboard?.completedAppointments ?? 0) / (dashboard?.totalAppointments ?? 1)) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── FATURAS DOS PLANOS DE TRATAMENTO ────────────────────────────── */}
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

      {/* ── TABELA DE LANÇAMENTOS ────────────────────────────────────────── */}
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
        <DialogContent className="rounded-2xl w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir Registro</DialogTitle>
            <DialogDescription>
              Confirmar exclusão de <strong>{deleteTarget?.description}</strong> ({formatCurrency(deleteTarget?.amount ?? 0)})?
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} className="w-full sm:w-auto rounded-xl">Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteRecord} disabled={isDeleting} className="w-full sm:w-auto rounded-xl">
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
