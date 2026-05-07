import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays, Receipt, Wallet, RotateCcw, Settings2,
  TrendingUp, TrendingDown, DollarSign, AlertCircle,
} from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MONTH_NAMES, YEARS } from "./constants";
import { formatCurrency, authHeaders } from "./utils";
import { LancamentosTab } from "./components/LancamentosTab";
import { CashFlowTab } from "./components/CashFlowTab";
import { EstornosTab } from "./components/EstornosTab";
import { DespesasFixasTab } from "./components/DespesasFixasTab";
import { useAuth } from "@/hooks/use-auth";
import type { Feature } from "@/utils/plan-features";

interface TabDef {
  value: string;
  icon: React.ReactNode;
  label: string;
  feature?: Feature;
}

const ALL_TABS: TabDef[] = [
  { value: "lancamentos",    icon: <Receipt className="w-3.5 h-3.5" />,   label: "Lançamentos",    feature: "financial.view.simple" },
  { value: "fluxo-caixa",   icon: <Wallet className="w-3.5 h-3.5" />,    label: "Fluxo de Caixa", feature: "financial.view.cash_flow" },
  { value: "despesas-fixas", icon: <Settings2 className="w-3.5 h-3.5" />, label: "Despesas Fixas", feature: "module.recurring_expenses" },
  { value: "estornos",       icon: <RotateCcw className="w-3.5 h-3.5" />, label: "Estornos",       feature: "financial.view.simple" },
];

function FinancialKpiStrip({ month, year }: { month: number; year: number }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["financial-dashboard-strip", month, year],
    queryFn: async () => {
      const res = await fetch(`/api/financial/dashboard?month=${month}&year=${year}`, {
        headers: authHeaders(),
      });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 60_000,
  });

  const skeleton = "h-7 w-24 bg-slate-100 animate-pulse rounded";

  const receita = Number(data?.totalReceitas ?? 0);
  const despesa = Number(data?.totalDespesas ?? 0);
  const saldo = receita - despesa;
  const pendente = Number(data?.totalPendente ?? 0);

  const kpis = [
    {
      label: "Receitas",
      value: isLoading ? null : formatCurrency(receita),
      color: "text-emerald-600",
      icon: <TrendingUp className="w-4 h-4 text-emerald-500" />,
      accent: "border-l-emerald-400",
    },
    {
      label: "Despesas",
      value: isLoading ? null : formatCurrency(despesa),
      color: "text-red-600",
      icon: <TrendingDown className="w-4 h-4 text-red-400" />,
      accent: "border-l-red-400",
    },
    {
      label: "Saldo",
      value: isLoading ? null : formatCurrency(saldo),
      color: saldo >= 0 ? "text-indigo-600" : "text-red-700",
      icon: <DollarSign className="w-4 h-4 text-indigo-400" />,
      accent: saldo >= 0 ? "border-l-indigo-400" : "border-l-red-400",
    },
    {
      label: "A Receber",
      value: isLoading ? null : formatCurrency(pendente),
      color: "text-amber-600",
      icon: <AlertCircle className="w-4 h-4 text-amber-400" />,
      accent: "border-l-amber-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {kpis.map((k) => (
        <div
          key={k.label}
          className={`bg-white rounded-2xl border border-slate-100 shadow-sm pl-4 pr-4 py-4 border-l-4 ${k.accent}`}
        >
          <div className="flex items-center gap-2 mb-1.5">
            {k.icon}
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{k.label}</p>
          </div>
          {k.value === null ? (
            <div className={skeleton} />
          ) : (
            <p className={`text-lg font-extrabold tabular-nums ${k.color}`}>{k.value}</p>
          )}
        </div>
      ))}
    </div>
  );
}

export default function Financial() {
  const { hasFeature } = useAuth();
  const visibleTabs = ALL_TABS.filter((t) => !t.feature || hasFeature(t.feature));
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [activeTab, setActiveTab] = useState<string>(() => visibleTabs[0]?.value ?? "lancamentos");

  return (
    <AppLayout title="Financeiro">
      <div className="mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 truncate">Financeiro</h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Gestão operacional de receitas, despesas e caixa
            </p>
          </div>

          <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 shadow-sm border border-slate-200 w-full sm:w-auto">
            <CalendarDays className="w-4 h-4 text-slate-400 shrink-0" />
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
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
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="h-8 w-20 rounded-lg border-0 bg-transparent text-sm font-semibold text-slate-700 focus:ring-0 shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <FinancialKpiStrip month={month} year={year} />

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
          <TabsContent value="lancamentos">
            <LancamentosTab month={month} year={year} />
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
        {hasFeature("financial.view.simple") && (
          <TabsContent value="estornos">
            <EstornosTab />
          </TabsContent>
        )}
      </Tabs>
    </AppLayout>
  );
}
