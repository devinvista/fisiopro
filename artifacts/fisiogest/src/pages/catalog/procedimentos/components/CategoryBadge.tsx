import { CATEGORY_CONFIG } from "../constants";
import { cn } from "@/lib/utils";

export function CategoryBadge({ category, size = "sm" }: { category: string; size?: "xs" | "sm" }) {
  const cfg = CATEGORY_CONFIG[category] ?? {
    label: category,
    bg: "bg-muted",
    text: "text-muted-foreground",
    dot: "bg-slate-400",
  };
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 font-semibold rounded-full",
      size === "xs" ? "text-[10px] px-1.5 py-0.5" : "text-[11px] px-2 py-0.5",
      cfg.bg, cfg.text
    )}>
      <span className={cn("rounded-full shrink-0", size === "xs" ? "w-1 h-1" : "w-1.5 h-1.5", cfg.dot)} />
      {cfg.label}
    </span>
  );
}
