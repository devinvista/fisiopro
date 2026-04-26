import { z } from "zod/v4";

export const POLICY_TYPES = ["privacy", "terms"] as const;

export const policyTypeSchema = z.enum(POLICY_TYPES);

export const acceptPolicySchema = z.object({
  policyDocumentId: z.number().int().positive(),
});
export type AcceptPolicyInput = z.infer<typeof acceptPolicySchema>;

export const acceptCurrentPoliciesSchema = z.object({
  privacyDocumentId: z.number().int().positive(),
  termsDocumentId: z.number().int().positive(),
});
export type AcceptCurrentPoliciesInput = z.infer<typeof acceptCurrentPoliciesSchema>;
