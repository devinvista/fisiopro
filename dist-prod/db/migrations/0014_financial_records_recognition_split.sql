-- Sprint Financeiro 10 (P2) — Reconhecimento fracionado da mensalidade do plano.
--
-- Adiciona em `financial_records` as colunas de tracking do reconhecimento
-- fracionado (uma fragmenta por sessão concluída do mês):
--
--   • `recognized_amount`            — soma já apropriada (R$).
--   • `recognition_credits_total`    — pool snapshotado no 1º reconhecimento
--                                      (NULL = modelo legado integral).
--   • `recognition_credits_consumed` — quantos créditos já viraram receita.
--
-- Convenção de versionamento do reconhecimento:
--   • `recognition_credits_total IS NULL` → fatura no MODELO LEGADO
--     (receita reconhecida integralmente na 1ª sessão via
--     `recognizeMonthlyInvoiceRevenue` antes do P2). Não migramos —
--     o algoritmo novo respeita o sentinel `recognized_entry_id` legado.
--   • `recognition_credits_total IS NOT NULL` → MODELO FRACIONADO P2.
--     Cada confirmação posta uma fragmenta `share = amount / total`,
--     última fragmenta absorve o resíduo de centavos. Job EOM apropria
--     o saldo restante no último dia do mês.

ALTER TABLE financial_records
  ADD COLUMN IF NOT EXISTS recognized_amount NUMERIC(12,2) NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS recognition_credits_total INTEGER,
  ADD COLUMN IF NOT EXISTS recognition_credits_consumed INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  -- Garante que valores sejam coerentes (defesa contra bugs no service).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'financial_records_recognized_amount_nonneg'
  ) THEN
    ALTER TABLE financial_records
      ADD CONSTRAINT financial_records_recognized_amount_nonneg
      CHECK (recognized_amount >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'financial_records_recognition_credits_consumed_nonneg'
  ) THEN
    ALTER TABLE financial_records
      ADD CONSTRAINT financial_records_recognition_credits_consumed_nonneg
      CHECK (recognition_credits_consumed >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'financial_records_recognition_credits_total_positive'
  ) THEN
    ALTER TABLE financial_records
      ADD CONSTRAINT financial_records_recognition_credits_total_positive
      CHECK (recognition_credits_total IS NULL OR recognition_credits_total > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'financial_records_recognition_consumed_within_total'
  ) THEN
    ALTER TABLE financial_records
      ADD CONSTRAINT financial_records_recognition_consumed_within_total
      CHECK (
        recognition_credits_total IS NULL
        OR recognition_credits_consumed <= recognition_credits_total
      );
  END IF;
END$$;
