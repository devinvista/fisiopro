/**
 * scheduler — registro central de CRON jobs.
 *
 * Cada job vive em ./jobs/<dominio>.job.ts e é apenas registrado aqui.
 * Cada job é instrumentado com logger estruturado (pino) capturando:
 *  - início (debug)
 *  - duração em ms (info)
 *  - sucesso/erro contável
 *  - falhas críticas via captureException (Sentry)
 */

import { registerJob } from "./registerJob.js";
import { billingJob, consolidatedBillingJob } from "./jobs/billing.job.js";
import { monthlyPlanBillingJob } from "./jobs/monthly-plan-billing.job.js";
import { autoConfirmJob, endOfDayJob } from "./jobs/policies.job.js";
import { subscriptionCheckJob } from "./jobs/subscription.job.js";

export function startScheduler(): void {
  registerJob(billingJob);
  registerJob(consolidatedBillingJob);
  registerJob(monthlyPlanBillingJob);
  registerJob(autoConfirmJob);
  registerJob(endOfDayJob);
  registerJob(subscriptionCheckJob);
}
