-- Migration 0028: Normaliza patient_wallet_transactions
--
-- Convenção anterior: amount era gravado NEGATIVO para débitos (usoCarteira, debitoServico).
-- Convenção nova:     amount é SEMPRE POSITIVO; o campo `type` indica a direção.
--
-- Também corrige type='debito' (gravado erroneamente) → type='usoCarteira'.

-- 1. Corrige amounts negativos → positivos
UPDATE patient_wallet_transactions
SET amount = ABS(amount)
WHERE amount < 0;

-- 2. Corrige type='debito' → 'usoCarteira' (registros que usavam o tipo errado)
UPDATE patient_wallet_transactions
SET type = 'usoCarteira'
WHERE type = 'debito';
