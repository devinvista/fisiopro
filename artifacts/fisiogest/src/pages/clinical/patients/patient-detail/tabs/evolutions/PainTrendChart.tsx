import { TrendingUp, Activity } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface PainTrendChartProps {
  evolutions: any[];
}

export function PainTrendChart({ evolutions }: PainTrendChartProps) {
  const withPain = [...evolutions].reverse().filter(e => e.painScale !== null && e.painScale !== undefined);
  if (withPain.length < 2) return null;

  const chartData = withPain.map((e, i) => ({
    sessao: `S${i + 1}`,
    dor: e.painScale,
    data: format(new Date(e.createdAt), "dd/MM", { locale: ptBR }),
  }));

  const first = chartData[0]?.dor ?? 0;
  const last = chartData[chartData.length - 1]?.dor ?? 0;
  const diff = last - first;
  const trend = diff < 0 ? "melhora" : diff > 0 ? "piora" : "estável";
  const trendColor = diff < 0 ? "text-emerald-600" : diff > 0 ? "text-red-500" : "text-slate-500";
  const trendBg = diff < 0 ? "bg-emerald-50 border-emerald-200" : diff > 0 ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-200";

  return (
    <div className={`rounded-xl border p-4 ${trendBg}`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-bold text-slate-700">Tendência de Dor (EVA)</p>
          <p className="text-xs text-slate-500">{withPain.length} sessões com EVA registrado</p>
        </div>
        <div className={`text-sm font-bold ${trendColor} flex items-center gap-1.5`}>
          {diff < 0 ? <TrendingUp className="w-4 h-4 rotate-180" /> : diff > 0 ? <TrendingUp className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
          {trend === "melhora" ? `↓${Math.abs(diff)} pts — Melhora` : trend === "piora" ? `↑${diff} pts — Piora` : "Estável"}
        </div>
      </div>
      <div className="flex items-end gap-1.5 h-16">
        {chartData.map((d, i) => {
          const pct = ((d.dor as number) / 10) * 100;
          const col = (d.dor as number) >= 7 ? "bg-red-400" : (d.dor as number) >= 4 ? "bg-orange-400" : "bg-emerald-400";
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[9px] text-slate-500 font-semibold">{d.dor}</span>
              <div className="w-full flex flex-col justify-end" style={{ height: "40px" }}>
                <div className={`w-full rounded-t-sm ${col} transition-all`} style={{ height: `${Math.max(4, pct * 0.4)}px` }} />
              </div>
              <span className="text-[8px] text-slate-400">{d.sessao}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
