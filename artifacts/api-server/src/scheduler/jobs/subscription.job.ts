import { runSubscriptionCheck } from "../../modules/saas/subscriptions/subscription.service.js";
import type { JobOpts } from "../registerJob.js";

export const subscriptionCheckJob: JobOpts = {
  name: "subscriptionCheck",
  cronExpr: "0 10 * * *", // 10:00 UTC = 07:00 BRT
  run: () => runSubscriptionCheck(),
};
