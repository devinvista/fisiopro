import { useState } from "react";
import { CalendarDays, Receipt, BarChart3, Target, Activity, Settings2, Wallet, RotateCcw, Layers } from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MONTH_NAMES, YEARS } from "./constants";
import { LancamentosTab } from "./components/LancamentosTab";
import { CustosPorProcedimentoTab } from "./components/CustosPorProcedimentoTab";
import { OrcadoRealizadoTab } from "./components/OrcadoRealizadoTab";
import { DreTab } from "./components/DreTab";
import { DespesasFixasTab } from "./components/DespesasFixasTab";
import { CashFlowTab } from "./components/CashFlowTab";
import { EstornosTab } from "./components/EstornosTab";
import { DreByProcedureTab } from "./components/DreByProcedureTab";
import { useAuth } from "@/hooks/use-auth";
import type { Feature } from "@/utils/plan-features";

interface TabDef {
  value: string;
  icon: React.ReactNode;
  label: string;
  /** Feature exigida para exibir a aba; ausência = aparece para todos. */
  feature?: Feature;
}

const ALL_TABS: TabDef[] = [
  { value: "lancamentos",     icon: <Receipt className="w-3.5 h-3.5" />,    label: "Lançamentos",          feature: "financial.view.simple" },
  { value: "custos",          icon: <BarChart3 className="w-3.5 h-3.5" />,  label: "Custo/Procedimento",   feature: "financial.cost_per_procedure" },
  { value: "orcado",          icon: <Target className="w-3.5 h-3.5" />,     label: "Orçado vs Realizado",  feature: "financial.view.budget" },
  { value: "fluxo-caixa",     icon: <Wallet className="w-3.5 h-3.5" />,     label: "Fluxo de Caixa",       feature: "financial.view.cash_flow" },
  { value: "dre",             icon: <Activity className="w-3.5 h-3.5" />,   label: "DRE Mensal",           feature: "financial.view.dre" },
  { value: "despesas-fixas",  icon: <Settings2 className="w-3.5 h-3.5" />,  label: "Despesas Fixas",       feature: "module.recurring_expenses" },
  { value: "estornos",        icon: <RotateCcw className="w-3.5 h-3.5" />,  label: "Estornos",             feature: "financial.view.simple" },
  { value: "dre-procedimento",icon: <Layers className="w-3.5 h-3.5" />,     label: "DRE/Procedimento",     feature: "financial.view.accounting" },
];

export default function Financial() {
  const { hasFeature } = useAuth();
  const visibleTabs = ALL_TABS.filter((t) => !t.feature || hasFeature(t.feature));
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [activeTab, setActiveTab] = useState<string>(() => visibleTabs[0]?.value ?? "lancamentos");

  return (
    <AppLayout title="Controle Financeiro">
      {/* ── Page Header ── */}
      <div className="mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 truncate">Controle Financeiro</h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Acompanhamento de receitas, despesas e resultado
            </p>
          </div>

          {/* Period selector */}
          <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 shadow-sm border border-slate-200 w-full sm:w-auto">
            <CalendarDays className="w-4 h-4 text-slate-400" />
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
        {hasFeature("financial.cost_per_procedure") && (
          <TabsContent value="custos">
            <CustosPorProcedimentoTab month={month} year={year} />
          </TabsContent>
        )}
        {hasFeature("financial.view.budget") && (
          <TabsContent value="orcado">
            <OrcadoRealizadoTab month={month} year={year} />
          </TabsContent>
        )}
        {hasFeature("financial.view.cash_flow") && (
          <TabsContent value="fluxo-caixa">
            <CashFlowTab />
          </TabsContent>
        )}
        {hasFeature("financial.view.dre") && (
          <TabsContent value="dre">
            <DreTab month={month} year={year} />
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
        {hasFeature("financial.view.accounting") && (
          <TabsContent value="dre-procedimento">
            <DreByProcedureTab />
          </TabsContent>
        )}
      </Tabs>
    </AppLayout>
  );
}
