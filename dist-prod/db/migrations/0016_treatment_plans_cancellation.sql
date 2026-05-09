-- Sprint Financeiro 12 (P3) — Cancelamento de plano de tratamento.
--
-- Adiciona campos de auditoria de cancelamento em `treatment_plans` para
-- registrar QUEM, QUANDO e POR QUE um plano vigente foi cancelado. Esses
-- dados são exigidos pela LGPD (rastreabilidade de operações comerciais)
-- e usados pelo relatório de reconciliação financeira.
--
-- Idempotente — seguro para re-execução.

ALTER TABLE treatment_plans
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS cancelled_by INTEGER;
