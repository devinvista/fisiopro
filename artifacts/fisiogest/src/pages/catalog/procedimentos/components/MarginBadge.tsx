import { cn } from "@/lib/utils";

export function MarginBadge({ margin }: { margin: number }) {
  const { color, bg, label } =
    margin >= 60
      ? { color: "text-emerald-700", bg: "bg-emerald-50", label: "Ótima" }
      : margin >= 35
      ? { color: "text-amber-700", bg: "bg-amber-50", label: "Ok" }
      : { color: "text-red-600", bg: "bg-red-50", label: "Baixa" };

  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums", bg, color)}>
      {margin.toFixed(0)}%
      <span className="font-medium opacity-70 hidden sm:inline">{label}</span>
    </span>
  );
}
