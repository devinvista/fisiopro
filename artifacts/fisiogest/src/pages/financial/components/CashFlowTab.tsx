/**
 * CashFlowTab — Sprint 3 — T7
 * Aba "Fluxo de Caixa Projetado" do módulo financeiro.
 *
 * Renderiza:
 *   • KPIs (saldo inicial, entradas/saídas previstas, saldo final, menor saldo)
 *   • Gráfico de área com saldo projetado, entradas, saídas e linha de
 *     reserva mínima (cash_reserve_target)
 *   • Tabela diária expandível com alertas quando o saldo cai abaixo da reserva
 *     ou fica negativo
 */
import { useState, useEffect, useCallback } from "react";
import {
  Loader2, AlertTriangle, TrendingUp, TrendingDown, Wallet, ArrowDownToLine,
  ArrowUpFromLine, CalendarRange, ShieldAlert, Info,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { authHeaders, formatCurrency } from "../utils";
import { KpiCard } from "./KpiCard";

interface SeriesPoint {
  date: string;
  opening: number;
  expectedIn: number;
  expectedOut: number;
  closing: number;
  adhocOut: number;
  recurringOut: number;
  inflowCount: number;
  outflowCount: number;
  alert: "below_reserve" | "negative" | null;
}

interface CashFlowResponse {
  days: number;
  startDate: string;
  endDate: string;
  openingBalance: number;
  cashReserveTarget: number | null;
  totals: {
    expectedIn: number;
    expectedOut: number;
    netChange: number;
    finalBalance: number;
    lowestBalance: number;
  };
  breachesReserve: boolean;
  series: SeriesPoint[];
}

const RANGE_OPTIONS = [
  { value: "15", label: "15 dias" },
  { value: "30", label: "30 dias" },
  { value: "60", label: "60 dias" },
  { value: "90", label: "90 dias" },
];

function formatDayLabel(iso: string): string {
  // YYYY-MM-DD → "DD/MM" (sem ano para legibilidade no eixo X)
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function formatFullDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function CashFlowTab() {
  const [days, setDays] = useState("30");
  const [data, setData] = useState<CashFlowResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/financial/cash-flow-projection?days=${days}`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message ?? `Erro ${res.status}`);
      }
      const json: CashFlowResponse = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar projeção.");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertTriangle className="h-10 w-10 text-amber-500 mb-3" />
        <p className="text-sm text-muted-foreground">{error ?? "Sem dados."}</p>
      </div>
    );
  }

  const chartData = data.series.map((p) => ({
    ...p,
    label: formatDayLabel(p.date),
  }));

  const reserveDefined = data.cashReserveTarget !== null;
  const breachDays = data.series.filter((p) => p.alert).length;

  return (
    <div className="space-y-6">
      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <CalendarRange className="h-4 w-4 text-slate-400" />
          <span>
            Projeção de {formatFullDate(data.startDate)} a {formatFullDate(data.endDate)}
          </span>
        </div>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-40 rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            {RANGE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Alerta de violação de reserva ───────────────────────────────── */}
      {data.breachesReserve && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 space-y-1">
            <p className="font-semibold">Atenção ao capital de giro</p>
            <p>
              Em <strong>{breachDays} {breachDays === 1 ? "dia" : "dias"}</strong> o saldo projetado
              {data.cashReserveTarget !== null && <> ficará abaixo da reserva mínima de <strong>{formatCurrency(data.cashReserveTarget)}</strong></>}
              {data.cashReserveTarget === null && <> ficará negativo</>}.
              {!reserveDefined && (
                <> Configure uma reserva mínima em <Link href="/configuracoes#financeiro" className="underline font-medium">Configurações → Financeiro</Link>.</>
              )}
            </p>
          </div>
        </div>
      )}

      {/* ── KPIs ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard
          icon={<Wallet className="h-4 w-4" />}
          label="Saldo inicial"
          value={formatCurrency(data.openingBalance)}
          accentColor="#0ea5e9"
        />
        <KpiCard
          icon={<ArrowDownToLine className="h-4 w-4" />}
          label="Entradas previstas"
          value={formatCurrency(data.totals.expectedIn)}
          accentColor="#22c55e"
        />
        <KpiCard
          icon={<ArrowUpFromLine className="h-4 w-4" />}
          label="Saídas previstas"
          value={formatCurrency(data.totals.expectedOut)}
          accentColor="#f97316"
        />
        <KpiCard
          icon={data.totals.netChange >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          label="Saldo final projetado"
          value={formatCurrency(data.totals.finalBalance)}
          accentColor={data.totals.finalBalance < 0 ? "#ef4444" : data.totals.netChange >= 0 ? "#10b981" : "#64748b"}
        />
        <KpiCard
          icon={<TrendingDown className="h-4 w-4" />}
          label="Menor saldo no período"
          value={formatCurrency(data.totals.lowestBalance)}
          accentColor={
            data.totals.lowestBalance < 0
              ? "#ef4444"
              : data.cashReserveTarget !== null && data.totals.lowestBalance < data.cashReserveTarget
                ? "#f59e0b"
                : "#10b981"
          }
        />
      </div>

      {/* ── Gráfico ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4 text-emerald-600" />
            Saldo projetado
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="w-full h-80">
            <ResponsiveContainer>
              <ComposedChart data={chartData} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v).replace("R$", "")} />
                <Tooltip
                  formatter={(v: number, n: string) => [formatCurrency(v), n]}
                  labelFormatter={(l, payload) => {
                    const item = payload?.[0]?.payload as (typeof chartData)[number] | undefined;
                    return item ? formatFullDate(item.date) : String(l);
                  }}
                  contentStyle={{ borderRadius: 12, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="expectedIn" name="Entradas" fill="#22c55e" radius={[3, 3, 0, 0]} barSize={6} />
                <Bar dataKey="expectedOut" name="Saídas" fill="#f97316" radius={[3, 3, 0, 0]} barSize={6} />
                <Area type="monotone" dataKey="closing" name="Saldo" stroke="#10b981" strokeWidth={2} fill="url(#balanceFill)" />
                {reserveDefined && (
                  <ReferenceLine
                    y={data.cashReserveTarget!}
                    stroke="#ef4444"
                    strokeDasharray="6 4"
                    label={{ value: `Reserva mínima ${formatCurrency(data.cashReserveTarget!)}`, position: "insideTopRight", fill: "#ef4444", fontSize: 11 }}
                  />
                )}
                <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {!reserveDefined && (
            <div className="mt-3 flex items-start gap-2 text-xs text-slate-500 bg-slate-50 rounded-xl px-3 py-2.5">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                Sem reserva mínima configurada — alertas só serão acionados se o saldo ficar negativo.{" "}
                <Link href="/configuracoes#financeiro" className="underline font-medium">Configurar</Link>
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Tabela diária ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Detalhamento diário</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 text-xs text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Dia</th>
                  <th className="text-right font-medium px-4 py-2.5">Saldo abertura</th>
                  <th className="text-right font-medium px-4 py-2.5">Entradas</th>
                  <th className="text-right font-medium px-4 py-2.5">Saídas</th>
                  <th className="text-right font-medium px-4 py-2.5">Saldo fim</th>
                  <th className="text-right font-medium px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.series.map((p) => {
                  const dim = p.expectedIn === 0 && p.expectedOut === 0;
                  return (
                    <tr key={p.date} className={`border-t border-slate-100 ${dim ? "text-slate-400" : "text-slate-700"}`}>
                      <td className="px-4 py-2 font-medium">{formatFullDate(p.date)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(p.opening)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {p.expectedIn > 0 ? (
                          <span className="text-emerald-600">+{formatCurrency(p.expectedIn)}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {p.expectedOut > 0 ? (
                          <span className="text-rose-600">−{formatCurrency(p.expectedOut)}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className={`px-4 py-2 text-right tabular-nums font-semibold ${p.closing < 0 ? "text-rose-600" : ""}`}>
                        {formatCurrency(p.closing)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {p.alert === "negative" && (
                          <Badge variant="destructive" className="text-[10px] gap-1">
                            <AlertTriangle className="h-3 w-3" /> Negativo
                          </Badge>
                        )}
                        {p.alert === "below_reserve" && (
                          <Badge className="text-[10px] gap-1 bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">
                            <ShieldAlert className="h-3 w-3" /> Abaixo reserva
                          </Badge>
                        )}
                        {!p.alert && !dim && (
                          <span className="text-xs text-emerald-600">OK</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button variant="outline" onClick={fetchData} className="gap-2">
          Atualizar projeção
        </Button>
      </div>
    </div>
  );
}
