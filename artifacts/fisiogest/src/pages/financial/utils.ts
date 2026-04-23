export const formatCurrency = (val: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

/**
 * Cabeçalhos para requests JSON. JWT vai por cookie httpOnly automaticamente;
 * apenas o Content-Type é necessário aqui. CSRF é injetado por `apiFetch`.
 */
export function authHeaders(): Record<string, string> {
  return { "Content-Type": "application/json" };
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
