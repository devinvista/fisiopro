/**
 * Sprint 15 (F5) — Limpeza periódica de holds expirados.
 *
 * Holds expirados NÃO bloqueiam (queries de conflito filtram por
 * `expires_at > now()`), então este job é puramente higiene de dados:
 * apaga `slot_holds_json` e `slot_holds_expires_at` de planos cujo TTL
 * já passou. Idempotente.
 *
 * Cron: a cada 30 minutos (TTL típico é 15min, então rodar 2× por TTL é
 * suficiente para manter o número de linhas com hold "morto" próximo de
 * zero sem pressão na DB).
 */
import { purgeExpiredHolds } from "../../modules/clinical/medical-records/slot-holds.service.js";
import type { JobOpts } from "../registerJob.js";

export const slotHoldsCleanupJob: JobOpts = {
  name: "slotHoldsCleanup",
  cronExpr: "*/30 * * * *",
  silentSuccess: true,
  run: () => purgeExpiredHolds(),
};
