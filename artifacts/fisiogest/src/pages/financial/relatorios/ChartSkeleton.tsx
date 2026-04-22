export function ChartSkeleton({ height = 280 }: { height?: number }) {
  return (
    <div className="w-full animate-pulse" style={{ height }}>
      <div className="flex items-end gap-3 h-full px-4 pb-6 pt-4">
        {[65, 45, 80, 55, 70, 40, 90, 60, 75, 50, 85, 65].map((h, i) => (
          <div key={i} className="flex-1 bg-slate-100 rounded-t-lg" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}
