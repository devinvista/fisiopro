-- Migration: add Pilates template fields to anamnesis
-- Adds Pilates-specific columns. The templateType remains a free-form text
-- field at the DB level, with valid values enforced by the Zod layer:
-- "reabilitacao" | "esteticaFacial" | "esteticaCorporal" | "pilates".

ALTER TABLE "anamnesis" ADD COLUMN IF NOT EXISTS "pilates_experience" text;
ALTER TABLE "anamnesis" ADD COLUMN IF NOT EXISTS "pilates_goals" text;
ALTER TABLE "anamnesis" ADD COLUMN IF NOT EXISTS "postural_alterations" text;
ALTER TABLE "anamnesis" ADD COLUMN IF NOT EXISTS "pregnancy_status" text;
ALTER TABLE "anamnesis" ADD COLUMN IF NOT EXISTS "previous_injuries" text;
ALTER TABLE "anamnesis" ADD COLUMN IF NOT EXISTS "mobility_restrictions" text;
ALTER TABLE "anamnesis" ADD COLUMN IF NOT EXISTS "respiratory_conditions" text;
