-- Sprint 15 (F5) — Sistema de holds para slots durante a configuração da agenda.
--
-- Entre o passo "Agenda" (paciente/operador escolhe horários) e o passo
-- "Contrato" (POST /accept-and-materialize cria os appointments reais), outro
-- paciente não pode roubar o mesmo slot. Holds têm TTL (default 15 min) e
-- ficam armazenados como JSON na própria linha do plano — sem nova tabela,
-- sem JOIN a cada query de disponibilidade.
--
-- slot_holds_json:        JSON array de {itemId, date, startTime, endTime,
--                         scheduleId, procedureId}
-- slot_holds_expires_at:  timestamp de expiração; queries de conflito
--                         filtram por expires_at > now() para ignorar holds
--                         mortos sem precisar de cleanup imediato.
--
-- Índice parcial cobre apenas linhas com hold ativo — minimiza tamanho.
ALTER TABLE treatment_plans
  ADD COLUMN IF NOT EXISTS slot_holds_json TEXT,
  ADD COLUMN IF NOT EXISTS slot_holds_expires_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_treatment_plans_slot_holds_active
  ON treatment_plans (slot_holds_expires_at)
  WHERE slot_holds_json IS NOT NULL;
