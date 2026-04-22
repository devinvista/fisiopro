-- Remove unique constraint so a patient can have multiple treatment plans
ALTER TABLE treatment_plans DROP CONSTRAINT IF EXISTS treatment_plans_patient_id_unique;

-- Add clinic_id column (nullable for backward compat)
ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS clinic_id INTEGER REFERENCES clinics(id);

-- Backfill clinic_id from the patient's clinic
UPDATE treatment_plans tp
SET clinic_id = p.clinic_id
FROM patients p
WHERE tp.patient_id = p.id
  AND tp.clinic_id IS NULL;
