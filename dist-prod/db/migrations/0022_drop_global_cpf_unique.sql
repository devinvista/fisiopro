-- Migration 0022: drop the old global UNIQUE(cpf) constraint on patients.
-- Migration 0021 added UNIQUE(cpf, clinic_id) but forgot to drop the legacy
-- UNIQUE(cpf) index. The old constraint blocked cross-clinic patient imports
-- because the INSERT would fail even when the CPF didn't exist in the target
-- clinic. Only the composite constraint is correct for a multi-tenant system.
ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_cpf_unique;
