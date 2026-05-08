import { cn } from "@/lib/utils";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";

type MarginSize = "sm" | "lg";

export function MarginBadge({ margin, size = "sm" }: { margin: number; size?: MarginSize }) {
  const isGood = margin >= 60;
  const isOk = margin >= 35;

  const { colorClass, bgClass, icon } = isGood
    ? { colorClass: "text-emerald-700", bgClass: "bg-emerald-50", icon: <TrendingUp className={cn("shrink-0", size === "lg" ? "w-3.5 h-3.5" : "w-2.5 h-2.5")} /> }
    : isOk
    ? { colorClass: "text-amber-700", bgClass: "bg-amber-50", icon: <Minus className={cn("shrink-0", size === "lg" ? "w-3.5 h-3.5" : "w-2.5 h-2.5")} /> }
    : { colorClass: "text-rose-600", bgClass: "bg-rose-50", icon: <TrendingDown className={cn("shrink-0", size === "lg" ? "w-3.5 h-3.5" : "w-2.5 h-2.5")} /> };

  return (
    <span className={cn(
      "inline-flex items-center gap-1 font-bold rounded-full tabular-nums",
      bgClass, colorClass,
      size === "lg" ? "text-xs px-2.5 py-1" : "text-[10px] px-1.5 py-0.5"
    )}>
      {icon}
      {margin.toFixed(0)}%
    </span>
  );
}
