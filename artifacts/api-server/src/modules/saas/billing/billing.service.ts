/**
 * billingService — integração Asaas para cobrança recorrente das assinaturas SaaS.
 *
 * Fluxo:
 *  - subscribeWithAsaas(): cria customer + subscription no Asaas, devolve checkout URL
 *  - cancelAsaasSubscription(): cancela no Asaas e volta clínica para billingMode=manual
 *  - listDelinquent(): retorna clínicas com overdue/suspended para o painel admin
 *  - processWebhookEvent(): aplica eventos PAYMENT_x / SUBSCRIPTION_x (idempotente via UNIQUE event_id)
 */

import { db } from "@workspace/db";
import {
  clinicSubscriptionsTable,
  subscriptionPlansTable,
  clinicsTable,
  asaasWebhookEventsTable,
} from "@workspace/db";
import { eq, sql, inArray, desc, isNotNull } from "drizzle-orm";
import { HttpError } from "../../../utils/httpError.js";
import { todayBRT, addDays } from "../../../utils/dateUtils.js";
import { logger } from "../../../lib/logger.js";
import { asaasClient, AsaasHttpError, type AsaasWebhookEventPayload } from "../../../lib/asaas/index.js";
import { applyPaymentToSubscription } from "../saas-plans/saas-plans.service.js";

function asaasEnabled(): boolean {
  return Boolean(process.env.ASAAS_API_KEY);
}

function nextDueDate(): string {
  return addDays(todayBRT(), 1);
}

// ─── Customer (Clínica → Asaas) ──────────────────────────────────────────────

async function ensureAsaasCustomer(clinicId: number): Promise<string> {
  const [sub] = await db
    .select({
      asaasCustomerId: clinicSubscriptionsTable.asaasCustomerId,
      clinic: { id: clinicsTable.id, name: clinicsTable.name, email: clinicsTable.email, phone: clinicsTable.phone },
    })
    .from(clinicSubscriptionsTable)
    .leftJoin(clinicsTable, eq(clinicSubscriptionsTable.clinicId, clinicsTable.id))
    .where(eq(clinicSubscriptionsTable.clinicId, clinicId))
    .limit(1);

  if (!sub) throw HttpError.notFound("Assinatura da clínica não encontrada");
  if (sub.asaasCustomerId) return sub.asaasCustomerId;
  if (!sub.clinic) throw HttpError.notFound("Clínica não encontrada");
  if (!sub.clinic.email) throw HttpError.badRequest("E-mail da clínica é obrigatório para cadastro no gateway");

  const customer = await asaasClient.customers.create({
    name: sub.clinic.name,
    email: sub.clinic.email,
    phone: sub.clinic.phone ?? undefined,
    externalReference: `clinic:${clinicId}`,
  });

  await db
    .update(clinicSubscriptionsTable)
    .set({ asaasCustomerId: customer.id, updatedAt: new Date() })
    .where(eq(clinicSubscriptionsTable.clinicId, clinicId));

  return customer.id;
}

// ─── Subscribe (Plano → Asaas Subscription) ──────────────────────────────────

export async function subscribeWithAsaas(clinicId: number, planId: number) {
  if (!asaasEnabled()) {
    throw HttpError.badRequest("Pagamento por cartão indisponível: gateway não configurado");
  }

  const [row] = await db
    .select({
      sub: clinicSubscriptionsTable,
      plan: subscriptionPlansTable,
    })
    .from(clinicSubscriptionsTable)
    .leftJoin(subscriptionPlansTable, eq(clinicSubscriptionsTable.planId, subscriptionPlansTable.id))
    .where(eq(clinicSubscriptionsTable.clinicId, clinicId))
    .limit(1);

  if (!row) throw HttpError.notFound("Assinatura da clínica não encontrada");
  const targetPlan = row.plan?.id === planId
    ? row.plan
    : (await db.select().from(subscriptionPlansTable).where(eq(subscriptionPlansTable.id, planId)).limit(1))[0];
  if (!targetPlan) throw HttpError.notFound("Plano não encontrado");

  // Se já existe assinatura Asaas ativa para este plano, devolve a URL existente.
  if (row.sub.asaasSubscriptionId && row.sub.planId === planId && row.sub.billingMode === "asaas_card" && row.sub.asaasCheckoutUrl) {
    return { checkoutUrl: row.sub.asaasCheckoutUrl, subscriptionId: row.sub.asaasSubscriptionId };
  }

  // Cancela qualquer assinatura Asaas anterior antes de criar nova (mudança de plano)
  if (row.sub.asaasSubscriptionId) {
    try {
      await asaasClient.subscriptions.cancel(row.sub.asaasSubscriptionId);
    } catch (err) {
      logger.warn({ err, subId: row.sub.asaasSubscriptionId }, "Falha ao cancelar assinatura Asaas anterior — prosseguindo");
    }
  }

  const customerId = await ensureAsaasCustomer(clinicId);

  try {
    const subscription = await asaasClient.subscriptions.create({
      customer: customerId,
      billingType: "CREDIT_CARD",
      value: Number(targetPlan.price),
      nextDueDate: nextDueDate(),
      cycle: "MONTHLY",
      description: `FisioGest Pro — ${targetPlan.displayName}`,
      externalReference: `clinic:${clinicId}`,
    });

    // Asaas devolve invoiceUrl no primeiro payment; fetch para obter o link
    const payments = await asaasClient.subscriptions.listPayments(subscription.id);
    const checkoutUrl = payments.data[0]?.invoiceUrl ?? `https://www.asaas.com/i/${subscription.id}`;

    await db
      .update(clinicSubscriptionsTable)
      .set({
        planId,
        asaasSubscriptionId: subscription.id,
        asaasCheckoutUrl: checkoutUrl,
        billingMode: "asaas_card",
        amount: String(targetPlan.price),
        updatedAt: new Date(),
      })
      .where(eq(clinicSubscriptionsTable.clinicId, clinicId));

    logger.info({ clinicId, planId, asaasSubId: subscription.id }, "Asaas subscription created");

    return { checkoutUrl, subscriptionId: subscription.id };
  } catch (err) {
    if (err instanceof AsaasHttpError) {
      logger.error({ status: err.status, body: err.body }, "Falha ao criar assinatura Asaas");
      throw HttpError.badRequest("Não foi possível criar assinatura no gateway. Tente novamente.");
    }
    throw err;
  }
}

// ─── Cancel ──────────────────────────────────────────────────────────────────

export async function cancelAsaasSubscription(clinicId: number) {
  const [sub] = await db
    .select()
    .from(clinicSubscriptionsTable)
    .where(eq(clinicSubscriptionsTable.clinicId, clinicId))
    .limit(1);

  if (!sub) throw HttpError.notFound("Assinatura não encontrada");
  if (!sub.asaasSubscriptionId) {
    throw HttpError.badRequest("Esta clínica não possui cobrança automática ativa");
  }

  if (asaasEnabled()) {
    try {
      await asaasClient.subscriptions.cancel(sub.asaasSubscriptionId);
    } catch (err) {
      if (err instanceof AsaasHttpError && err.status !== 404) throw err;
    }
  }

  await db
    .update(clinicSubscriptionsTable)
    .set({
      asaasSubscriptionId: null,
      asaasCheckoutUrl: null,
      billingMode: "manual",
      updatedAt: new Date(),
    })
    .where(eq(clinicSubscriptionsTable.clinicId, clinicId));

  logger.info({ clinicId }, "Asaas subscription cancelled — back to manual billing");
}

// ─── Status ──────────────────────────────────────────────────────────────────

export async function getBillingStatus(clinicId: number) {
  const [row] = await db
    .select({
      billingMode: clinicSubscriptionsTable.billingMode,
      asaasSubscriptionId: clinicSubscriptionsTable.asaasSubscriptionId,
      asaasCheckoutUrl: clinicSubscriptionsTable.asaasCheckoutUrl,
      paymentStatus: clinicSubscriptionsTable.paymentStatus,
      currentPeriodEnd: clinicSubscriptionsTable.currentPeriodEnd,
      status: clinicSubscriptionsTable.status,
    })
    .from(clinicSubscriptionsTable)
    .where(eq(clinicSubscriptionsTable.clinicId, clinicId))
    .limit(1);
  return row ?? null;
}

// ─── Delinquency Panel (superadmin) ──────────────────────────────────────────

export async function listDelinquent() {
  return db
    .select({
      sub: {
        id: clinicSubscriptionsTable.id,
        status: clinicSubscriptionsTable.status,
        paymentStatus: clinicSubscriptionsTable.paymentStatus,
        billingMode: clinicSubscriptionsTable.billingMode,
        asaasSubscriptionId: clinicSubscriptionsTable.asaasSubscriptionId,
        asaasCheckoutUrl: clinicSubscriptionsTable.asaasCheckoutUrl,
        amount: clinicSubscriptionsTable.amount,
        currentPeriodEnd: clinicSubscriptionsTable.currentPeriodEnd,
        trialEndDate: clinicSubscriptionsTable.trialEndDate,
        updatedAt: clinicSubscriptionsTable.updatedAt,
      },
      clinic: { id: clinicsTable.id, name: clinicsTable.name, email: clinicsTable.email, phone: clinicsTable.phone },
      plan: { id: subscriptionPlansTable.id, displayName: subscriptionPlansTable.displayName },
    })
    .from(clinicSubscriptionsTable)
    .innerJoin(clinicsTable, eq(clinicSubscriptionsTable.clinicId, clinicsTable.id))
    .leftJoin(subscriptionPlansTable, eq(clinicSubscriptionsTable.planId, subscriptionPlansTable.id))
    .where(inArray(clinicSubscriptionsTable.paymentStatus, ["overdue", "expired"]))
    .orderBy(desc(clinicSubscriptionsTable.updatedAt));
}

export async function listAsaasManaged() {
  return db
    .select({
      sub: {
        id: clinicSubscriptionsTable.id,
        billingMode: clinicSubscriptionsTable.billingMode,
        asaasSubscriptionId: clinicSubscriptionsTable.asaasSubscriptionId,
        amount: clinicSubscriptionsTable.amount,
      },
      clinic: { id: clinicsTable.id, name: clinicsTable.name },
      plan: { displayName: subscriptionPlansTable.displayName },
    })
    .from(clinicSubscriptionsTable)
    .innerJoin(clinicsTable, eq(clinicSubscriptionsTable.clinicId, clinicsTable.id))
    .leftJoin(subscriptionPlansTable, eq(clinicSubscriptionsTable.planId, subscriptionPlansTable.id))
    .where(isNotNull(clinicSubscriptionsTable.asaasSubscriptionId));
}

export async function sendDunningReminder(clinicId: number) {
  const [sub] = await db
    .select()
    .from(clinicSubscriptionsTable)
    .where(eq(clinicSubscriptionsTable.clinicId, clinicId))
    .limit(1);

  if (!sub?.asaasSubscriptionId) {
    throw HttpError.badRequest("Esta clínica não possui assinatura no gateway — envio de lembrete indisponível.");
  }

  const payments = await asaasClient.subscriptions.listPayments(sub.asaasSubscriptionId);
  const overdue = payments.data.find((p) => p.status === "OVERDUE" || p.status === "PENDING");
  if (!overdue) {
    throw HttpError.badRequest("Nenhuma cobrança em aberto para reenviar");
  }
  await asaasClient.payments.sendReminder(overdue.id);
  logger.info({ clinicId, paymentId: overdue.id }, "Dunning reminder sent via Asaas");
}

// ─── Webhook processing ──────────────────────────────────────────────────────

const PAID_EVENTS = new Set([
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
]);

const OVERDUE_EVENTS = new Set([
  "PAYMENT_OVERDUE",
]);

const REFUND_EVENTS = new Set([
  "PAYMENT_REFUNDED",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
]);

const SUB_REMOVED_EVENTS = new Set([
  "SUBSCRIPTION_DELETED",
  "SUBSCRIPTION_CYCLE_REMOVED",
]);

interface WebhookProcessOutcome {
  result: "applied" | "ignored" | "duplicate" | "no_match";
  clinicId?: number;
}

export async function processWebhookEvent(payload: AsaasWebhookEventPayload): Promise<WebhookProcessOutcome> {
  // Idempotência via UNIQUE event_id
  try {
    await db.insert(asaasWebhookEventsTable).values({
      eventId: payload.id,
      eventType: payload.event,
      payload: payload as unknown as Record<string, unknown>,
      result: "pending",
    });
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === "23505") {
      logger.info({ eventId: payload.id }, "Webhook duplicado ignorado (UNIQUE event_id)");
      return { result: "duplicate" };
    }
    throw err;
  }

  const finalize = async (result: WebhookProcessOutcome["result"], clinicId?: number, errorMsg?: string) => {
    await db
      .update(asaasWebhookEventsTable)
      .set({
        result,
        relatedClinicId: clinicId ?? null,
        errorMsg: errorMsg ?? null,
        processedAt: new Date(),
      })
      .where(eq(asaasWebhookEventsTable.eventId, payload.id));
    return { result, clinicId } as WebhookProcessOutcome;
  };

  try {
    // Eventos de assinatura
    if (SUB_REMOVED_EVENTS.has(payload.event) && payload.subscription) {
      const [sub] = await db
        .select({ clinicId: clinicSubscriptionsTable.clinicId })
        .from(clinicSubscriptionsTable)
        .where(eq(clinicSubscriptionsTable.asaasSubscriptionId, payload.subscription.id))
        .limit(1);
      if (!sub) return finalize("no_match");
      await db
        .update(clinicSubscriptionsTable)
        .set({ asaasSubscriptionId: null, asaasCheckoutUrl: null, billingMode: "manual", updatedAt: new Date() })
        .where(eq(clinicSubscriptionsTable.clinicId, sub.clinicId));
      return finalize("applied", sub.clinicId);
    }

    // Eventos de pagamento
    if (!payload.payment) return finalize("ignored");
    const asaasSubId = payload.payment.subscription;
    if (!asaasSubId) return finalize("ignored");

    const [sub] = await db
      .select()
      .from(clinicSubscriptionsTable)
      .where(eq(clinicSubscriptionsTable.asaasSubscriptionId, asaasSubId))
      .limit(1);

    if (!sub) return finalize("no_match");

    if (PAID_EVENTS.has(payload.event)) {
      const paidAt = payload.payment.paymentDate ? new Date(payload.payment.paymentDate) : new Date();
      await applyPaymentToSubscription(sub.id, paidAt);
      return finalize("applied", sub.clinicId);
    }

    if (OVERDUE_EVENTS.has(payload.event)) {
      await db
        .update(clinicSubscriptionsTable)
        .set({ paymentStatus: "overdue", updatedAt: new Date() })
        .where(eq(clinicSubscriptionsTable.id, sub.id));
      return finalize("applied", sub.clinicId);
    }

    if (REFUND_EVENTS.has(payload.event)) {
      await db
        .update(clinicSubscriptionsTable)
        .set({ paymentStatus: "expired", updatedAt: new Date() })
        .where(eq(clinicSubscriptionsTable.id, sub.id));
      return finalize("applied", sub.clinicId);
    }

    return finalize("ignored");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, eventId: payload.id }, "Falha ao processar webhook Asaas");
    await finalize("ignored", undefined, msg);
    throw err;
  }
}

export async function listRecentWebhookEvents(limit = 50) {
  return db
    .select()
    .from(asaasWebhookEventsTable)
    .orderBy(desc(asaasWebhookEventsTable.createdAt))
    .limit(limit);
}

// Helper for tests: count rows
export async function countWebhookEvents() {
  const [row] = await db.select({ total: sql<number>`count(*)::int` }).from(asaasWebhookEventsTable);
  return row?.total ?? 0;
}
