-- Sprint Financeiro 9 (P1) — Vencimento da mensalidade configurável por plano.
--
-- Adiciona coluna `monthly_due_day` em `treatment_plans` para permitir que o
-- paciente/clínica escolha um dia de vencimento ESPECÍFICO da fatura mensal
-- do plano, independentemente do `billingDay` cadastrado no pacote.
--
-- Hierarquia de prioridade no cálculo do vencimento (em
-- `resolveMonthlyDueDay`):
--   1. treatment_plans.monthly_due_day  (escolhido pelo paciente — novo)
--   2. packages.billing_day             (cadastro do pacote — fallback atual)
--   3. clinic_financial_settings.default_due_days
--   4. 10 (constante)
--
-- Domínio: 1..28 (evita problemas com meses curtos sem precisar clamp;
-- valores fora desse intervalo são clampados em runtime mas o input UI
-- restringe ao intervalo).
--
-- Idempotente — seguro para re-execução.

ALTER TABLE treatment_plans
  ADD COLUMN IF NOT EXISTS monthly_due_day INTEGER;

-- Constraint só é criada se ainda não existir (evita erro em re-execução).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'treatment_plans_monthly_due_day_range'
  ) THEN
    ALTER TABLE treatment_plans
      ADD CONSTRAINT treatment_plans_monthly_due_day_range
      CHECK (monthly_due_day IS NULL OR (monthly_due_day BETWEEN 1 AND 28));
  END IF;
END $$;
