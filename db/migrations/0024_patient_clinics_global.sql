-- ─── 0024_patient_clinics_global.sql ─────────────────────────────────────────
-- Migra o modelo de pacientes de "cópia por clínica" para "identidade global +
-- vínculos patient_clinics".
--
-- Etapas:
--   1. Corrige unique de anamnesis e discharge_summaries para incluir clinic_id
--   2. Cria tabela patient_clinics
--   3. Popula patient_clinics a partir dos patients originais (source_patient_id IS NULL)
--   4. Para patients importados (source_patient_id IS NOT NULL):
--        a. Atualiza FKs de todos os registros clínicos/financeiros para o canonical
--        b. Cria patient_clinics para a clínica importadora → canonical patient
--        c. Soft-deleta o registro duplicado
--   5. Substitui o unique (cpf, clinic_id) por índice único global de CPF

BEGIN;

-- ── 1. Corrigir constraints que conflitariam após deduplicação ────────────────

-- anamnesis: (patient_id, template_type) → (patient_id, clinic_id, template_type)
ALTER TABLE anamnesis DROP CONSTRAINT IF EXISTS "uniq_anamnesis_patient_template";
ALTER TABLE anamnesis ADD CONSTRAINT "uniq_anamnesis_patient_clinic_template"
  UNIQUE NULLS NOT DISTINCT (patient_id, clinic_id, template_type);

-- discharge_summaries: UNIQUE(patient_id) → UNIQUE(patient_id, clinic_id)
ALTER TABLE discharge_summaries DROP CONSTRAINT IF EXISTS "discharge_summaries_patient_id_key";
ALTER TABLE discharge_summaries ADD CONSTRAINT "uniq_discharge_patient_clinic"
  UNIQUE NULLS NOT DISTINCT (patient_id, clinic_id);

-- ── 2. Criar tabela patient_clinics ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_clinics (
  id         SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  clinic_id  INTEGER REFERENCES clinics(id) ON DELETE CASCADE,
  notes      TEXT,
  status     TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP,
  UNIQUE(patient_id, clinic_id)
);

CREATE INDEX IF NOT EXISTS idx_patient_clinics_patient_id ON patient_clinics(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_clinics_clinic_id  ON patient_clinics(clinic_id);

-- ── 3. Popular patient_clinics para patients originais ───────────────────────
INSERT INTO patient_clinics (patient_id, clinic_id, created_at)
SELECT id, clinic_id, created_at
FROM   patients
WHERE  source_patient_id IS NULL
  AND  clinic_id IS NOT NULL
  AND  deleted_at IS NULL
ON CONFLICT (patient_id, clinic_id) DO NOTHING;

-- ── 4a. Atualizar FKs dos registros clínicos/financeiros ─────────────────────
-- Todos os registros que apontavam para um patient "importado" (cópia)
-- passam a apontar para o patient canônico (source_patient_id).

UPDATE anamnesis a
  SET patient_id = p.source_patient_id
  FROM patients p
  WHERE a.patient_id = p.id AND p.source_patient_id IS NOT NULL;

UPDATE evaluations e
  SET patient_id = p.source_patient_id
  FROM patients p
  WHERE e.patient_id = p.id AND p.source_patient_id IS NOT NULL;

UPDATE evolutions ev
  SET patient_id = p.source_patient_id
  FROM patients p
  WHERE ev.patient_id = p.id AND p.source_patient_id IS NOT NULL;

UPDATE discharge_summaries d
  SET patient_id = p.source_patient_id
  FROM patients p
  WHERE d.patient_id = p.id AND p.source_patient_id IS NOT NULL;

UPDATE exam_attachments ea
  SET patient_id = p.source_patient_id
  FROM patients p
  WHERE ea.patient_id = p.id AND p.source_patient_id IS NOT NULL;

UPDATE atestados at
  SET patient_id = p.source_patient_id
  FROM patients p
  WHERE at.patient_id = p.id AND p.source_patient_id IS NOT NULL;

UPDATE treatment_plans tp
  SET patient_id = p.source_patient_id
  FROM patients p
  WHERE tp.patient_id = p.id AND p.source_patient_id IS NOT NULL;

UPDATE body_measurements bm
  SET patient_id = p.source_patient_id
  FROM patients p
  WHERE bm.patient_id = p.id AND p.source_patient_id IS NOT NULL;

UPDATE patient_photos pp
  SET patient_id = p.source_patient_id
  FROM patients p
  WHERE pp.patient_id = p.id AND p.source_patient_id IS NOT NULL;

UPDATE appointments ap
  SET patient_id = p.source_patient_id
  FROM patients p
  WHERE ap.patient_id = p.id AND p.source_patient_id IS NOT NULL;

UPDATE financial_records fr
  SET patient_id = p.source_patient_id
  FROM patients p
  WHERE fr.patient_id = p.id AND p.source_patient_id IS NOT NULL;

UPDATE accounting_entries ae
  SET patient_id = p.source_patient_id
  FROM patients p
  WHERE ae.patient_id = p.id AND p.source_patient_id IS NOT NULL;

UPDATE receivable_allocations ra
  SET patient_id = p.source_patient_id
  FROM patients p
  WHERE ra.patient_id = p.id AND p.source_patient_id IS NOT NULL;

UPDATE session_credits sc
  SET patient_id = p.source_patient_id
  FROM patients p
  WHERE sc.patient_id = p.id AND p.source_patient_id IS NOT NULL;

UPDATE patient_packages pkgs
  SET patient_id = p.source_patient_id
  FROM patients p
  WHERE pkgs.patient_id = p.id AND p.source_patient_id IS NOT NULL;

UPDATE patient_wallet pw
  SET patient_id = p.source_patient_id
  FROM patients p
  WHERE pw.patient_id = p.id AND p.source_patient_id IS NOT NULL;

UPDATE audit_log al
  SET patient_id = p.source_patient_id
  FROM patients p
  WHERE al.patient_id = p.id AND p.source_patient_id IS NOT NULL;

-- ── Copiar notes dos patients para patient_clinics ───────────────────────────
UPDATE patient_clinics pc
  SET notes = p.notes
  FROM patients p
  WHERE pc.patient_id = p.id
    AND p.notes IS NOT NULL
    AND pc.notes IS NULL;

-- ── 4b. Criar patient_clinics para clínicas importadoras ─────────────────────
-- Vínculo: patient canônico → clínica que fez o import
INSERT INTO patient_clinics (patient_id, clinic_id, created_at)
SELECT p.source_patient_id, p.clinic_id, p.created_at
FROM   patients p
WHERE  p.source_patient_id IS NOT NULL
  AND  p.clinic_id IS NOT NULL
  AND  p.deleted_at IS NULL
ON CONFLICT (patient_id, clinic_id) DO NOTHING;

-- ── 4c. Soft-deletar registros duplicados ─────────────────────────────────────
UPDATE patients
  SET deleted_at = NOW()
  WHERE source_patient_id IS NOT NULL AND deleted_at IS NULL;

-- ── 5. Substituir unique por índice único global de CPF ───────────────────────
ALTER TABLE patients DROP CONSTRAINT IF EXISTS "patients_cpf_clinic_unique";
CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_cpf_global_unique
  ON patients(cpf) WHERE deleted_at IS NULL;

COMMIT;
