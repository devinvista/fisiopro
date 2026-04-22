import { formatCurrency } from "./constants";

export function CustomTooltipContent({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-100 rounded-xl shadow-xl p-3 text-xs min-w-[140px]">
      <p className="font-semibold text-slate-700 mb-2">{label}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
            <span className="text-slate-500">{entry.name}</span>
          </div>
          <span className="font-semibold text-slate-800">
            {typeof entry.value === "number" && entry.value > 100
              ? formatCurrency(entry.value)
              : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}
