import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Sun, Clock, TrendingUp, Calendar, Flame, BarChart3, DollarSign,
  AlertTriangle, Loader2,
} from "lucide-react";
import { authFetch, formatCurrency } from "../relatorios/constants";
import { MONTH_NAMES } from "../constants";

// ── Types ─────────────────────────────────────────────────────────────────────
interface SeasonalityCell {
  dayOfWeek: number;
  hour: number;
  appointmentCount: number;
  attendedCount: number;
  noShowCount: number;
  canceledCount: number;
  revenue: number;
}

interface SeasonalityData {
  period: { year: number; month: number | null; startDate: string; endDate: string };
  cells: SeasonalityCell[];
  summary: {
    totalAppointments: number;
    totalRevenue: number;
    peakDay: { dayOfWeek: number; count: number; label: string };
    peakHour: { hour: number; count: number; label: string };
    peakSlot: { dayOfWeek: number; hour: number; count: number; dayLabel: string; hourLabel: string };
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────
const DOW_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
// Brazilian week: Mon → Sun (index 1-6, 0)
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];
const HOURS = Array.from({ length: 15 }, (_, i) => i + 6); // 06:00 – 20:00

type ViewMode = "appointments" | "revenue" | "noshow";

const VIEW_OPTIONS: { value: ViewMode; label: string; icon: React.ReactNode; color: string }[] = [
  { value: "appointments", label: "Agendamentos", icon: <Calendar className="w-3.5 h-3.5" />, color: "indigo" },
  { value: "revenue",      label: "Receita",       icon: <DollarSign className="w-3.5 h-3.5" />, color: "emerald" },
  { value: "noshow",       label: "Faltas",         icon: <AlertTriangle className="w-3.5 h-3.5" />, color: "amber" },
];

// ── Color interpolation ───────────────────────────────────────────────────────
function cellBg(value: number, max: number, mode: ViewMode): string {
  if (max === 0 || value === 0) return "bg-slate-50";
  const ratio = value / max;

  if (mode === "appointments") {
    if (ratio < 0.2)  return "bg-indigo-50";
    if (ratio < 0.4)  return "bg-indigo-100";
    if (ratio < 0.6)  return "bg-indigo-200";
    if (ratio < 0.8)  return "bg-indigo-400";
    return "bg-indigo-600";
  }
  if (mode === "revenue") {
    if (ratio < 0.2)  return "bg-emerald-50";
    if (ratio < 0.4)  return "bg-emerald-100";
    if (ratio < 0.6)  return "bg-emerald-200";
    if (ratio < 0.8)  return "bg-emerald-400";
    return "bg-emerald-600";
  }
  // noshow: red scale
  if (ratio < 0.2)  return "bg-amber-50";
  if (ratio < 0.4)  return "bg-amber-100";
  if (ratio < 0.6)  return "bg-amber-200";
  if (ratio < 0.8)  return "bg-amber-400";
  return "bg-amber-600";
}

function cellText(value: number, max: number): string {
  if (max === 0 || value === 0) return "text-slate-300";
  const ratio = value / max;
  return ratio >= 0.6 ? "text-white" : "text-slate-700";
}

// ── Main component ────────────────────────────────────────────────────────────
export function SazonalidadeTab({
  selectedYear,
  selectedMonth,
}: {
  selectedYear: string;
  selectedMonth: string;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("appointments");
  const [scope, setScope] = useState<"year" | "month">("year");

  const queryParams = scope === "month"
    ? `year=${selectedYear}&month=${selectedMonth}`
    : `year=${selectedYear}`;

  const { data, isLoading, error } = useQuery<SeasonalityData>({
    queryKey: ["reports-seasonality", selectedYear, scope === "month" ? selectedMonth : "all"],
    queryFn: () =>
      authFetch(`/api/reports/seasonality?${queryParams}`).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    staleTime: 60_000,
  });

  // Build lookup map: "dow-hour" → cell
  const cellMap = useMemo(() => {
    const map = new Map<string, SeasonalityCell>();
    for (const cell of data?.cells ?? []) {
      map.set(`${cell.dayOfWeek}-${cell.hour}`, cell);
    }
    return map;
  }, [data]);

  const getValue = (cell: SeasonalityCell | undefined): number => {
    if (!cell) return 0;
    if (viewMode === "appointments") return cell.appointmentCount;
    if (viewMode === "revenue") return cell.revenue;
    return cell.noShowCount;
  };

  const maxValue = useMemo(() => {
    if (!data?.cells.length) return 1;
    return Math.max(1, ...data.cells.map(getValue));
  }, [data, viewMode]);

  const dayTotals = useMemo(() => {
    const totals: Record<number, number> = {};
    for (const dow of DOW_ORDER) totals[dow] = 0;
    for (const cell of data?.cells ?? []) {
      totals[cell.dayOfWeek] = (totals[cell.dayOfWeek] ?? 0) + getValue(cell);
    }
    return totals;
  }, [data, viewMode]);

  const hourTotals = useMemo(() => {
    const totals: Record<number, number> = {};
    for (const h of HOURS) totals[h] = 0;
    for (const cell of data?.cells ?? []) {
      if (HOURS.includes(cell.hour)) {
        totals[cell.hour] = (totals[cell.hour] ?? 0) + getValue(cell);
      }
    }
    return totals;
  }, [data, viewMode]);

  const maxDayTotal  = Math.max(1, ...Object.values(dayTotals));
  const maxHourTotal = Math.max(1, ...Object.values(hourTotals));

  const scopeLabel = scope === "month"
    ? `${MONTH_NAMES[parseInt(selectedMonth) - 1]}/${selectedYear}`
    : `Ano ${selectedYear}`;

  const formatVal = (v: number) =>
    viewMode === "revenue" ? formatCurrency(v) : String(v);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Analisando padrões de sazonalidade…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-red-400">
        <AlertTriangle className="w-5 h-5" />
        <span className="text-sm">Erro ao carregar dados de sazonalidade</span>
      </div>
    );
  }

  const { summary } = data;
  const hasData = summary.totalAppointments > 0;

  return (
    <div className="space-y-5">

      {/* ── CONTROLS ────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Scope toggle */}
        <div className="flex bg-slate-100 rounded-xl p-0.5 gap-0.5 w-full sm:w-auto">
          {(["year", "month"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                scope === s
                  ? "bg-white shadow-sm text-slate-900"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {s === "year" ? `Ano completo (${selectedYear})` : `Mês: ${MONTH_NAMES[parseInt(selectedMonth) - 1]}`}
            </button>
          ))}
        </div>

        {/* Mode toggle */}
        <div className="flex bg-slate-100 rounded-xl p-0.5 gap-0.5">
          {VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setViewMode(opt.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                viewMode === opt.value
                  ? "bg-white shadow-sm text-slate-900"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-400">
          <BarChart3 className="w-12 h-12 text-slate-200" />
          <p className="text-sm font-semibold text-slate-500">Sem dados de agendamentos para {scopeLabel}</p>
          <p className="text-xs text-slate-400">Confirme consultas para visualizar os padrões de sazonalidade</p>
        </div>
      ) : (
        <>
          {/* ── SUMMARY CARDS ──────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
              <div className="p-2 rounded-xl bg-indigo-50 shrink-0">
                <Calendar className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Agend.</p>
                <p className="text-lg font-extrabold text-slate-900 tabular-nums">{summary.totalAppointments}</p>
                <p className="text-[10px] text-slate-400">{scopeLabel}</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-50 shrink-0">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Receita</p>
                <p className="text-base font-extrabold text-slate-900 tabular-nums truncate">{formatCurrency(summary.totalRevenue)}</p>
                <p className="text-[10px] text-slate-400">{scopeLabel}</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
              <div className="p-2 rounded-xl bg-violet-50 shrink-0">
                <Flame className="w-4 h-4 text-violet-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dia de Pico</p>
                <p className="text-lg font-extrabold text-slate-900">{summary.peakDay.label}</p>
                <p className="text-[10px] text-slate-400">{summary.peakDay.count} agendamentos</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
              <div className="p-2 rounded-xl bg-sky-50 shrink-0">
                <Clock className="w-4 h-4 text-sky-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Horário de Pico</p>
                <p className="text-lg font-extrabold text-slate-900">{summary.peakHour.label}</p>
                <p className="text-[10px] text-slate-400">{summary.peakHour.count} agendamentos</p>
              </div>
            </div>
          </div>

          {/* ── HEATMAP GRID ───────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  Mapa de Calor — {viewMode === "appointments" ? "Agendamentos" : viewMode === "revenue" ? "Receita" : "Faltas"}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">{scopeLabel} · cada célula = 1 slot de hora por dia da semana</p>
              </div>
              <div className="hidden sm:flex items-center gap-1.5">
                <span className="text-[10px] text-slate-400 font-medium">Menor</span>
                {["bg-slate-100", viewMode === "appointments" ? "bg-indigo-100" : viewMode === "revenue" ? "bg-emerald-100" : "bg-amber-100",
                  viewMode === "appointments" ? "bg-indigo-300" : viewMode === "revenue" ? "bg-emerald-300" : "bg-amber-300",
                  viewMode === "appointments" ? "bg-indigo-500" : viewMode === "revenue" ? "bg-emerald-500" : "bg-amber-500",
                  viewMode === "appointments" ? "bg-indigo-700" : viewMode === "revenue" ? "bg-emerald-700" : "bg-amber-700",
                ].map((cls, i) => (
                  <div key={i} className={`w-5 h-5 rounded-md ${cls}`} />
                ))}
                <span className="text-[10px] text-slate-400 font-medium">Maior</span>
              </div>
            </div>

            <div className="overflow-x-auto p-3 sm:p-5">
              <div className="min-w-[520px]">
                {/* Day headers */}
                <div className="grid gap-1" style={{ gridTemplateColumns: `48px repeat(7, 1fr)` }}>
                  <div /> {/* empty corner */}
                  {DOW_ORDER.map((dow) => {
                    const total = dayTotals[dow] ?? 0;
                    const isPeak = dow === summary.peakDay.dayOfWeek;
                    return (
                      <div key={dow} className="text-center pb-2">
                        <p className={`text-[11px] font-bold ${isPeak ? "text-indigo-600" : "text-slate-500"}`}>
                          {DOW_LABELS[dow]}
                          {isPeak && <span className="ml-1 text-[8px]">🔥</span>}
                        </p>
                        {/* Day total bar */}
                        <div className="relative h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              viewMode === "appointments" ? "bg-indigo-400" :
                              viewMode === "revenue" ? "bg-emerald-400" : "bg-amber-400"
                            }`}
                            style={{ width: `${maxDayTotal > 0 ? (total / maxDayTotal) * 100 : 0}%` }}
                          />
                        </div>
                        <p className="text-[9px] text-slate-400 mt-0.5 tabular-nums">
                          {viewMode === "revenue" ? `R$${(total / 1000).toFixed(0)}k` : String(total)}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Hour rows */}
                {HOURS.map((hour) => {
                  const hourTotal = hourTotals[hour] ?? 0;
                  const isPeakHour = hour === summary.peakHour.hour;
                  return (
                    <div key={hour} className="grid gap-1 mb-1" style={{ gridTemplateColumns: `48px repeat(7, 1fr)` }}>
                      {/* Hour label */}
                      <div className="flex items-center justify-end pr-2">
                        <span className={`text-[10px] font-bold tabular-nums ${isPeakHour ? "text-indigo-500" : "text-slate-400"}`}>
                          {String(hour).padStart(2, "0")}:00
                          {isPeakHour && <span className="ml-0.5">★</span>}
                        </span>
                      </div>

                      {/* Day cells */}
                      {DOW_ORDER.map((dow) => {
                        const cell = cellMap.get(`${dow}-${hour}`);
                        const val = getValue(cell);
                        const isPeakSlot = dow === summary.peakSlot.dayOfWeek && hour === summary.peakSlot.hour;

                        return (
                          <div
                            key={dow}
                            title={
                              cell
                                ? `${DOW_LABELS[dow]} ${String(hour).padStart(2, "0")}:00\n` +
                                  `Agendamentos: ${cell.appointmentCount}\n` +
                                  `Receita: ${formatCurrency(cell.revenue)}\n` +
                                  `Faltas: ${cell.noShowCount}`
                                : `${DOW_LABELS[dow]} ${String(hour).padStart(2, "0")}:00 — sem dados`
                            }
                            className={`
                              relative h-8 rounded-lg flex items-center justify-center
                              transition-all duration-200 cursor-default
                              ${cellBg(val, maxValue, viewMode)}
                              ${isPeakSlot ? "ring-2 ring-offset-1 ring-violet-400" : ""}
                            `}
                          >
                            {val > 0 && (
                              <span className={`text-[10px] font-bold tabular-nums leading-none ${cellText(val, maxValue)}`}>
                                {viewMode === "revenue"
                                  ? (val >= 1000 ? `${(val / 1000).toFixed(0)}k` : String(Math.round(val)))
                                  : String(val)}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                {/* Hour total bar at bottom */}
                <div className="grid gap-1 mt-1" style={{ gridTemplateColumns: `48px repeat(7, 1fr)` }}>
                  <div />
                  {DOW_ORDER.map((dow) => {
                    const total = dayTotals[dow] ?? 0;
                    return (
                      <div key={dow} className="text-center pt-1">
                        <div className="h-0.5 bg-slate-100 rounded-full" />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Peak slot banner */}
            {summary.peakSlot.count > 0 && (
              <div className="mx-5 mb-5 rounded-xl bg-violet-50 border border-violet-100 px-4 py-3 flex items-center gap-3">
                <div className="p-1.5 rounded-lg bg-violet-100 shrink-0">
                  <Flame className="w-4 h-4 text-violet-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-violet-800">
                    Slot mais movimentado: {summary.peakSlot.dayLabel} às {summary.peakSlot.hourLabel}
                  </p>
                  <p className="text-xs text-violet-500 mt-0.5">
                    {summary.peakSlot.count} agendamentos neste horário no período
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] font-bold text-violet-400 uppercase tracking-widest">Horário estrela</p>
                </div>
              </div>
            )}
          </div>

          {/* ── BAR SUMMARIES ───────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* By day of week */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
                {viewMode === "appointments" ? "Agendamentos" : viewMode === "revenue" ? "Receita" : "Faltas"} por Dia da Semana
              </p>
              <div className="space-y-2">
                {DOW_ORDER.map((dow) => {
                  const val = dayTotals[dow] ?? 0;
                  const pct = maxDayTotal > 0 ? (val / maxDayTotal) * 100 : 0;
                  const isPeak = dow === summary.peakDay.dayOfWeek;
                  return (
                    <div key={dow} className="flex items-center gap-3">
                      <span className={`text-xs font-bold w-8 shrink-0 ${isPeak ? "text-indigo-600" : "text-slate-500"}`}>
                        {DOW_LABELS[dow]}
                      </span>
                      <div className="flex-1 h-6 bg-slate-50 rounded-lg overflow-hidden">
                        <div
                          className={`h-full rounded-lg transition-all duration-500 flex items-center px-2 ${
                            viewMode === "appointments" ? (isPeak ? "bg-indigo-500" : "bg-indigo-200") :
                            viewMode === "revenue" ? (isPeak ? "bg-emerald-500" : "bg-emerald-200") :
                            (isPeak ? "bg-amber-500" : "bg-amber-200")
                          }`}
                          style={{ width: `${Math.max(pct, val > 0 ? 6 : 0)}%` }}
                        >
                          {pct >= 20 && (
                            <span className={`text-[10px] font-bold tabular-nums ${isPeak ? "text-white" : "text-slate-600"}`}>
                              {formatVal(val)}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs font-bold text-slate-600 tabular-nums w-12 text-right shrink-0">
                        {formatVal(val)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* By hour */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
                {viewMode === "appointments" ? "Agendamentos" : viewMode === "revenue" ? "Receita" : "Faltas"} por Horário
              </p>
              <div className="space-y-1.5">
                {HOURS.map((hour) => {
                  const val = hourTotals[hour] ?? 0;
                  const pct = maxHourTotal > 0 ? (val / maxHourTotal) * 100 : 0;
                  const isPeak = hour === summary.peakHour.hour;
                  return (
                    <div key={hour} className="flex items-center gap-3">
                      <span className={`text-[10px] font-bold tabular-nums w-10 shrink-0 ${isPeak ? "text-indigo-600" : "text-slate-400"}`}>
                        {String(hour).padStart(2, "0")}h
                      </span>
                      <div className="flex-1 h-5 bg-slate-50 rounded-lg overflow-hidden">
                        <div
                          className={`h-full rounded-lg transition-all duration-500 ${
                            viewMode === "appointments" ? (isPeak ? "bg-indigo-500" : "bg-indigo-200") :
                            viewMode === "revenue" ? (isPeak ? "bg-emerald-500" : "bg-emerald-200") :
                            (isPeak ? "bg-amber-500" : "bg-amber-200")
                          }`}
                          style={{ width: `${Math.max(pct, val > 0 ? 4 : 0)}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-slate-500 tabular-nums w-12 text-right shrink-0">
                        {formatVal(val)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── NO-SHOW INSIGHT ──────────────────────────────────────────── */}
          {viewMode === "appointments" && (() => {
            const totalNoShows = data.cells.reduce((s, c) => s + c.noShowCount, 0);
            const noShowRate = summary.totalAppointments > 0
              ? (totalNoShows / summary.totalAppointments) * 100
              : 0;
            const worstNoShowDay = DOW_ORDER.reduce((worst, dow) => {
              const dayNoShows = data.cells
                .filter(c => c.dayOfWeek === dow)
                .reduce((s, c) => s + c.noShowCount, 0);
              return dayNoShows > worst.count ? { dow, count: dayNoShows } : worst;
            }, { dow: 0, count: 0 });

            if (totalNoShows === 0) return null;
            return (
              <div className="bg-amber-50 rounded-2xl border border-amber-100 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  <p className="text-sm font-bold text-amber-800">Análise de Faltas — {scopeLabel}</p>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Total Faltas</p>
                    <p className="text-xl font-extrabold text-amber-700 tabular-nums">{totalNoShows}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Taxa de Falta</p>
                    <p className="text-xl font-extrabold text-amber-700 tabular-nums">{noShowRate.toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Pior Dia</p>
                    <p className="text-xl font-extrabold text-amber-700">{DOW_LABELS[worstNoShowDay.dow]}</p>
                    <p className="text-[10px] text-amber-400">{worstNoShowDay.count} falta(s)</p>
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
