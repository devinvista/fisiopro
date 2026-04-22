import { ArrowUpRight, ArrowDownRight } from "lucide-react";

// ─── KPI Card (Redesigned) ────────────────────────────────────────────────────
export function KpiCard({
  label, value, icon, accentColor = "#6366f1", loading, sub, trend, size = "md",
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accentColor?: string;
  loading?: boolean;
  sub?: string;
  trend?: { value: number; label?: string };
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div className="relative bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden group hover:shadow-md transition-shadow duration-200">
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ backgroundColor: accentColor }} />
      <div className="pl-5 pr-4 py-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest leading-tight">{label}</p>
          <div
            className="p-2 rounded-xl shrink-0 opacity-80"
            style={{ backgroundColor: `${accentColor}18`, color: accentColor }}
          >
            {icon}
          </div>
        </div>
        <div className="mt-2">
          {loading ? (
            <div className="space-y-1.5">
              <div className="h-7 w-28 bg-slate-100 animate-pulse rounded-lg" />
              <div className="h-3 w-16 bg-slate-100 animate-pulse rounded" />
            </div>
          ) : (
            <>
              <p className={`font-bold text-slate-900 tabular-nums ${size === "lg" ? "text-3xl" : size === "sm" ? "text-lg" : "text-2xl"}`}>
                {value}
              </p>
              {trend && (
                <div className={`flex items-center gap-1 mt-1 text-xs font-semibold ${trend.value >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {trend.value >= 0
                    ? <ArrowUpRight className="w-3.5 h-3.5" />
                    : <ArrowDownRight className="w-3.5 h-3.5" />}
                  {Math.abs(trend.value).toFixed(1)}%
                  <span className="text-slate-400 font-normal">{trend.label ?? "vs mês anterior"}</span>
                </div>
              )}
              {sub && !trend && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
