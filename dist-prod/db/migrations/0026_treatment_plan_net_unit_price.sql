-- Migration 0026: add net_unit_price to treatment_plan_procedures
-- Armazena o preço líquido por sessão negociado no contrato
-- (unitPrice − desconto_unitário). Calculado no cadastro/edição do item.
-- Usado pelo billing engine para imputar o valor correto sem recalcular
-- desconto total ÷ sessões estimadas a cada atendimento.

ALTER TABLE treatment_plan_procedures
  ADD COLUMN IF NOT EXISTS net_unit_price NUMERIC(10, 2);
