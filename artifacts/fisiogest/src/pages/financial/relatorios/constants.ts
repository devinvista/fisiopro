export const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export const CATEGORY_COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ec4899", "#0ea5e9", "#8b5cf6", "#14b8a6", "#f97316",
];

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function authFetch(url: string): Promise<Response> {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("fisiogest_token") : null;
  return fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}
