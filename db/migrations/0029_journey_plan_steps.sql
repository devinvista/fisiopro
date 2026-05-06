-- Migration 0029: Expand patient journey with treatment plan acceptance steps
--
-- Adds two new steps between plano_tratamento and tratamento:
--   - aceite_plano (6): patient accepted/signed the treatment plan contract
--   - geracao_agenda (7): appointments generated (plan materialized)
--
-- Existing steps shifted:
--   - agendamento (6) → renamed geracao_agenda (7)
--   - tratamento (7) → (8)
--   - alta (8) → (9)

-- 1. Shift alta FIRST (to avoid order conflicts)
UPDATE patient_journey_steps SET step_order = 9 WHERE step_key = 'alta';

-- 2. Shift tratamento
UPDATE patient_journey_steps SET step_order = 8 WHERE step_key = 'tratamento';

-- 3. Rename agendamento → geracao_agenda and shift to order 7
UPDATE patient_journey_steps
SET step_key = 'geracao_agenda', step_order = 7
WHERE step_key = 'agendamento';

-- 4. Insert aceite_plano (order 6) for every patient that already has journey rows
INSERT INTO patient_journey_steps
  (patient_id, clinic_id, step_key, step_order, status, created_at, updated_at)
SELECT DISTINCT patient_id, clinic_id, 'aceite_plano', 6, 'pending', NOW(), NOW()
FROM patient_journey_steps
WHERE step_key = 'geracao_agenda';
