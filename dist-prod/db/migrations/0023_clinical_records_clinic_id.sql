-- Migration 0023: Adicionar clinic_id explícito nas tabelas de registros clínicos.
-- Garante isolamento de tenant explícito sem depender implicitamente do patient_id.
-- O isolamento antes era apenas funcional (patient_id pertence à clínica); agora
-- é também declarativo e consultável via índice direto.

ALTER TABLE anamnesis          ADD COLUMN IF NOT EXISTS clinic_id INTEGER REFERENCES clinics(id);
ALTER TABLE evaluations        ADD COLUMN IF NOT EXISTS clinic_id INTEGER REFERENCES clinics(id);
ALTER TABLE evolutions         ADD COLUMN IF NOT EXISTS clinic_id INTEGER REFERENCES clinics(id);
ALTER TABLE discharge_summaries ADD COLUMN IF NOT EXISTS clinic_id INTEGER REFERENCES clinics(id);
ALTER TABLE exam_attachments   ADD COLUMN IF NOT EXISTS clinic_id INTEGER REFERENCES clinics(id);
ALTER TABLE atestados          ADD COLUMN IF NOT EXISTS clinic_id INTEGER REFERENCES clinics(id);

-- Backfill: resolve clinic_id via patients table (paciente criador do registro)
UPDATE anamnesis a
  SET clinic_id = p.clinic_id
  FROM patients p
  WHERE a.patient_id = p.id AND a.clinic_id IS NULL AND p.clinic_id IS NOT NULL;

UPDATE evaluations e
  SET clinic_id = p.clinic_id
  FROM patients p
  WHERE e.patient_id = p.id AND e.clinic_id IS NULL AND p.clinic_id IS NOT NULL;

UPDATE evolutions ev
  SET clinic_id = p.clinic_id
  FROM patients p
  WHERE ev.patient_id = p.id AND ev.clinic_id IS NULL AND p.clinic_id IS NOT NULL;

UPDATE discharge_summaries d
  SET clinic_id = p.clinic_id
  FROM patients p
  WHERE d.patient_id = p.id AND d.clinic_id IS NULL AND p.clinic_id IS NOT NULL;

UPDATE exam_attachments ea
  SET clinic_id = p.clinic_id
  FROM patients p
  WHERE ea.patient_id = p.id AND ea.clinic_id IS NULL AND p.clinic_id IS NOT NULL;

UPDATE atestados at
  SET clinic_id = p.clinic_id
  FROM patients p
  WHERE at.patient_id = p.id AND at.clinic_id IS NULL AND p.clinic_id IS NOT NULL;

-- Índices para queries de isolamento de tenant
CREATE INDEX IF NOT EXISTS idx_anamnesis_clinic_id          ON anamnesis(clinic_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_clinic_id        ON evaluations(clinic_id);
CREATE INDEX IF NOT EXISTS idx_evolutions_clinic_id         ON evolutions(clinic_id);
CREATE INDEX IF NOT EXISTS idx_discharge_summaries_clinic_id ON discharge_summaries(clinic_id);
CREATE INDEX IF NOT EXISTS idx_exam_attachments_clinic_id   ON exam_attachments(clinic_id);
CREATE INDEX IF NOT EXISTS idx_atestados_clinic_id          ON atestados(clinic_id);
