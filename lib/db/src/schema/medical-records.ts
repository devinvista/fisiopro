import { pgTable, serial, integer, text, timestamp, date, numeric, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { patientsTable } from "./patients";
import { clinicsTable } from "./clinics";
import { appointmentsTable } from "./appointments";

export const anamnesisTable = pgTable("anamnesis", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id),

  // Template selector — one record per (patient, templateType)
  templateType: text("template_type").notNull().default("reabilitacao"),

  // ── Shared fields (all templates) ──
  mainComplaint: text("main_complaint"),
  diseaseHistory: text("disease_history"),
  medicalHistory: text("medical_history"),
  medications: text("medications"),
  allergies: text("allergies"),
  familyHistory: text("family_history"),
  lifestyle: text("lifestyle"),
  painScale: integer("pain_scale"),
  occupation: text("occupation"),
  laterality: text("laterality"),
  cid10: text("cid10"),
  painLocation: text("pain_location"),
  painAggravatingFactors: text("pain_aggravating_factors"),
  painRelievingFactors: text("pain_relieving_factors"),
  functionalImpact: text("functional_impact"),
  patientGoals: text("patient_goals"),
  previousTreatments: text("previous_treatments"),
  tobaccoAlcohol: text("tobacco_alcohol"),

  // ── Estética Facial fields ──
  phototype: text("phototype"),
  skinType: text("skin_type"),
  skinConditions: text("skin_conditions"),
  sunExposure: text("sun_exposure"),
  sunProtector: text("sun_protector"),
  currentSkincareRoutine: text("current_skincare_routine"),
  previousAestheticTreatments: text("previous_aesthetic_treatments"),
  aestheticReactions: text("aesthetic_reactions"),
  facialSurgeries: text("facial_surgeries"),
  sensitizingMedications: text("sensitizing_medications"),
  skinContraindications: text("skin_contraindications"),
  aestheticGoalDetails: text("aesthetic_goal_details"),

  // ── Estética Corporal fields ──
  mainBodyConcern: text("main_body_concern"),
  bodyConcernRegions: text("body_concern_regions"),
  celluliteGrade: text("cellulite_grade"),
  bodyWeight: text("body_weight"),
  bodyHeight: text("body_height"),
  bodyMeasurements: text("body_measurements"),
  physicalActivityLevel: text("physical_activity_level"),
  physicalActivityType: text("physical_activity_type"),
  waterIntake: text("water_intake"),
  dietHabits: text("diet_habits"),
  bodyMedicalConditions: text("body_medical_conditions"),
  bodyContraindications: text("body_contraindications"),
  previousBodyTreatments: text("previous_body_treatments"),

  // ── Pilates fields ──
  pilatesExperience: text("pilates_experience"),
  pilatesGoals: text("pilates_goals"),
  posturalAlterations: text("postural_alterations"),
  pregnancyStatus: text("pregnancy_status"),
  previousInjuries: text("previous_injuries"),
  mobilityRestrictions: text("mobility_restrictions"),
  respiratoryConditions: text("respiratory_conditions"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("uniq_anamnesis_patient_template").on(table.patientId, table.templateType),
  index("idx_anamnesis_patient_id").on(table.patientId),
]);

export const insertAnamnesisSchema = createInsertSchema(anamnesisTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAnamnesis = z.infer<typeof insertAnamnesisSchema>;
export type Anamnesis = typeof anamnesisTable.$inferSelect;

export const evaluationsTable = pgTable("evaluations", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id),
  inspection: text("inspection"),
  posture: text("posture"),
  rangeOfMotion: text("range_of_motion"),
  muscleStrength: text("muscle_strength"),
  orthopedicTests: text("orthopedic_tests"),
  functionalDiagnosis: text("functional_diagnosis"),
  painScale: integer("pain_scale"),
  palpation: text("palpation"),
  gait: text("gait"),
  functionalTests: text("functional_tests"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertEvaluationSchema = createInsertSchema(evaluationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEvaluation = z.infer<typeof insertEvaluationSchema>;
export type Evaluation = typeof evaluationsTable.$inferSelect;

export const treatmentPlansTable = pgTable("treatment_plans", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id),
  clinicId: integer("clinic_id").references(() => clinicsTable.id),
  objectives: text("objectives"),
  techniques: text("techniques"),
  frequency: text("frequency"),
  estimatedSessions: integer("estimated_sessions"),
  startDate: date("start_date"),
  // Prazo do plano em meses (1, 2, 3, 6, 12, 24, 36...). Usado para
  // materializar antecipadamente todas as consultas e faturas mensais.
  durationMonths: integer("duration_months"),
  // Data calculada de término (startDate + durationMonths). Persistida para
  // consultas rápidas em relatórios e janela de materialização.
  endDate: date("end_date"),
  // Timestamp do momento em que o plano foi materializado (consultas e
  // faturas geradas). Idempotência: se preenchido, não materializa de novo.
  materializedAt: timestamp("materialized_at"),
  responsibleProfessional: text("responsible_professional"),
  // Status do plano. Domínio aceito pelo backend:
  //   - "ativo"      : sinônimo histórico de "vigente" (mantido para compat).
  //   - "rascunho"   : recém-criado, ainda não aceito pelo paciente.
  //   - "vigente"    : aceito e em execução (novo nome após Sprint 2).
  //   - "encerrado"  : finalizado normalmente (substitui "concluido" gradualmente).
  //   - "concluido"  : alias legado de "encerrado".
  //   - "cancelado"  : cancelado antes/depois do aceite.
  status: text("status").notNull().default("ativo"),
  // Sprint 2 — aceite formal do plano (vira "venda"):
  // após aceito, alterar preço/itens passa a exigir renegociação (versionar via parent_plan_id).
  acceptedAt: timestamp("accepted_at"),
  acceptedBy: integer("accepted_by"),
  // ── Sprint 2 — Trilha LGPD do aceite ────────────────────────────────────
  // Nome digitado pelo paciente como "assinatura" (exigência probatória LGPD).
  acceptedBySignature: text("accepted_by_signature"),
  // IP do dispositivo no momento do aceite (presencial = IP do front da clínica).
  acceptedIp: text("accepted_ip"),
  // User-Agent do dispositivo (truncado em 500 chars no service).
  acceptedDevice: text("accepted_device"),
  // Canal pelo qual o aceite foi coletado: "presencial" | "link" | "legado".
  acceptedVia: text("accepted_via"),
  // Snapshot dos preços vigentes no momento do aceite, para auditoria fiscal.
  // Estrutura: [{ procedureId, packageId, unitPrice, discount, totalSessions, snapshotPrice }]
  frozenPricesJson: text("frozen_prices_json"),
  // Quando o plano é renegociado, o novo plano referencia o anterior aqui.
  parentPlanId: integer("parent_plan_id"),
  // ── Política de crédito (override do pacote) ────────────────────────────
  // Modo de pagamento das faturas mensais: "prepago" | "postpago" | null
  // (herda do pacote). Postpago = créditos disponíveis imediatamente;
  // prepago = só ficam disponíveis após pagamento da fatura do mês.
  paymentMode: text("payment_mode"),
  // Override da validade do crédito mensal e de reposição (em dias). Se
  // null, herda do pacote. Mensal = dias após o fim do mês de competência.
  monthlyCreditValidityDays: integer("monthly_credit_validity_days"),
  replacementCreditValidityDays: integer("replacement_credit_validity_days"),
  // ── Sprint 4 — Fechamento mensal de itens avulsos ───────────────────────
  // Modo de cobrança dos itens NÃO mensais (porSessao | mensalConsolidado).
  // Quando `mensalConsolidado`, sessões avulsas geram lançamentos
  // `creditoAReceber` que serão consolidados em `faturaMensalAvulso` no
  // fechamento do mês (manual via endpoint ou automático via job).
  avulsoBillingMode: text("avulso_billing_mode").notNull().default("porSessao"),
  // Dia de vencimento da fatura consolidada de avulsos (1..28). Null = usa
  // o dia configurado no pacote ou padrão da clínica.
  avulsoBillingDay: integer("avulso_billing_day"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_treatment_plans_patient_id").on(table.patientId),
  index("idx_treatment_plans_clinic_id").on(table.clinicId),
  index("idx_treatment_plans_parent").on(table.parentPlanId),
]);

export const insertTreatmentPlanSchema = createInsertSchema(treatmentPlansTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTreatmentPlan = z.infer<typeof insertTreatmentPlanSchema>;
export type TreatmentPlan = typeof treatmentPlansTable.$inferSelect;

export const treatmentPlanProceduresTable = pgTable("treatment_plan_procedures", {
  id: serial("id").primaryKey(),
  treatmentPlanId: integer("treatment_plan_id").notNull().references(() => treatmentPlansTable.id, { onDelete: "cascade" }),
  procedureId: integer("procedure_id"),
  packageId: integer("package_id"),
  // ── Sprint 2 — Tipo do item do plano ───────────────────────────────────────
  // Domínio: "recorrenteMensal" | "pacoteSessoes" | "avulso".
  // Quando NULL, o backend deriva o kind a partir dos campos legados:
  //   - packageId set + packageType='mensal'   → recorrenteMensal
  //   - packageId set + packageType='sessoes'  → pacoteSessoes
  //   - sem packageId                          → avulso
  // Nota: a renomeação física para `treatment_plan_items` foi adiada — manter
  // o nome `treatment_plan_procedures` evita migration destrutiva. A renomeação
  // de tabela vira opcional no Sprint 6 quando todas as referências usarem `kind`.
  kind: text("kind"),
  sessionsPerWeek: integer("sessions_per_week").notNull().default(1),
  totalSessions: integer("total_sessions"),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }),
  unitMonthlyPrice: numeric("unit_monthly_price", { precision: 10, scale: 2 }),
  discount: numeric("discount", { precision: 10, scale: 2 }).default("0"),
  // ── Materialização (refator pós-sprint financeiro) ────────────────────────
  // Para itens recorrentes (pacote mensal), define os dias da semana em que
  // as consultas serão agendadas. Strings em inglês minúscula (compat com
  // Date.toLocaleString): monday|tuesday|wednesday|thursday|friday|saturday|sunday.
  // Persistido como JSON simples para flexibilidade — array vazio = não materializado.
  weekDays: text("week_days"),
  // Horário padrão das consultas materializadas ("HH:MM").
  defaultStartTime: text("default_start_time"),
  // Profissional padrão das consultas materializadas (FK lógica para users.id).
  defaultProfessionalId: integer("default_professional_id"),
  // Duração de cada sessão em minutos (define endTime). Default 60.
  sessionDurationMinutes: integer("session_duration_minutes"),
  priority: integer("priority").notNull().default(1),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTreatmentPlanProcedureSchema = createInsertSchema(treatmentPlanProceduresTable).omit({ id: true, createdAt: true });
export type InsertTreatmentPlanProcedure = z.infer<typeof insertTreatmentPlanProcedureSchema>;
export type TreatmentPlanProcedure = typeof treatmentPlanProceduresTable.$inferSelect;

export const evolutionsTable = pgTable("evolutions", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id),
  appointmentId: integer("appointment_id").references(() => appointmentsTable.id),
  description: text("description"),
  patientResponse: text("patient_response"),
  clinicalNotes: text("clinical_notes"),
  complications: text("complications"),
  painScale: integer("pain_scale"),
  sessionDuration: integer("session_duration"),
  techniquesUsed: text("techniques_used"),
  homeExercises: text("home_exercises"),
  nextSessionGoals: text("next_session_goals"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertEvolutionSchema = createInsertSchema(evolutionsTable).omit({ id: true, createdAt: true });
export type InsertEvolution = z.infer<typeof insertEvolutionSchema>;
export type Evolution = typeof evolutionsTable.$inferSelect;

export const dischargeSummariesTable = pgTable("discharge_summaries", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().unique().references(() => patientsTable.id),
  dischargeDate: date("discharge_date").notNull(),
  dischargeReason: text("discharge_reason").notNull(),
  achievedResults: text("achieved_results"),
  recommendations: text("recommendations"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertDischargeSummarySchema = createInsertSchema(dischargeSummariesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDischargeSummary = z.infer<typeof insertDischargeSummarySchema>;
export type DischargeSummary = typeof dischargeSummariesTable.$inferSelect;

export const examAttachmentsTable = pgTable("exam_attachments", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id, { onDelete: "cascade" }),
  examTitle: text("exam_title"),
  originalFilename: text("original_filename"),
  contentType: text("content_type"),
  fileSize: integer("file_size"),
  objectPath: text("object_path"),
  description: text("description"),
  resultText: text("result_text"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export const insertExamAttachmentSchema = createInsertSchema(examAttachmentsTable).omit({ id: true, uploadedAt: true });
export type InsertExamAttachment = z.infer<typeof insertExamAttachmentSchema>;
export type ExamAttachment = typeof examAttachmentsTable.$inferSelect;

export const atestadosTable = pgTable("atestados", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  professionalName: text("professional_name").notNull(),
  professionalSpecialty: text("professional_specialty"),
  professionalCouncil: text("professional_council"),
  content: text("content").notNull(),
  cid: text("cid"),
  daysOff: integer("days_off"),
  issuedAt: timestamp("issued_at").defaultNow().notNull(),
});

export type Atestado = typeof atestadosTable.$inferSelect;

// ─── Body Measurements — série temporal de medidas corporais ─────────────────
export const bodyMeasurementsTable = pgTable("body_measurements", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id),
  clinicId: integer("clinic_id"),
  measuredAt: timestamp("measured_at").defaultNow().notNull(),

  // Biometria
  weight: numeric("weight", { precision: 5, scale: 2 }),      // kg
  height: numeric("height", { precision: 5, scale: 2 }),      // cm

  // Perimetria corporal (cm)
  waist: numeric("waist", { precision: 5, scale: 2 }),        // cintura
  abdomen: numeric("abdomen", { precision: 5, scale: 2 }),    // abdômen
  hips: numeric("hips", { precision: 5, scale: 2 }),          // quadril
  thighRight: numeric("thigh_right", { precision: 5, scale: 2 }),    // coxa D
  thighLeft: numeric("thigh_left", { precision: 5, scale: 2 }),      // coxa E
  armRight: numeric("arm_right", { precision: 5, scale: 2 }),        // braço D
  armLeft: numeric("arm_left", { precision: 5, scale: 2 }),          // braço E
  calfRight: numeric("calf_right", { precision: 5, scale: 2 }),      // panturrilha D
  calfLeft: numeric("calf_left", { precision: 5, scale: 2 }),        // panturrilha E

  // Composição e qualidade
  bodyFat: numeric("body_fat", { precision: 4, scale: 2 }),   // % gordura corporal
  celluliteGrade: text("cellulite_grade"),                    // I, II, III, IV
  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_body_meas_patient_id").on(table.patientId),
  index("idx_body_meas_measured_at").on(table.measuredAt),
]);

export type BodyMeasurement = typeof bodyMeasurementsTable.$inferSelect;

// ─── Patient Photos — acompanhamento fotográfico evolutivo ────────────────────
export const patientPhotosTable = pgTable("patient_photos", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id, { onDelete: "cascade" }),
  clinicId: integer("clinic_id"),

  // Identification
  takenAt: timestamp("taken_at").defaultNow().notNull(),  // data da sessão fotográfica
  viewType: text("view_type").notNull(),  // frontal | lateral_d | lateral_e | posterior | detalhe
  sessionLabel: text("session_label"),   // rótulo livre (ex: "1ª Avaliação", "Mês 2")

  // Link to appointment
  appointmentId: integer("appointment_id"),

  // Storage
  objectPath: text("object_path").notNull(),
  originalFilename: text("original_filename"),
  contentType: text("content_type"),
  fileSize: integer("file_size"),

  // Notes
  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_patient_photos_patient_id").on(table.patientId),
  index("idx_patient_photos_taken_at").on(table.takenAt),
]);

export const insertPatientPhotoSchema = createInsertSchema(patientPhotosTable).omit({ id: true, createdAt: true });
export type InsertPatientPhoto = z.infer<typeof insertPatientPhotoSchema>;
export type PatientPhoto = typeof patientPhotosTable.$inferSelect;

// ─── Sprint 2 — Tokens de aceite público de plano de tratamento ─────────────
//
// Permite gerar um link de aceite (válido por N dias) para que o paciente
// revise e aceite o plano remotamente. O token é consumido (`usedAt`) na
// primeira aceitação bem-sucedida e bloqueia novos usos.
export const treatmentPlanAcceptanceTokensTable = pgTable("treatment_plan_acceptance_tokens", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").notNull().references(() => treatmentPlansTable.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_tp_accept_tokens_plan_id").on(table.planId),
  index("idx_tp_accept_tokens_expires_at").on(table.expiresAt),
]);

export const insertTreatmentPlanAcceptanceTokenSchema = createInsertSchema(treatmentPlanAcceptanceTokensTable).omit({ id: true, createdAt: true });
export type InsertTreatmentPlanAcceptanceToken = z.infer<typeof insertTreatmentPlanAcceptanceTokenSchema>;
export type TreatmentPlanAcceptanceToken = typeof treatmentPlanAcceptanceTokensTable.$inferSelect;
