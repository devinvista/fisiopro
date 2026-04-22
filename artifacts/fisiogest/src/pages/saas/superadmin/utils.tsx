import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Infinity } from "lucide-react";

// ─── Shared helpers ───────────────────────────────────────────────────────────

export function fmtDate(d?: string | null) {
  if (!d) return "—";
  try { return format(parseISO(d), "dd/MM/yyyy", { locale: ptBR }); }
  catch { return d; }
}

export function fmtCurrency(v?: string | number | null) {
  if (v == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));
}

export function limitLabel(v: number | null | undefined) {
  if (v == null) return <Infinity className="w-4 h-4 text-slate-400 inline-block" />;
  return v;
}

