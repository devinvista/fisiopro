-- Migration: audit_log table + recurrence_group_id for blocked_slots

-- ── audit_log table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "audit_log" (
  "id" serial PRIMARY KEY,
  "user_id" integer REFERENCES "users"("id"),
  "user_name" text,
  "patient_id" integer REFERENCES "patients"("id"),
  "action" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" integer,
  "summary" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "audit_log_patient_id_idx" ON "audit_log"("patient_id");
CREATE INDEX IF NOT EXISTS "audit_log_created_at_idx" ON "audit_log"("created_at");

-- ── blocked_slots: add recurrence_group_id ───────────────────────────────────
ALTER TABLE "blocked_slots" ADD COLUMN IF NOT EXISTS "recurrence_group_id" text;

CREATE INDEX IF NOT EXISTS "blocked_slots_recurrence_group_idx" ON "blocked_slots"("recurrence_group_id");
