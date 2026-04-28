import { runAutoConfirmPolicies, runEndOfDayPolicies } from "../../modules/clinical/policies/policy.service.js";
import { expireSessionCredits } from "../../modules/clinical/session-credits/session-credits.service.js";
import type { JobOpts } from "../registerJob.js";

export const autoConfirmJob: JobOpts = {
  name: "autoConfirm",
  cronExpr: "*/15 * * * *",
  silentSuccess: true,
  run: () => runAutoConfirmPolicies(),
};

export const endOfDayJob: JobOpts = {
  name: "endOfDay",
  cronExpr: "0 22 * * *", // 22:00 BRT
  // Sprint 3 — End-of-day combinado: políticas + expiração de créditos.
  run: async () => {
    const policy = await runEndOfDayPolicies();
    const credits = await expireSessionCredits();
    return { ...policy, sessionCreditsExpired: credits.expired };
  },
};
