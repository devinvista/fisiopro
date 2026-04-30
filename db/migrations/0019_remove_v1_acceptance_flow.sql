-- Sprint 15 (F7) — Remoção definitiva do fluxo legado v1 de aceite.
--
-- Histórico:
--   • 0017 introduziu `clinics.use_v2_acceptance_flow` com DEFAULT FALSE para
--     coexistência durante o rollout.
--   • 0018 trocou o DEFAULT para TRUE (clínicas novas nascem em v2).
--   • 0019 (esta) força TODAS as clínicas existentes para v2 e remove a
--     coluna — o frontend e o backend deixam de ler/escrever a flag, o
--     fluxo passa a ser SEMPRE atômico (`POST /accept-and-materialize`).
--
-- Quando rodar em produção, as clínicas que ainda estavam em v1 são
-- automaticamente promovidas a v2. O wizard antigo de 3 etapas e o endpoint
-- `POST /accept` legado deixam de existir; a UI carregada pelos navegadores
-- com cache antigo passa a chamar rotas inexistentes (404), forçando refresh.
--
-- Idempotente — `DROP COLUMN IF EXISTS` e `UPDATE` são seguros para re-execução.

UPDATE clinics SET use_v2_acceptance_flow = TRUE WHERE use_v2_acceptance_flow = FALSE;

ALTER TABLE clinics DROP COLUMN IF EXISTS use_v2_acceptance_flow;
