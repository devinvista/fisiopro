import { runEndOfMonthRevenueClosure } from "../../modules/financial/billing/end-of-month-closure.service.js";
import type { JobOpts } from "../registerJob.js";

/**
 * Sprint Financeiro 10 (P2) — fechamento mensal de receita.
 *
 * Roda diariamente às 04:30 BRT (07:30 UTC). O serviço só age efetivamente
 * quando `today` é o último dia do mês BRT — nas demais datas o job retorna
 * imediatamente sem efeitos.
 *
 * O horário cedo (madrugada do último dia) garante que toda a apropriação
 * por sessão do dia anterior já foi computada antes do fechamento. O resíduo
 * de eventuais sessões realizadas durante o último dia é capturado na rodada
 * do dia seguinte, primeiro do mês seguinte... mas o fechamento já considera
 * o estado mais recente.
 *
 * Para o caso (raro) de uma sessão ser confirmada DEPOIS das 04:30 do último
 * dia do mês: ela posta sua fragmenta normalmente; o resíduo computado já
 * estará desatualizado, mas como o `recognitionCreditsConsumed` foi setado
 * para `total` pelo job, novos reconhecimentos serão no-op. Mantém integridade.
 */
export const endOfMonthRevenueClosureJob: JobOpts = {
  name: "endOfMonthRevenueClosure",
  cronExpr: "30 7 * * *", // 07:30 UTC = 04:30 BRT
  silentSuccess: true,
  run: () => runEndOfMonthRevenueClosure({ triggeredBy: "scheduler" }),
};
