import React from "react";
import { Check } from "lucide-react";

interface CheckTagProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

export function CheckTag({ label, active, onClick }: CheckTagProps) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
        active ? "bg-primary text-white border-primary shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
      }`}>
      {active && <Check className="w-3 h-3" />}
      {label}
    </button>
  );
}
