import { Router, type Request, type Response } from "express";
import { timingSafeEqual } from "crypto";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { logger } from "../../lib/logger.js";
import { processWebhookEvent } from "../saas/billing/billing.service.js";
import { webhookEventSchema } from "../saas/billing/billing.schemas.js";

const router = Router();

function tokensMatch(received: string | undefined, expected: string): boolean {
  if (!received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * POST /api/webhooks/asaas
 *
 * Recebe eventos do gateway Asaas. Sempre devolve 200 — exceto quando o token
 * é inválido (401). Usa UNIQUE event_id para idempotência: se o mesmo evento
 * chegar duas vezes (Asaas retry), o segundo é descartado.
 */
router.post(
  "/asaas",
  asyncHandler(async (req: Request, res: Response) => {
    const expected = process.env.ASAAS_WEBHOOK_TOKEN;
    if (!expected) {
      logger.error("ASAAS_WEBHOOK_TOKEN não configurado — recusando webhook");
      res.status(503).json({ error: "Service Unavailable" });
      return;
    }

    const received = req.header("asaas-access-token") ?? undefined;
    if (!tokensMatch(received, expected)) {
      logger.warn({ ip: req.ip }, "Asaas webhook com token inválido");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const parsed = webhookEventSchema.safeParse(req.body);
    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues }, "Asaas webhook com payload inválido");
      res.status(200).json({ received: true, ignored: "invalid_payload" });
      return;
    }

    try {
      const outcome = await processWebhookEvent(parsed.data as never);
      logger.info({ eventId: parsed.data.id, event: parsed.data.event, outcome }, "Asaas webhook processado");
      res.status(200).json({ received: true, ...outcome });
    } catch (err) {
      logger.error({ err, eventId: parsed.data.id }, "Asaas webhook: erro interno (Asaas vai retentar)");
      res.status(200).json({ received: true, retry: true });
    }
  }),
);

export default router;
