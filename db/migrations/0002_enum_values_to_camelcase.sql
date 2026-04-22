-- Migration: convert snake_case enum values to camelCase
-- Standardises all application enum string values stored in the database

-- ── procedures.billing_type ──────────────────────────────────────────────────
UPDATE "procedures"
SET "billing_type" = 'porSessao'
WHERE "billing_type" = 'por_sessao';

-- ── financial_records.transaction_type ──────────────────────────────────────
UPDATE "financial_records"
SET "transaction_type" = 'cobrancaMensal'
WHERE "transaction_type" = 'cobranca_mensal';

UPDATE "financial_records"
SET "transaction_type" = 'cobrancaSessao'
WHERE "transaction_type" = 'cobranca_sessao';

UPDATE "financial_records"
SET "transaction_type" = 'usoCredito'
WHERE "transaction_type" = 'uso_credito';

UPDATE "financial_records"
SET "transaction_type" = 'creditoSessao'
WHERE "transaction_type" = 'credito_sessao';

-- ── update procedures.billing_type default ───────────────────────────────────
ALTER TABLE "procedures"
  ALTER COLUMN "billing_type" SET DEFAULT 'porSessao';
