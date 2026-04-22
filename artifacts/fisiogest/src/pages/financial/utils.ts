export const formatCurrency = (val: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

export function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("fisiogest_token");
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
