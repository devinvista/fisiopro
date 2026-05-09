CREATE TABLE IF NOT EXISTS "subscription_plans" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "display_name" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "price" numeric(10, 2) NOT NULL,
  "max_professionals" integer,
  "max_patients" integer,
  "max_schedules" integer,
  "max_users" integer,
  "trial_days" integer NOT NULL DEFAULT 30,
  "features" jsonb NOT NULL DEFAULT '[]',
  "is_active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "subscription_plans_name_unique" UNIQUE("name")
);

CREATE TABLE IF NOT EXISTS "clinic_subscriptions" (
  "id" serial PRIMARY KEY NOT NULL,
  "clinic_id" integer NOT NULL,
  "plan_id" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'trial',
  "trial_start_date" date,
  "trial_end_date" date,
  "current_period_start" date,
  "current_period_end" date,
  "amount" numeric(10, 2),
  "payment_status" text NOT NULL DEFAULT 'pending',
  "paid_at" timestamp,
  "cancelled_at" timestamp,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "clinic_subscriptions"
  ADD CONSTRAINT "clinic_subscriptions_clinic_id_clinics_id_fk"
  FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "clinic_subscriptions"
  ADD CONSTRAINT "clinic_subscriptions_plan_id_subscription_plans_id_fk"
  FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE restrict ON UPDATE no action;

INSERT INTO "subscription_plans" ("name", "display_name", "description", "price", "max_professionals", "max_patients", "max_schedules", "max_users", "trial_days", "features", "is_active", "sort_order")
VALUES
  ('essencial', 'Essencial', 'Para profissionais autônomos', 89.00, 1, 100, 1, 2, 30, '["1 fisioterapeuta","Até 100 pacientes","Agenda completa","Prontuários digitais","Controle financeiro básico","Suporte por e-mail"]', true, 1),
  ('profissional', 'Profissional', 'Para clínicas em crescimento', 179.00, 3, NULL, 3, 10, 30, '["Até 3 fisioterapeutas","Pacientes ilimitados","Tudo do plano Essencial","Relatórios avançados","Agendamento online","Suporte prioritário","Multi-procedimentos e pacotes"]', true, 2),
  ('premium', 'Premium', 'Para redes e franquias', 349.00, NULL, NULL, NULL, NULL, 30, '["Fisioterapeutas ilimitados","Pacientes ilimitados","Multi-clínica","Controle de acesso avançado","API e integrações","Gerente de conta dedicado","Treinamento personalizado"]', true, 3)
ON CONFLICT (name) DO NOTHING;
