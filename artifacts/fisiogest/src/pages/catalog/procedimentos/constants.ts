
export const CATEGORIES = [
  { value: "all", label: "Todos" },
  { value: "Reabilitação", label: "Reabilitação" },
  { value: "Estética", label: "Estética" },
  { value: "Pilates", label: "Pilates" },
];

export const CATEGORY_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  "Reabilitação": { label: "Reabilitação", bg: "bg-blue-50",   text: "text-blue-700",  dot: "bg-blue-400" },
  "Estética":     { label: "Estética",     bg: "bg-pink-50",   text: "text-pink-700",  dot: "bg-pink-400" },
  "Pilates":      { label: "Pilates",      bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-400" },
};

export function formatCurrency(value: string | number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
}

export function getMargin(price: string | number, cost: string | number) {
  const p = Number(price);
  const c = Number(cost);
  if (!p || isNaN(p)) return 0;
  return ((p - c) / p) * 100;
}

