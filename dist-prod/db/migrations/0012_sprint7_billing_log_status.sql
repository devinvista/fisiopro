-- Sprint Financeiro 7 — PR-FIN7-3 (B7)
-- Adiciona colunas de controle de execução em duas fases ao log de billing.
--   run_id : UUID gerado no início da execução (correlaciona registros criados).
--   status  : 'running' → 'ok' | 'failed' (atualizado ao concluir).
-- Idempotente — seguro para re-execução.

ALTER TABLE billing_run_logs
  ADD COLUMN IF NOT EXISTS run_id  TEXT,
  ADD COLUMN IF NOT EXISTS status  TEXT NOT NULL DEFAULT 'ok';
