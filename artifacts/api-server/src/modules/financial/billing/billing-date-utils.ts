/**
 * billingDateUtils — helpers puros e testáveis usados pelos serviços de
 * cobrança (billingService e consolidatedBillingService).
 *
 * Mantemos estes helpers isolados em um módulo sem dependências de banco
 * para que sejam fáceis de cobrir com testes unitários.
 */

/**
 * Calcula a próxima data de cobrança para o mês seguinte ao informado,
 * respeitando meses curtos (ex.: billingDay 31 em fevereiro → último dia
 * de fevereiro).
 */
export function calcNextBillingDate(
  billingDay: number,
  currentYear: number,
  currentMonth: number,
): string {
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
  const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
  const lastDayOfNextMonth = new Date(nextYear, nextMonth, 0).getDate();
  const effectiveDay = Math.min(billingDay, lastDayOfNextMonth);
  const mm = String(nextMonth).padStart(2, "0");
  const dd = String(effectiveDay).padStart(2, "0");
  return `${nextYear}-${mm}-${dd}`;
}

/**
 * Retorna o "effective billing day" para um dado mês/ano.
 * Garante que billingDay 31 em fevereiro vire o último dia (28 ou 29).
 */
export function effectiveBillingDay(
  billingDay: number,
  year: number,
  month: number,
): number {
  const lastDay = new Date(year, month, 0).getDate();
  return Math.min(billingDay, lastDay);
}

/**
 * Verifica se "hoje" (em BRT) está dentro da janela de cobrança
 * (billingDay até billingDay + toleranceDays).
 *
 * A janela nunca avança para o mês seguinte: a verificação é feita
 * dentro do mesmo mês de `brtToday`.
 */
export function isWithinBillingWindow(
  billingDay: number,
  brtToday: { year: number; month: number; day: number },
  toleranceDays: number = 3,
): boolean {
  const effective = effectiveBillingDay(
    billingDay,
    brtToday.year,
    brtToday.month,
  );
  return brtToday.day >= effective && brtToday.day <= effective + toleranceDays;
}
