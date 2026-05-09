-- ─── 0025_clinic_id_not_null.sql ──────────────────────────────────────────────
-- Adiciona NOT NULL ao clinic_id em todas as tabelas de negócio onde ele estava
-- nullable. Os dados órfãos (NULL) foram corrigidos previamente em sessão de
-- manutenção (accounting_accounts deletados, procedures e billing_run_logs
-- vinculados à clínica 3). users e user_roles são intencionalmente excluídos:
-- o super admin tem clinic_id NULL por design (conta cross-clínica).

ALTER TABLE accounting_accounts        ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE accounting_journal_entries ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE receivable_allocations     ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE appointments               ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE billing_run_logs           ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE blocked_slots              ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE financial_records          ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE packages                   ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE patient_journey_steps      ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE patient_packages           ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE patient_wallet             ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE patient_wallet_transactions ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE procedures                 ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE session_credits            ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE treatment_plans            ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE body_measurements          ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE patient_photos             ALTER COLUMN clinic_id SET NOT NULL;
