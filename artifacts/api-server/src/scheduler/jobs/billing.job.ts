import { runBilling } from "../../modules/financial/billing/billing.service.js";
import type { JobOpts } from "../registerJob.js";

export const billingJob: JobOpts = {
  name: "billing",
  cronExpr: "0 9 * * *",
  run: () => runBilling({ toleranceDays: 3, triggeredBy: "scheduler" }),
};
