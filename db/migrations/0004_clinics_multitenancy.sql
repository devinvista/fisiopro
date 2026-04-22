-- Migration: Multi-clinic support
-- Creates the clinics table and adds clinic_id to user_roles for per-clinic role assignment

-- ── clinics table ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "clinics" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "cnpj" text,
  "phone" text,
  "email" text,
  "address" text,
  "logo_url" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- ── users: add is_super_admin ─────────────────────────────────────────────────
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_super_admin" boolean NOT NULL DEFAULT false;

-- ── user_roles: add clinic_id for per-clinic role assignment ──────────────────
ALTER TABLE "user_roles" ADD COLUMN IF NOT EXISTS "clinic_id" integer REFERENCES "clinics"("id") ON DELETE CASCADE;
