export function MetricStrip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-3">
      <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: `${color}99` }}>{label}</p>
      <p className="text-2xl font-bold tabular-nums" style={{ color }}>{value}</p>
    </div>
  );
}
