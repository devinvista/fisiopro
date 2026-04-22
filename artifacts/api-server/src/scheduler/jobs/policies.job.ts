import { runAutoConfirmPolicies, runEndOfDayPolicies } from "../../modules/clinical/policies/policy.service.js";
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
  run: () => runEndOfDayPolicies(),
};
