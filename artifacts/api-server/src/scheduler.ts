/**
 * scheduler — CRON de cobranças recorrentes e políticas de agendamento
 *
 * Jobs configurados:
 * 1. Billing automático — diariamente às 06:00 BRT (09:00 UTC)
 *    Executa runBilling() com janela de tolerância de 3 dias.
 *
 * 2. Auto-confirmação — a cada 15 minutos
 *    Executa runAutoConfirmPolicies():
 *    - Confirma agendamentos dentro da janela configurada por clínica.
 *
 * 3. Fechamento do dia — diariamente às 22:00 BRT
 *    Executa runEndOfDayPolicies():
 *    - No-show: marca como "faltou" agendamentos do dia cujo horário já passou.
 *    - Taxa de no-show: gera lançamento financeiro de ausência se habilitado.
 *    - Auto-conclusão: finaliza agendamentos "compareceu" do dia como "concluido".
 *    Roda apenas ao final do dia para dar tempo de preenchimentos e ajustes manuais.
 */

import cron from "node-cron";
import { runBilling } from "./services/billingService.js";
import { runConsolidatedBilling } from "./services/consolidatedBillingService.js";
import { runAutoConfirmPolicies, runEndOfDayPolicies } from "./services/policyService.js";
import { runSubscriptionCheck } from "./services/subscriptionService.js";

const BILLING_CRON              = "0 9 * * *";    // 09:00 UTC = 06:00 BRT diariamente
const CONSOLIDATED_BILLING_CRON = "5 9 * * *";    // 09:05 UTC = 06:05 BRT (logo após billing mensal)
const AUTO_CONFIRM_CRON         = "*/15 * * * *"; // a cada 15 minutos
const END_OF_DAY_CRON           = "0 22 * * *";   // 22:00 BRT diariamente
const SUBSCRIPTION_CHECK_CRON   = "0 10 * * *";   // 07:00 BRT diariamente (verifica assinaturas)

export function startScheduler(): void {
  // ── Billing automático ─────────────────────────────────────────────────────
  if (!cron.validate(BILLING_CRON)) {
    console.error("[scheduler] Expressão CRON de billing inválida:", BILLING_CRON);
  } else {
    cron.schedule(BILLING_CRON, async () => {
      console.log(`[scheduler] Executando billing automático — ${new Date().toISOString()}`);
      try {
        const result = await runBilling({ toleranceDays: 3, triggeredBy: "scheduler" });
        console.log(
          `[scheduler] Billing concluído: ${result.generated} geradas, ` +
          `${result.skipped} puladas, ${result.errors} erros`
        );
        if (result.errors > 0) {
          console.error("[scheduler] Detalhes dos erros:", result.details.filter(d => d.action === "error"));
        }
      } catch (err) {
        console.error("[scheduler] Falha crítica no billing automático:", err);
      }
    }, { timezone: "America/Sao_Paulo" });

    console.log(`[scheduler] Billing automático agendado — ${BILLING_CRON} (06:00 BRT / 09:00 UTC)`);
  }

  // ── Fatura consolidada mensal ─────────────────────────────────────────────
  if (!cron.validate(CONSOLIDATED_BILLING_CRON)) {
    console.error("[scheduler] Expressão CRON de fatura consolidada inválida:", CONSOLIDATED_BILLING_CRON);
  } else {
    cron.schedule(CONSOLIDATED_BILLING_CRON, async () => {
      console.log(`[scheduler] Executando faturamento consolidado — ${new Date().toISOString()}`);
      try {
        const result = await runConsolidatedBilling({ toleranceDays: 3, triggeredBy: "scheduler" });
        console.log(
          `[scheduler] Faturamento consolidado: ${result.generated} faturas geradas, ` +
          `${result.skipped} puladas, ${result.empty} sem sessões, ${result.errors} erros`
        );
      } catch (err) {
        console.error("[scheduler] Falha crítica no faturamento consolidado:", err);
      }
    }, { timezone: "America/Sao_Paulo" });

    console.log(`[scheduler] Faturamento consolidado agendado — ${CONSOLIDATED_BILLING_CRON} (06:05 BRT)`);
  }

  // ── Auto-confirmação — a cada 15 minutos ───────────────────────────────────
  if (!cron.validate(AUTO_CONFIRM_CRON)) {
    console.error("[scheduler] Expressão CRON de auto-confirmação inválida:", AUTO_CONFIRM_CRON);
  } else {
    cron.schedule(AUTO_CONFIRM_CRON, async () => {
      try {
        const result = await runAutoConfirmPolicies();
        if (result.autoConfirmed > 0 || result.errors > 0) {
          console.log(
            `[scheduler] Auto-confirmação: ${result.autoConfirmed} confirmados, ${result.errors} erros` +
            ` — ${new Date().toISOString()}`
          );
        }
        if (result.errors > 0) {
          console.error("[scheduler] Erros na auto-confirmação:", result.details.filter(d => d.action.includes("error")));
        }
      } catch (err) {
        console.error("[scheduler] Falha crítica na auto-confirmação:", err);
      }
    }, { timezone: "America/Sao_Paulo" });

    console.log(`[scheduler] Auto-confirmação agendada — ${AUTO_CONFIRM_CRON} (a cada 15 minutos)`);
  }

  // ── Fechamento do dia — 22:00 BRT ──────────────────────────────────────────
  if (!cron.validate(END_OF_DAY_CRON)) {
    console.error("[scheduler] Expressão CRON de fechamento do dia inválida:", END_OF_DAY_CRON);
  } else {
    cron.schedule(END_OF_DAY_CRON, async () => {
      console.log(`[scheduler] Executando fechamento do dia — ${new Date().toISOString()}`);
      try {
        const result = await runEndOfDayPolicies();
        console.log(
          `[scheduler] Fechamento concluído: ` +
          `${result.noShowMarked} no-shows marcados, ` +
          `${result.noShowFeesGenerated} taxas geradas, ` +
          `${result.autoCompleted} auto-concluídos, ` +
          `${result.errors} erros`
        );
        if (result.errors > 0) {
          console.error("[scheduler] Erros no fechamento do dia:", result.details.filter(d => d.action.includes("error")));
        }
      } catch (err) {
        console.error("[scheduler] Falha crítica no fechamento do dia:", err);
      }
    }, { timezone: "America/Sao_Paulo" });

    console.log(`[scheduler] Fechamento do dia agendado — ${END_OF_DAY_CRON} (22:00 BRT)`);
  }

  // ── Verificação de assinaturas das clínicas ─────────────────────────────────
  if (!cron.validate(SUBSCRIPTION_CHECK_CRON)) {
    console.error("[scheduler] Expressão CRON de verificação de assinaturas inválida:", SUBSCRIPTION_CHECK_CRON);
  } else {
    cron.schedule(SUBSCRIPTION_CHECK_CRON, async () => {
      console.log(`[scheduler] Verificando assinaturas das clínicas — ${new Date().toISOString()}`);
      try {
        const result = await runSubscriptionCheck();
        console.log(
          `[scheduler] Verificação concluída: ` +
          `${result.trialsExpired} trials expirados, ` +
          `${result.renewed} períodos renovados, ` +
          `${result.markedOverdue} inadimplentes marcados, ` +
          `${result.suspended} suspensas, ` +
          `${result.errors} erros`
        );
        if (result.errors > 0) {
          console.error("[scheduler] Erros na verificação:", result.details.filter(d => d.action === "error"));
        }
      } catch (err) {
        console.error("[scheduler] Falha crítica na verificação de assinaturas:", err);
      }
    }, { timezone: "America/Sao_Paulo" });

    console.log(`[scheduler] Verificação de assinaturas agendada — ${SUBSCRIPTION_CHECK_CRON} (07:00 BRT)`);
  }
}
