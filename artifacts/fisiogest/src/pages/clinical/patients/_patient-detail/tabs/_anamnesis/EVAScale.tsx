import React from "react";
import { Label } from "@/components/ui/label";

interface EVAScaleProps {
  value: number;
  onChange: (v: number) => void;
}

export function EVAScale({ value, onChange }: EVAScaleProps) {
  return (
    <div className="space-y-3 bg-slate-50 rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-semibold text-slate-700">Escala de Dor (EVA)</Label>
          <p className="text-xs text-slate-400 mt-0.5">Escala Visual Analógica — 0 (sem dor) a 10 (dor máxima)</p>
        </div>
        <div className={`flex items-center justify-center w-12 h-12 rounded-full font-bold text-xl text-white shadow-md ${value >= 7 ? "bg-red-500" : value >= 4 ? "bg-orange-400" : "bg-green-500"}`}>{value}</div>
      </div>
      <div className="flex gap-2 flex-wrap">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => (
          <button key={v} type="button" onClick={() => onChange(v)}
            className={`w-9 h-9 rounded-lg text-sm font-semibold border-2 transition-all ${
              value === v
                ? v >= 7 ? "bg-red-500 border-red-600 text-white" : v >= 4 ? "bg-orange-400 border-orange-500 text-white" : "bg-green-500 border-green-600 text-white"
                : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"
            }`}>{v}</button>
        ))}
      </div>
      <p className="text-xs font-medium flex items-center gap-1.5">
        <span className={`inline-block w-2 h-2 rounded-full ${value >= 7 ? "bg-red-500" : value >= 4 ? "bg-orange-400" : "bg-green-500"}`} />
        <span className={value >= 7 ? "text-red-600" : value >= 4 ? "text-orange-600" : "text-green-600"}>
          {value === 0 ? "Sem dor" : value <= 3 ? "Dor leve" : value <= 6 ? "Dor moderada" : value <= 9 ? "Dor intensa" : "Dor insuportável"}
        </span>
      </p>
    </div>
  );
}
