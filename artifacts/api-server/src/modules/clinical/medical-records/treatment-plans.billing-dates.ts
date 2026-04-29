/**
 * Helpers de data de vencimento para parcelas mensais de planos de tratamento.
 *
 * Regra de negócio:
 *   - A 1ª parcela vence na PRÓXIMA ocorrência do `billingDay` em ou após
 *     o `startDate` (vigência) do plano.
 *   - As parcelas seguintes caem no mesmo dia, meses subsequentes
 *     (com clamp para o último dia em meses curtos: ex. dia 31 em fevereiro
 *     → último dia do mês).
 *   - O `monthRef` (competência) permanece alinhado aos meses do plano a
 *     partir de `startDate`, independentemente de o vencimento cair no mês
 *     seguinte.
 *
 * Exemplos:
 *   startDate=2026-05-01, billingDay=10 → 1ª parcela 2026-05-10 (10 ≥ 1)
 *   startDate=2026-05-15, billingDay=10 → 1ª parcela 2026-06-10 (10 < 15)
 *   startDate=2026-05-28, billingDay=20 → 1ª parcela 2026-06-20 (20 < 28)
 *   startDate=2026-01-31, billingDay=31, m=1 → 2026-02-28 (clamp em fev)
 *
 * Compartilhado por:
 *   - `treatment-plans.acceptance.ts` (1ª fatura no aceite)
 *   - `treatment-plans.materialization.ts` (geração eager de N faturas)
 *   - `monthly-plan-billing.service.ts` (geração mês a mês pelo cron)
 */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Retorna o `dueDate` (YYYY-MM-DD) da parcela `monthOffset` (0 = primeira).
 */
export function planInstallmentDueDate(
  startDate: string,
  billingDay: number,
  monthOffset: number = 0,
): string {
  const [sy, sm, sd] = startDate.split("-").map(Number);
  // Se o `billingDay` deste mês é anterior ao `startDate.day`, empurra
  // todas as parcelas em 1 mês — preserva o número de parcelas e mantém
  // a regularidade mensal.
  const shift = billingDay >= sd ? 0 : 1;
  let targetMonth = sm + monthOffset + shift;
  let targetYear = sy;
  while (targetMonth > 12) {
    targetMonth -= 12;
    targetYear += 1;
  }
  const lastDay = lastDayOfMonth(targetYear, targetMonth);
  const day = Math.min(billingDay, lastDay);
  return `${targetYear}-${pad(targetMonth)}-${pad(day)}`;
}

/**
 * Retorna o `monthRef` (1º dia do mês de competência) da parcela
 * `monthOffset` — sempre alinhado aos meses do plano a partir do
 * `startDate`, independentemente do vencimento.
 */
export function planMonthRefOf(
  startDate: string,
  monthOffset: number = 0,
): string {
  const [sy, sm] = startDate.split("-").map(Number);
  let targetMonth = sm + monthOffset;
  let targetYear = sy;
  while (targetMonth > 12) {
    targetMonth -= 12;
    targetYear += 1;
  }
  return `${targetYear}-${pad(targetMonth)}-01`;
}

/**
 * Calcula o `monthOffset` correspondente a um par (year, month) de
 * competência relativo ao mês de `startDate`. Retorna `null` se o mês
 * informado é anterior ao `startDate`.
 */
export function monthOffsetFromStart(
  startDate: string,
  year: number,
  month: number,
): number | null {
  const [sy, sm] = startDate.split("-").map(Number);
  const offset = (year - sy) * 12 + (month - sm);
  return offset >= 0 ? offset : null;
}
