import { runBilling } from "../../modules/financial/billing/billing.service.js";
import { runConsolidatedBilling } from "../../modules/financial/billing/consolidated-billing.service.js";
import type { JobOpts } from "../registerJob.js";

export const billingJob: JobOpts = {
  name: "billing",
  cronExpr: "0 9 * * *", // 09:00 UTC = 06:00 BRT
  run: () => runBilling({ toleranceDays: 3, triggeredBy: "scheduler" }),
};

export const consolidatedBillingJob: JobOpts = {
  name: "consolidatedBilling",
  cronExpr: "5 9 * * *", // 09:05 UTC = 06:05 BRT
  run: () => runConsolidatedBilling({ toleranceDays: 3, triggeredBy: "scheduler" }),
};
