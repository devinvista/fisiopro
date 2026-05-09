-- Sprint 15 (F6) — Rollout: v2 vira o default para novas clínicas.
--
-- A migration 0017 introduziu `clinics.use_v2_acceptance_flow` com DEFAULT
-- FALSE para que clínicas EXISTENTES não tivessem a UI mudada de surpresa.
-- Agora que F1–F5 estão estáveis e validados, queremos que toda clínica
-- recém-criada já nasça no fluxo novo (Itens → Cobrança → Agenda → Contrato
-- com aceite atômico). Esta migration apenas troca o DEFAULT da coluna —
-- NÃO atualiza linhas existentes (clínicas em produção continuam vendo o
-- fluxo legado até que ativem manualmente em Configurações > Clínica).
--
-- Idempotente — `ALTER COLUMN ... SET DEFAULT` é seguro para re-execução
-- (Postgres simplesmente sobrescreve o default atual).

ALTER TABLE clinics
  ALTER COLUMN use_v2_acceptance_flow SET DEFAULT TRUE;
