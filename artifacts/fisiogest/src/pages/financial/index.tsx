import { useState, useCallback, useEffect } from "react";
import {
  CalendarDays, Receipt, Wallet, Settings2, ClipboardList,
  LayoutDashboard, TrendingUp, TrendingDown, ChevronLeft, ChevronRight,
  Plus, ArrowUpRight, ArrowDownRight, Minus,
} from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { PrimaryActionButton } from "@/components/ui/primary-action-button";
import { MONTH_NAMES, YEARS } from "./constants";
import { VisaoMesTab } from "./components/VisaoMesTab";
import { LancamentosTab } from "./components/LancamentosTab";
import { CashFlowTab } from "./components/CashFlowTab";
import { DespesasFixasTab } from "./components/DespesasFixasTab";
import { ContasReceberTab } from "./components/ContasReceberTab";
import { useAuth } from "@/hooks/use-auth";
import { authHeaders, formatCurrency } from "./utils";
import type { Feature } from "@/utils/plan-features";

interface TabDef {
  value: string;
  icon: React.ReactNode;
  label: string;
  feature?: Feature;
}

const ALL_TABS: TabDef[] = [
  { value: "visao-geral",     icon: <LayoutDashboard className="w-3.5 h-3.5" />, label: "Visão Geral",    feature: "financial.view.simple" },
  { value: "lancamentos",     icon: <Receipt className="w-3.5 h-3.5" />,         label: "Lançamentos",    feature: "financial.view.simple" },
  { value: "contas-receber",  icon: <ClipboardList className="w-3.5 h-3.5" />,   label: "A Receber",      feature: "financial.view.simple" },
  { value: "fluxo-caixa",    icon: <Wallet className="w-3.5 h-3.5" />,           label: "Fluxo de Caixa", feature: "financial.view.cash_flow" },
  { value: "despesas-fixas",  icon: <Settings2 className="w-3.5 h-3.5" />,       label: "Despesas Fixas", feature: "module.recurring_expenses" },
];

interface DashboardSummary {
  monthlyRevenue: number;
  monthlyExpenses: number;
  accountsReceivable: number;
}

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
        <ChevronLeft className="w-4 h-4" />
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
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function SummaryStrip({ month, year }: { month: number; year: number }) {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/financial/dashboard?month=${month}&year=${year}`, {
        headers: authHeaders(),
      });
      if (res.ok) setData(await res.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [month, year]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const revenue  = Number(data?.monthlyRevenue ?? 0);
  const expenses = Number(data?.monthlyExpenses ?? 0);
  const result   = revenue - expenses;
  const ar       = Number(data?.accountsReceivable ?? 0);
  const isProfitable = result >= 0;

  const Sk = () => <div className="h-5 w-16 bg-slate-200 animate-pulse rounded" />;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-6">

      {/* Receitas */}
      <div className="bg-white border border-slate-100 rounded-2xl px-4 py-3.5 shadow-sm flex items-center gap-3 group hover:border-emerald-200 transition-colors">
        <div className="p-2 rounded-xl bg-emerald-50 shrink-0">
          <TrendingUp className="w-4 h-4 text-emerald-500" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Receitas</p>
          {loading ? <Sk /> : (
            <p className="text-base font-bold text-emerald-700 tabular-nums truncate">{formatCurrency(revenue)}</p>
          )}
        </div>
      </div>

      {/* Despesas */}
      <div className="bg-white border border-slate-100 rounded-2xl px-4 py-3.5 shadow-sm flex items-center gap-3 group hover:border-rose-200 transition-colors">
        <div className="p-2 rounded-xl bg-rose-50 shrink-0">
          <TrendingDown className="w-4 h-4 text-rose-500" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Despesas</p>
          {loading ? <Sk /> : (
            <p className="text-base font-bold text-rose-700 tabular-nums truncate">{formatCurrency(expenses)}</p>
          )}
        </div>
      </div>

      {/* Resultado */}
      <div className={`border rounded-2xl px-4 py-3.5 shadow-sm flex items-center gap-3 transition-colors ${
        loading ? "bg-white border-slate-100"
        : isProfitable ? "bg-emerald-50 border-emerald-100" : "bg-red-50 border-red-100"
      }`}>
        <div className={`p-2 rounded-xl shrink-0 ${loading ? "bg-slate-100" : isProfitable ? "bg-emerald-100" : "bg-red-100"}`}>
          {loading
            ? <Minus className="w-4 h-4 text-slate-400" />
            : isProfitable
              ? <ArrowUpRight className="w-4 h-4 text-emerald-600" />
              : <ArrowDownRight className="w-4 h-4 text-red-500" />}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resultado</p>
          {loading ? <Sk /> : (
            <p className={`text-base font-bold tabular-nums truncate ${isProfitable ? "text-emerald-700" : "text-red-700"}`}>
              {isProfitable ? "+" : ""}{formatCurrency(result)}
            </p>
          )}
        </div>
      </div>

      {/* A Receber */}
      <div className="bg-white border border-slate-100 rounded-2xl px-4 py-3.5 shadow-sm flex items-center gap-3 group hover:border-amber-200 transition-colors">
        <div className="p-2 rounded-xl bg-amber-50 shrink-0">
          <CalendarDays className="w-4 h-4 text-amber-500" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">A Receber</p>
          {loading ? <Sk /> : (
            <p className="text-base font-bold text-amber-700 tabular-nums truncate">{formatCurrency(ar)}</p>
          )}
        </div>
      </div>

    </div>
  );
}

export default function Financial() {
  const { hasFeature } = useAuth();
  const visibleTabs = ALL_TABS.filter((t) => !t.feature || hasFeature(t.feature));
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [activeTab, setActiveTab] = useState<string>(() => visibleTabs[0]?.value ?? "visao-geral");
  const [triggerNewRecord, setTriggerNewRecord] = useState(false);

  return (
    <AppLayout title="Financeiro">

      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-400">Caixa, receitas, despesas e contas a receber</p>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <MonthNavigator
            month={month}
            year={year}
            onMonthChange={setMonth}
            onYearChange={setYear}
          />
          {hasFeature("financial.view.simple") && (
            <PrimaryActionButton
              label="Novo Lançamento"
              mobileLabel="Novo"
              onClick={() => {
                setActiveTab("lancamentos");
                setTriggerNewRecord(true);
              }}
            />
          )}
        </div>
      </div>

      {/* ── Summary Strip (always visible) ───────────────────────────────── */}
      {hasFeature("financial.view.simple") && (
        <SummaryStrip month={month} year={year} />
      )}

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">

        <div className="relative mb-6">
          <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabsList className="inline-flex bg-slate-100/80 rounded-xl p-1 gap-0.5 h-auto min-w-max">
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
          <TabsContent value="visao-geral">
            <VisaoMesTab month={month} year={year} />
          </TabsContent>
        )}
        {hasFeature("financial.view.simple") && (
          <TabsContent value="lancamentos">
            <LancamentosTab
              month={month}
              year={year}
              triggerNew={triggerNewRecord}
              onTriggerNewConsumed={() => setTriggerNewRecord(false)}
            />
          </TabsContent>
        )}
        {hasFeature("financial.view.simple") && (
          <TabsContent value="contas-receber">
            <ContasReceberTab />
          </TabsContent>
        )}
        {hasFeature("financial.view.cash_flow") && (
          <TabsContent value="fluxo-caixa">
            <CashFlowTab />
          </TabsContent>
        )}
        {hasFeature("module.recurring_expenses") && (
          <TabsContent value="despesas-fixas">
            <DespesasFixasTab />
          </TabsContent>
        )}
      </Tabs>
    </AppLayout>
  );
}
