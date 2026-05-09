-- Migration: full schema sync
-- Adds all columns and tables missing from the initial migration

-- ── users: drop legacy role column, add clinic_id ──────────────────────────
ALTER TABLE "users" DROP COLUMN IF EXISTS "role";
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "clinic_id" integer;

-- ── patients: add clinic_id ─────────────────────────────────────────────────
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "clinic_id" integer;

-- ── procedures: add billing and booking columns ─────────────────────────────
ALTER TABLE "procedures" ADD COLUMN IF NOT EXISTS "online_booking_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "procedures" ADD COLUMN IF NOT EXISTS "billing_type" text NOT NULL DEFAULT 'por_sessao';
ALTER TABLE "procedures" ADD COLUMN IF NOT EXISTS "monthly_price" numeric(10, 2);
ALTER TABLE "procedures" ADD COLUMN IF NOT EXISTS "billing_day" integer;
ALTER TABLE "procedures" ADD COLUMN IF NOT EXISTS "clinic_id" integer;

-- ── appointments: add professional, recurrence, booking and source columns ──
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "professional_id" integer;
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "clinic_id" integer;
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "recurrence_group_id" text;
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "recurrence_index" integer;
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "booking_token" text;
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'presencial';
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_procedure_id_procedures_id_fk" FOREIGN KEY ("procedure_id") REFERENCES "procedures"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_professional_id_users_id_fk" FOREIGN KEY ("professional_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;

-- ── financial_records: add payment and subscription columns ─────────────────
ALTER TABLE "financial_records" ADD COLUMN IF NOT EXISTS "payment_date" date;
ALTER TABLE "financial_records" ADD COLUMN IF NOT EXISTS "payment_method" text;
ALTER TABLE "financial_records" ADD COLUMN IF NOT EXISTS "transaction_type" text;
ALTER TABLE "financial_records" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'pendente';
ALTER TABLE "financial_records" ADD COLUMN IF NOT EXISTS "due_date" date;
ALTER TABLE "financial_records" ADD COLUMN IF NOT EXISTS "subscription_id" integer;

-- ── exam_attachments ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "exam_attachments" (
  "id" serial PRIMARY KEY NOT NULL,
  "patient_id" integer NOT NULL,
  "exam_title" text,
  "original_filename" text,
  "content_type" text,
  "file_size" integer,
  "object_path" text,
  "description" text,
  "result_text" text,
  "uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exam_attachments" ADD CONSTRAINT "exam_attachments_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE cascade ON UPDATE no action;

-- ── atestados ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "atestados" (
  "id" serial PRIMARY KEY NOT NULL,
  "patient_id" integer NOT NULL,
  "type" text NOT NULL,
  "professional_name" text NOT NULL,
  "professional_specialty" text,
  "professional_council" text,
  "content" text NOT NULL,
  "cid" text,
  "days_off" integer,
  "issued_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "atestados" ADD CONSTRAINT "atestados_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE cascade ON UPDATE no action;

-- ── blocked_slots ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "blocked_slots" (
  "id" serial PRIMARY KEY NOT NULL,
  "date" text NOT NULL,
  "start_time" text NOT NULL,
  "end_time" text NOT NULL,
  "reason" text,
  "user_id" integer,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blocked_slots" ADD CONSTRAINT "blocked_slots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;

-- ── session_credits ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "session_credits" (
  "id" serial PRIMARY KEY NOT NULL,
  "patient_id" integer NOT NULL,
  "procedure_id" integer NOT NULL,
  "quantity" integer NOT NULL DEFAULT 1,
  "used_quantity" integer NOT NULL DEFAULT 0,
  "source_appointment_id" integer,
  "clinic_id" integer,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session_credits" ADD CONSTRAINT "session_credits_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "session_credits" ADD CONSTRAINT "session_credits_procedure_id_procedures_id_fk" FOREIGN KEY ("procedure_id") REFERENCES "procedures"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "session_credits" ADD CONSTRAINT "session_credits_source_appointment_id_appointments_id_fk" FOREIGN KEY ("source_appointment_id") REFERENCES "appointments"("id") ON DELETE no action ON UPDATE no action;

-- ── patient_subscriptions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "patient_subscriptions" (
  "id" serial PRIMARY KEY NOT NULL,
  "patient_id" integer NOT NULL,
  "procedure_id" integer NOT NULL,
  "start_date" date NOT NULL,
  "billing_day" integer NOT NULL,
  "monthly_amount" numeric(10, 2) NOT NULL,
  "status" text NOT NULL DEFAULT 'ativa',
  "clinic_id" integer,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "patient_subscriptions" ADD CONSTRAINT "patient_subscriptions_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "patient_subscriptions" ADD CONSTRAINT "patient_subscriptions_procedure_id_procedures_id_fk" FOREIGN KEY ("procedure_id") REFERENCES "procedures"("id") ON DELETE no action ON UPDATE no action;
