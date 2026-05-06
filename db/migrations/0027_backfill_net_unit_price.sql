-- Migration 0027: backfill net_unit_price for existing treatment_plan_procedures rows
--
-- Fórmula: unitPrice − (totalDiscount / sessions)
-- onde sessions = total_sessions explícito OU estimativa pela vigência do plano
-- (sessions_per_week × 4.333 × duration_months, com fallback de 12 meses).
--
-- Só atualiza itens avulso (package_id IS NULL) com unit_price > 0 e
-- net_unit_price ainda NULL — operação idempotente e segura para rodar
-- múltiplas vezes.

UPDATE treatment_plan_procedures tpp
SET net_unit_price = GREATEST(
  0,
  COALESCE(tpp.unit_price, 0) - (
    COALESCE(tpp.discount, 0)
    /
    NULLIF(
      CASE
        WHEN tpp.total_sessions IS NOT NULL AND tpp.total_sessions > 0
          THEN tpp.total_sessions
        ELSE GREATEST(
          1,
          ROUND(
            COALESCE(tpp.sessions_per_week, 1)
            * 4.333
            * COALESCE(
                (
                  SELECT tp.duration_months
                  FROM   treatment_plans tp
                  WHERE  tp.id = tpp.treatment_plan_id
                ),
                12
              )
          )
        )
      END,
      0
    )
  )
)
WHERE tpp.net_unit_price IS NULL
  AND tpp.package_id    IS NULL
  AND tpp.unit_price    IS NOT NULL
  AND tpp.unit_price     > 0;
