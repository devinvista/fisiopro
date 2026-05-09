-- ── Billing Improvements Migration ──────────────────────────────────────────
-- 1. subscription_type em patient_subscriptions
-- 2. Tabelas patient_wallet e patient_wallet_transactions (carteira de crédito R$)
-- 3. Tabela consolidated_invoices (fatura consolidada mensal)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Adiciona subscription_type em patient_subscriptions
ALTER TABLE patient_subscriptions
  ADD COLUMN IF NOT EXISTS subscription_type TEXT NOT NULL DEFAULT 'mensal';

-- 2. Carteira de crédito do paciente (saldo em R$)
CREATE TABLE IF NOT EXISTS patient_wallet (
  id          SERIAL PRIMARY KEY,
  patient_id  INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  clinic_id   INTEGER,
  balance     NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (patient_id, clinic_id)
);

CREATE INDEX IF NOT EXISTS idx_patient_wallet_patient_id ON patient_wallet(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_wallet_clinic_id  ON patient_wallet(clinic_id);

-- 3. Histórico de transações da carteira
CREATE TABLE IF NOT EXISTS patient_wallet_transactions (
  id                  SERIAL PRIMARY KEY,
  wallet_id           INTEGER NOT NULL REFERENCES patient_wallet(id) ON DELETE CASCADE,
  patient_id          INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  clinic_id           INTEGER,
  amount              NUMERIC(10,2) NOT NULL,
  type                TEXT NOT NULL, -- 'deposito' | 'debito' | 'estorno'
  description         TEXT NOT NULL,
  appointment_id      INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
  financial_record_id INTEGER REFERENCES financial_records(id) ON DELETE SET NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pwt_wallet_id   ON patient_wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_pwt_patient_id  ON patient_wallet_transactions(patient_id);
CREATE INDEX IF NOT EXISTS idx_pwt_clinic_id   ON patient_wallet_transactions(clinic_id);
