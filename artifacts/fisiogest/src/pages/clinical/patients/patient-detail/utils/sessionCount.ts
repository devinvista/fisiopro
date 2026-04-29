/**
 * Cálculo real do número de sessões para itens recorrentes (mensal) de um plano,
 * espelhando a lógica do backend em `treatment-plans.materialization.ts`
 * (`enumerateDates`): conta as ocorrências dos `weekDays` configurados no
 * intervalo [startDate, startDate + durationMonths) — fim exclusivo.
 *
 * Não usa a aproximação `sessionsPerWeek × 4 × meses`: vai dia a dia para
 * refletir o número exato de consultas que serão (ou foram) materializadas.
 */

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export function parseWeekDays(raw: string | string[] | null | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    /* noop */
  }
  return [];
}

/**
 * Conta quantas datas no intervalo [startISO, startISO + durationMonths)
 * caem em algum dos `weekDays` informados.
 *
 * - `startISO`: "YYYY-MM-DD"
 * - `weekDays`: array de strings em inglês (`monday`, `tuesday`, …)
 *
 * Retorna 0 se faltar dado essencial.
 */
export function countRecurringSessions(
  startISO: string | null | undefined,
  durationMonths: number | null | undefined,
  weekDays: string | string[] | null | undefined,
): number {
  const days = parseWeekDays(weekDays);
  if (!startISO || days.length === 0) return 0;
  const months = Math.max(1, Number(durationMonths ?? 0));
  if (!months) return 0;

  const [sy, sm, sd] = startISO.split("-").map(Number);
  if (!sy || !sm || !sd) return 0;

  // Usa UTC para evitar artefatos de fuso (mesma estratégia do backend).
  const start = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(sy, sm - 1 + months, sd));

  const targets = new Set(
    days.map((d) => WEEKDAY_INDEX[d]).filter((n) => n !== undefined) as number[],
  );
  if (targets.size === 0) return 0;

  let count = 0;
  const cur = new Date(start);
  while (cur < end) {
    if (targets.has(cur.getUTCDay())) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

/**
 * Total estimado para um item de plano:
 * - mensal: contagem real via `countRecurringSessions`. Se `weekDays` estiver
 *   vazio, cai para `sessionsPerWeek × 4 × meses` como aproximação até que
 *   o profissional configure os dias.
 * - avulso/pacote: usa `totalSessions` do item (já fixo por contrato).
 */
export function plannedSessionsForItem(item: {
  packageType?: string | null;
  packageId?: number | null;
  totalSessions?: number | null;
  sessionsPerWeek?: number | null;
  weekDays?: string | string[] | null;
}, planStartDate: string | null | undefined, planDurationMonths: number | null | undefined): number {
  const isMensal = item.packageType === "mensal";
  if (!isMensal) {
    if (item.totalSessions != null) return item.totalSessions;
    return item.packageId ? 0 : 1; // avulso = 1
  }
  const real = countRecurringSessions(planStartDate, planDurationMonths, item.weekDays);
  if (real > 0) return real;
  // Fallback quando ainda não há weekDays configurados.
  const months = Math.max(1, Number(planDurationMonths ?? 12));
  return Math.max(0, Number(item.sessionsPerWeek ?? 0)) * 4 * months;
}
