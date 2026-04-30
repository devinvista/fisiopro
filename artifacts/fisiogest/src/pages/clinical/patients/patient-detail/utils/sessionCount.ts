/**
 * Cálculo do número de sessões previstas para itens de um plano de tratamento.
 *
 * Estratégia (em ordem de precedência):
 *   1. Pacote com sessões fixas (`packageId` + `totalSessions`): valor contratado.
 *   2. Se `weekDays` está configurado (após escolha das datas na agenda /
 *      materialização): contagem REAL via `countRecurringSessions` — espelha
 *      `enumerateDates` em `treatment-plans.materialization.ts`.
 *   3. Estimativa inicial pelo período de vigência do plano:
 *      `sessionsPerWeek × semanas_no_periodo`. Usado tanto para avulsos
 *      (sem pacote) quanto para pacotes mensais antes da materialização.
 *
 * Tudo em UTC para evitar artefatos de fuso (mesma estratégia do backend).
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
 * Quantas semanas (calendário) cabem entre `startISO` e
 * `startISO + durationMonths`. Resultado fracionário — quem chama decide
 * arredondar (`Math.round`, `Math.ceil`, etc.).
 *
 * Fallback: se `startISO` for inválido, usa a aproximação `4.345 × meses`
 * (≈ 52,14 semanas/ano), mais precisa que `× 4`.
 */
export function weeksInValidityPeriod(
  startISO: string | null | undefined,
  durationMonths: number | null | undefined,
): number {
  const months = Math.max(1, Number(durationMonths ?? 1));
  if (!startISO) return 4.345 * months;
  const [sy, sm, sd] = startISO.split("-").map(Number);
  if (!sy || !sm || !sd) return 4.345 * months;
  const start = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(sy, sm - 1 + months, sd);
  return (end - start) / (1000 * 60 * 60 * 24 * 7);
}

/**
 * Total previsto de sessões para um item de plano. Veja o cabeçalho do arquivo
 * para a estratégia completa (pacote fixo → contagem real por weekDays →
 * estimativa por período de vigência).
 */
export function plannedSessionsForItem(item: {
  packageType?: string | null;
  packageId?: number | null;
  totalSessions?: number | null;
  sessionsPerWeek?: number | null;
  weekDays?: string | string[] | null;
}, planStartDate: string | null | undefined, planDurationMonths: number | null | undefined): number {
  const isMensal = item.packageType === "mensal";
  const isFixedPackage = !isMensal && !!item.packageId && item.totalSessions != null;

  // 1. Pacote com sessões fixas (contratado): valor fixo.
  if (isFixedPackage) return Number(item.totalSessions);

  // 2. Se já há weekDays (escolha de agenda / materialização): contagem real.
  const real = countRecurringSessions(planStartDate, planDurationMonths, item.weekDays);
  if (real > 0) return real;

  // 3. Estimativa inicial pelo período de vigência × frequência semanal.
  const sessionsPerWeek = Math.max(0, Number(item.sessionsPerWeek ?? 0));
  if (sessionsPerWeek > 0) {
    const weeks = weeksInValidityPeriod(planStartDate, planDurationMonths);
    return Math.round(sessionsPerWeek * weeks);
  }

  // 4. Fallbacks finais (sem dados suficientes para projetar).
  if (!isMensal) {
    if (item.totalSessions != null) return Number(item.totalSessions);
    return item.packageId ? 0 : 1; // avulso solto = 1 sessão
  }
  return 0;
}
