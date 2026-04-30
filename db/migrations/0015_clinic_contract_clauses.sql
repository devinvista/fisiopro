-- Sprint Financeiro 11 (P5) — Cláusulas contratuais configuráveis.
--
-- Cada clínica define suas próprias cláusulas contratuais (texto + versão +
-- obrigatoriedade). No aceite do plano, o paciente marca cada cláusula
-- aplicável; o snapshot dessas cláusulas (incluindo o `body` na versão
-- vigente) é congelado em `treatment_plans.accepted_clauses_json` para
-- auditoria probatória LGPD/CPC art. 784, III.
--
-- Modelo:
--   • `code`       — identificador estável (ex.: REAGENDAMENTO_INTRAMENSAL).
--   • `version`    — incrementa quando o body muda. Histórico preservado
--                    via `is_active=false` em versões antigas.
--   • `is_required`— bloqueia o aceite quando `false` no payload.
--   • `is_active`  — apenas cláusulas ativas são exibidas no aceite/CRUD.
--   • `sort_order` — ordem de exibição.

CREATE TABLE IF NOT EXISTS clinic_contract_clauses (
  id            SERIAL PRIMARY KEY,
  clinic_id     INTEGER NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  code          TEXT NOT NULL,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  is_required   BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinic_contract_clauses_clinic
  ON clinic_contract_clauses(clinic_id);

-- Garante unicidade de (clinic_id, code, version) — versões diferentes do
-- mesmo `code` coexistem (histórico). Apenas uma versão por code pode estar
-- `is_active=true` (não enforçado em SQL — o service garante via UPDATE em
-- transação ao publicar nova versão).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_clinic_contract_clauses_clinic_code_version
  ON clinic_contract_clauses(clinic_id, code, version);

-- Snapshot das cláusulas aceitas no momento do aceite. Estrutura:
-- { "acceptedAt": "...", "items": [{ "code": "...", "version": 1, "title": "...", "body": "...", "isRequired": true }] }
ALTER TABLE treatment_plans
  ADD COLUMN IF NOT EXISTS accepted_clauses_json TEXT;
