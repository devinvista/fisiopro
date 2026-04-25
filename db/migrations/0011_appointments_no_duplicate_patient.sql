-- Garante, na camada do banco, que o mesmo paciente não pode ter dois
-- agendamentos ATIVOS no mesmo horário exato (data + start_time).
-- Status considerados "inativos" (cancelado, faltou, remarcado) ficam fora
-- do índice e podem coexistir livremente.
--
-- Esta é a "rede de segurança" para condições de corrida. A camada de
-- aplicação (`checkConflict`) já bloqueia também sobreposições com
-- horários de início diferentes; o índice cobre o caso exato.
--
-- ⚠️ ATENÇÃO: este índice falhará se já existirem duplicatas históricas no
-- banco. Para listar e limpar antes de aplicar, execute:
--
--   SELECT patient_id, date, start_time, COUNT(*), array_agg(id) AS ids
--   FROM appointments
--   WHERE status NOT IN ('cancelado','faltou','remarcado')
--   GROUP BY patient_id, date, start_time
--   HAVING COUNT(*) > 1;
--
-- Estratégia sugerida para deduplicar (mantém o agendamento mais antigo):
--
--   WITH ranked AS (
--     SELECT id, ROW_NUMBER() OVER (
--       PARTITION BY patient_id, date, start_time
--       ORDER BY id ASC
--     ) AS rn
--     FROM appointments
--     WHERE status NOT IN ('cancelado','faltou','remarcado')
--   )
--   UPDATE appointments
--   SET status = 'cancelado', notes = COALESCE(notes,'') || ' [auto-cancelado: duplicidade]'
--   WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_patient_active_slot
  ON appointments (patient_id, date, start_time)
  WHERE status NOT IN ('cancelado', 'faltou', 'remarcado');
