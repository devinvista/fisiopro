/**
 * Utilitários de data/hora para o fuso horário de Brasília (BRT = UTC-3).
 *
 * Problema: em servidores com relógio UTC, `new Date().getDate()` retorna
 * o dia UTC, não o dia de Brasília. Após as 21h BRT (00h UTC do dia seguinte)
 * isso produz datas erradas para "hoje", "mês atual" etc.
 *
 * Solução: usar Intl.DateTimeFormat com timeZone: "America/Sao_Paulo".
 */

/** Retorna a data atual em BRT como "YYYY-MM-DD" */
export function todayBRT(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

/** Retorna ano, mês e dia atuais em BRT (mês 1–12) */
export function nowBRT(): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** Retorna o último dia de um dado mês/ano */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Adiciona N dias a uma data no formato "YYYY-MM-DD" e retorna "YYYY-MM-DD".
 * Âncora no meio-dia UTC para evitar problemas de DST.
 */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/** Retorna o range de datas de um mês em string "YYYY-MM-DD" */
export function monthDateRangeBRT(
  year: number,
  month: number
): { startDate: string; endDate: string } {
  const lastDay = lastDayOfMonth(year, month);
  const mm = String(month).padStart(2, "0");
  return {
    startDate: `${year}-${mm}-01`,
    endDate: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}
