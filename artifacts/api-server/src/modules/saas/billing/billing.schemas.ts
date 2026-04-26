import { z } from "zod/v4";

export const subscribeSchema = z.object({
  planId: z.number().int().positive(),
});

export const cancelSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const webhookEventSchema = z.object({
  id: z.string().min(1),
  event: z.string().min(1),
  dateCreated: z.string().optional(),
  payment: z
    .object({
      id: z.string(),
      customer: z.string(),
      subscription: z.string().optional(),
      value: z.number(),
      status: z.string(),
      dueDate: z.string(),
      paymentDate: z.string().nullable().optional(),
      externalReference: z.string().optional(),
    })
    .optional(),
  subscription: z
    .object({
      id: z.string(),
      customer: z.string(),
      status: z.string(),
    })
    .optional(),
});

export type SubscribeInput = z.infer<typeof subscribeSchema>;
export type CancelInput = z.infer<typeof cancelSchema>;
export type WebhookEventInput = z.infer<typeof webhookEventSchema>;
