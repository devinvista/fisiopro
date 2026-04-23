import { User, Users } from "lucide-react";

export const CATEGORY_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; dot: string }
> = {
  "Reabilitação": { label: "Reabilitação", bg: "bg-blue-50",   text: "text-blue-700",  dot: "bg-blue-400" },
  "Fisioterapia": { label: "Reabilitação", bg: "bg-blue-50",   text: "text-blue-700",  dot: "bg-blue-400" },
  "fisioterapia": { label: "Reabilitação", bg: "bg-blue-50",   text: "text-blue-700",  dot: "bg-blue-400" },
  "Estética":     { label: "Estética",     bg: "bg-pink-50",   text: "text-pink-700",  dot: "bg-pink-400" },
  "estetica":     { label: "Estética",     bg: "bg-pink-50",   text: "text-pink-700",  dot: "bg-pink-400" },
  "Pilates":      { label: "Pilates",      bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-400" },
  "pilates":      { label: "Pilates",      bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-400" },
};

export const MODALIDADE_CONFIG: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  individual: { label: "Individual", icon: User },
  dupla:      { label: "Dupla",      icon: Users },
  grupo:      { label: "Grupo",      icon: Users },
};

export function formatCurrency(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
}

export async function apiFetch<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  const r = await fetch(url, options);
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error((body as { message?: string })?.message || `Erro ${r.status}`);
  }
  if (r.status === 204) return undefined as T;
  return r.json();
}

