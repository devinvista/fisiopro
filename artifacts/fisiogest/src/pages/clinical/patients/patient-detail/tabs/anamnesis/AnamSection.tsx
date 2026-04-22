import React from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

interface AnamSectionProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  colorClass: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export function AnamSection({ title, subtitle, icon, colorClass, open, onToggle, children }: AnamSectionProps) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 hover:bg-blue-100 text-blue-800 border-blue-200",
    red: "bg-red-50 hover:bg-red-100 text-red-800 border-red-200",
    emerald: "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200",
    violet: "bg-violet-50 hover:bg-violet-100 text-violet-800 border-violet-200",
    amber: "bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200",
    rose: "bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-200",
    teal: "bg-teal-50 hover:bg-teal-100 text-teal-800 border-teal-200",
    orange: "bg-orange-50 hover:bg-orange-100 text-orange-800 border-orange-200",
    indigo: "bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border-indigo-200",
    pink: "bg-pink-50 hover:bg-pink-100 text-pink-800 border-pink-200",
  };
  const iconBg: Record<string, string> = {
    blue: "bg-blue-100 border-blue-200 text-blue-600",
    red: "bg-red-100 border-red-200 text-red-600",
    emerald: "bg-emerald-100 border-emerald-200 text-emerald-600",
    violet: "bg-violet-100 border-violet-200 text-violet-600",
    amber: "bg-amber-100 border-amber-200 text-amber-600",
    rose: "bg-rose-100 border-rose-200 text-rose-600",
    teal: "bg-teal-100 border-teal-200 text-teal-600",
    orange: "bg-orange-100 border-orange-200 text-orange-600",
    indigo: "bg-indigo-100 border-indigo-200 text-indigo-600",
    pink: "bg-pink-100 border-pink-200 text-pink-600",
  };
  const subtitleColor: Record<string, string> = {
    blue: "text-blue-500", red: "text-red-400", emerald: "text-emerald-500", violet: "text-violet-500",
    amber: "text-amber-500", rose: "text-rose-500", teal: "text-teal-500", orange: "text-orange-500",
    indigo: "text-indigo-500", pink: "text-pink-500",
  };
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <button type="button" onClick={onToggle}
        className={`w-full flex items-center justify-between px-4 py-3 transition-colors text-left ${colors[colorClass]}`}>
        <div className="flex items-center gap-2.5">
          <div className={`w-7 h-7 rounded-lg border flex items-center justify-center ${iconBg[colorClass]}`}>{icon}</div>
          <div>
            <p className="text-sm font-bold">{title}</p>
            <p className={`text-xs ${subtitleColor[colorClass]}`}>{subtitle}</p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
      </button>
      {open && <div className="p-4 space-y-4 bg-white">{children}</div>}
    </div>
  );
}
