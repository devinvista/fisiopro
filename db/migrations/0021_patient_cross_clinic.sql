-- Remove a constraint UNIQUE global no CPF (permitir mesmo CPF em clínicas diferentes)
ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_cpf_unique;

-- Adiciona constraint UNIQUE por (cpf, clinic_id) para evitar duplicata na mesma clínica
ALTER TABLE patients ADD CONSTRAINT patients_cpf_clinic_unique UNIQUE (cpf, clinic_id);

-- Referência ao paciente-fonte (de outra clínica que cadastrou primeiro o CPF)
ALTER TABLE patients ADD COLUMN IF NOT EXISTS source_patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL;

-- Tabela de solicitações de acesso a dados clínicos entre clínicas
CREATE TABLE IF NOT EXISTS patient_access_requests (
  id               SERIAL PRIMARY KEY,
  cpf              TEXT NOT NULL,
  requesting_clinic_id INTEGER NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  source_clinic_id     INTEGER NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
  scope            TEXT NOT NULL DEFAULT 'clinical_records',
  message          TEXT,
  responded_at     TIMESTAMP,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (cpf, requesting_clinic_id)
);

CREATE INDEX IF NOT EXISTS idx_par_cpf ON patient_access_requests(cpf);
CREATE INDEX IF NOT EXISTS idx_par_source_clinic ON patient_access_requests(source_clinic_id);
CREATE INDEX IF NOT EXISTS idx_par_requesting_clinic ON patient_access_requests(requesting_clinic_id);
