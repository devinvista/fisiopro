import { z } from "zod/v4";
import {
  SAAS_SUBSCRIPTION_STATUSES,
  SAAS_PAYMENT_STATUSES,
} from "@workspace/shared-constants";

export const planSchema = z.object({
  name: z.string().min(1).max(50),
  displayName: z.string().min(1).max(100),
  description: z.string().max(300).optional().default(""),
  price: z.number().nonnegative(),
  maxProfessionals: z.number().int().positive().nullable().optional(),
  maxPatients: z.number().int().positive().nullable().optional(),
  maxSchedules: z.number().int().positive().nullable().optional(),
  maxUsers: z.number().int().positive().nullable().optional(),
  trialDays: z.number().int().nonnegative().optional().default(30),
  features: z.array(z.string()).optional().default([]),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
});

export const subscriptionSchema = z.object({
  clinicId: z.number().int().positive(),
  planId: z.number().int().positive(),
  status: z.enum(SAAS_SUBSCRIPTION_STATUSES).optional().default("trial"),
  trialStartDate: z.string().nullable().optional(),
  trialEndDate: z.string().nullable().optional(),
  currentPeriodStart: z.string().nullable().optional(),
  currentPeriodEnd: z.string().nullable().optional(),
  amount: z.number().nonnegative().nullable().optional(),
  paymentStatus: z.enum(SAAS_PAYMENT_STATUSES).optional().default("pending"),
  notes: z.string().max(500).nullable().optional(),
});

export const updateSubscriptionSchema = z.object({
  planId: z.number().int().positive().optional(),
  status: z.enum(SAAS_SUBSCRIPTION_STATUSES).optional(),
  trialStartDate: z.string().nullable().optional(),
  trialEndDate: z.string().nullable().optional(),
  currentPeriodStart: z.string().nullable().optional(),
  currentPeriodEnd: z.string().nullable().optional(),
  amount: z.number().nonnegative().nullable().optional(),
  paymentStatus: z.enum(SAAS_PAYMENT_STATUSES).optional(),
  paidAt: z.string().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const paymentSchema = z.object({
  clinicId: z.number().int().positive(),
  subscriptionId: z.number().int().positive().nullable().optional(),
  amount: z.number().positive(),
  method: z.enum(["manual", "pix", "credit_card", "boleto", "transfer", "other"]).default("manual"),
  referenceMonth: z.string().regex(/^\d{4}-\d{2}$/).nullable().optional(),
  paidAt: z.string().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  updateSubscriptionStatus: z.boolean().optional().default(true),
});
