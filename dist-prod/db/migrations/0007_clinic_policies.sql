ALTER TABLE "clinics" ADD COLUMN IF NOT EXISTS "cancellation_policy_hours" integer;
ALTER TABLE "clinics" ADD COLUMN IF NOT EXISTS "auto_confirm_hours" integer;
ALTER TABLE "clinics" ADD COLUMN IF NOT EXISTS "no_show_fee_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "clinics" ADD COLUMN IF NOT EXISTS "no_show_fee_amount" text;
