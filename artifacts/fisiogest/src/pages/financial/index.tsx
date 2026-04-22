import { useState } from "react";
import { CalendarDays, Receipt, BarChart3, Target, Activity, Settings2 } from "lucide-react";
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

export default function Financial() {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [activeTab, setActiveTab] = useState("lancamentos");

  return (
    <AppLayout title="Controle Financeiro">
      {/* ── Page Header ── */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Controle Financeiro</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Acompanhamento de receitas, despesas e resultado
            </p>
          </div>

          {/* Period selector */}
          <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 shadow-sm border border-slate-200">
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
        <div className="mb-6 overflow-x-auto">
          <TabsList className="inline-flex bg-slate-100/80 rounded-xl p-1 gap-1 h-auto min-w-max">
            {[
              { value: "lancamentos", icon: <Receipt className="w-3.5 h-3.5" />, label: "Lançamentos" },
              { value: "custos", icon: <BarChart3 className="w-3.5 h-3.5" />, label: "Custo/Procedimento" },
              { value: "orcado", icon: <Target className="w-3.5 h-3.5" />, label: "Orçado vs Realizado" },
              { value: "dre", icon: <Activity className="w-3.5 h-3.5" />, label: "DRE Mensal" },
              { value: "despesas-fixas", icon: <Settings2 className="w-3.5 h-3.5" />, label: "Despesas Fixas" },
            ].map((tab) => (
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

        <TabsContent value="lancamentos">
          <LancamentosTab month={month} year={year} />
        </TabsContent>
        <TabsContent value="custos">
          <CustosPorProcedimentoTab month={month} year={year} />
        </TabsContent>
        <TabsContent value="orcado">
          <OrcadoRealizadoTab month={month} year={year} />
        </TabsContent>
        <TabsContent value="dre">
          <DreTab month={month} year={year} />
        </TabsContent>
        <TabsContent value="despesas-fixas">
          <DespesasFixasTab />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
