import { runMonthlyPlanBilling } from "../../modules/financial/billing/monthly-plan-billing.service.js";
import type { JobOpts } from "../registerJob.js";

/**
 * Sprint 3 — geração lazy das faturas mensais de plano de tratamento.
 *
 * Roda diariamente às 06:30 BRT (logo após o `consolidatedBilling`).
 * Para cada plano `vigente`/`ativo` com itens `recorrenteMensal`:
 *  - garante a fatura do mês corrente em D-5 do `billingDay`;
 *  - preenche meses passados ausentes em ordem (gap-fill).
 */
export const monthlyPlanBillingJob: JobOpts = {
  name: "monthlyPlanBilling",
  cronExpr: "30 9 * * *", // 09:30 UTC = 06:30 BRT
  run: () => runMonthlyPlanBilling({ toleranceDays: 5, triggeredBy: "scheduler" }),
};
