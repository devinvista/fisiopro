import { z } from "zod/v4";
import {
  TREATMENT_PLAN_STATUSES,
  FINANCIAL_RECORD_TYPES,
} from "@workspace/shared-constants";

// ─── Param type aliases ────────────────────────────────────────────────────────
export type P = { patientId: string };
export type PBodyMeasurement = P & { measurementId: string };
export type PEval = { patientId: string; evaluationId: string };
export type PEvol = { patientId: string; evolutionId: string };
export type PAttach = { patientId: string; attachmentId: string };
export type PAtestado = { patientId: string; atestadoId: string };

// ─── Anamnesis ────────────────────────────────────────────────────────────────
export const anamnesisSchema = z.object({
  templateType: z.enum(["reabilitacao", "esteticaFacial", "esteticaCorporal", "pilates"]).optional().nullable(),
  // Shared fields
  mainComplaint: z.string().max(2000).optional().nullable(),
  diseaseHistory: z.string().max(5000).optional().nullable(),
  medicalHistory: z.string().max(5000).optional().nullable(),
  medications: z.string().max(2000).optional().nullable(),
  allergies: z.string().max(2000).optional().nullable(),
  familyHistory: z.string().max(2000).optional().nullable(),
  lifestyle: z.string().max(2000).optional().nullable(),
  painScale: z.number().int().min(0).max(10).optional().nullable(),
  occupation: z.string().max(500).optional().nullable(),
  laterality: z.string().max(100).optional().nullable(),
  cid10: z.string().max(200).optional().nullable(),
  painLocation: z.string().max(2000).optional().nullable(),
  painAggravatingFactors: z.string().max(2000).optional().nullable(),
  painRelievingFactors: z.string().max(2000).optional().nullable(),
  functionalImpact: z.string().max(5000).optional().nullable(),
  patientGoals: z.string().max(2000).optional().nullable(),
  previousTreatments: z.string().max(5000).optional().nullable(),
  tobaccoAlcohol: z.string().max(2000).optional().nullable(),
  // Estética Facial fields
  phototype: z.string().max(100).optional().nullable(),
  skinType: z.string().max(100).optional().nullable(),
  skinConditions: z.string().max(2000).optional().nullable(),
  sunExposure: z.string().max(100).optional().nullable(),
  sunProtector: z.string().max(100).optional().nullable(),
  currentSkincareRoutine: z.string().max(2000).optional().nullable(),
  previousAestheticTreatments: z.string().max(2000).optional().nullable(),
  aestheticReactions: z.string().max(2000).optional().nullable(),
  facialSurgeries: z.string().max(2000).optional().nullable(),
  sensitizingMedications: z.string().max(2000).optional().nullable(),
  skinContraindications: z.string().max(2000).optional().nullable(),
  aestheticGoalDetails: z.string().max(2000).optional().nullable(),
  // Estética Corporal fields
  mainBodyConcern: z.string().max(2000).optional().nullable(),
  bodyConcernRegions: z.string().max(2000).optional().nullable(),
  celluliteGrade: z.string().max(100).optional().nullable(),
  bodyWeight: z.string().max(50).optional().nullable(),
  bodyHeight: z.string().max(50).optional().nullable(),
  bodyMeasurements: z.string().max(2000).optional().nullable(),
  physicalActivityLevel: z.string().max(100).optional().nullable(),
  physicalActivityType: z.string().max(500).optional().nullable(),
  waterIntake: z.string().max(100).optional().nullable(),
  dietHabits: z.string().max(2000).optional().nullable(),
  bodyMedicalConditions: z.string().max(2000).optional().nullable(),
  bodyContraindications: z.string().max(2000).optional().nullable(),
  previousBodyTreatments: z.string().max(2000).optional().nullable(),
  // Pilates fields
  pilatesExperience: z.string().max(500).optional().nullable(),
  pilatesGoals: z.string().max(2000).optional().nullable(),
  posturalAlterations: z.string().max(2000).optional().nullable(),
  pregnancyStatus: z.string().max(200).optional().nullable(),
  previousInjuries: z.string().max(2000).optional().nullable(),
  mobilityRestrictions: z.string().max(2000).optional().nullable(),
  respiratoryConditions: z.string().max(2000).optional().nullable(),
});

// ─── Evaluation ───────────────────────────────────────────────────────────────
export const evaluationSchema = z.object({
  inspection: z.string().max(5000).optional().nullable(),
  posture: z.string().max(5000).optional().nullable(),
  rangeOfMotion: z.string().max(5000).optional().nullable(),
  muscleStrength: z.string().max(5000).optional().nullable(),
  orthopedicTests: z.string().max(5000).optional().nullable(),
  functionalDiagnosis: z.string().max(5000).optional().nullable(),
  painScale: z.number().int().min(0).max(10).optional().nullable(),
  palpation: z.string().max(5000).optional().nullable(),
  gait: z.string().max(5000).optional().nullable(),
  functionalTests: z.string().max(5000).optional().nullable(),
});

// ─── Treatment Plan ───────────────────────────────────────────────────────────
export const treatmentPlanStatusEnum = z.enum(TREATMENT_PLAN_STATUSES);

export const createTreatmentPlanSchema = z.object({
  objectives: z.string().max(5000).optional().nullable(),
  techniques: z.string().max(5000).optional().nullable(),
  frequency: z.string().max(500).optional().nullable(),
  estimatedSessions: z.number().int().positive().optional().nullable(),
  status: treatmentPlanStatusEnum.default("ativo"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate deve estar no formato YYYY-MM-DD").optional().nullable(),
  durationMonths: z.number().int().min(1).max(60).optional().nullable(),
  responsibleProfessional: z.string().max(200).optional().nullable(),
  // ── Sprint 1 — Política de crédito (override do pacote) ─────────────────
  paymentMode: z.enum(["prepago", "postpago"]).optional().nullable(),
  monthlyCreditValidityDays: z.number().int().min(0).max(365).optional().nullable(),
  replacementCreditValidityDays: z.number().int().min(1).max(365).optional().nullable(),
  // ── Sprint 4 — Modo de cobrança de itens avulsos ────────────────────────
  avulsoBillingMode: z.enum(["porSessao", "mensalConsolidado"]).optional(),
  avulsoBillingDay: z.number().int().min(1).max(28).optional().nullable(),
});

export const updateTreatmentPlanSchema = createTreatmentPlanSchema.partial();

// ─── Evolution ────────────────────────────────────────────────────────────────
export const createEvolutionSchema = z.object({
  appointmentId: z.number().int().positive().optional().nullable(),
  description: z.string().min(1, "Descrição é obrigatória").max(10000),
  patientResponse: z.string().max(5000).optional().nullable(),
  clinicalNotes: z.string().max(5000).optional().nullable(),
  complications: z.string().max(5000).optional().nullable(),
  painScale: z.number().int().min(0).max(10).optional().nullable(),
  sessionDuration: z.number().int().min(1).max(480).optional().nullable(),
  techniquesUsed: z.string().max(5000).optional().nullable(),
  homeExercises: z.string().max(5000).optional().nullable(),
  nextSessionGoals: z.string().max(5000).optional().nullable(),
});

export const updateEvolutionSchema = createEvolutionSchema.partial().extend({
  description: z.string().min(1, "Descrição é obrigatória").max(10000).optional(),
});

// ─── Discharge Summary ────────────────────────────────────────────────────────
export const dischargeSummarySchema = z.object({
  dischargeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dischargeDate deve estar no formato YYYY-MM-DD").optional().nullable(),
  dischargeReason: z.string().max(2000).optional().nullable(),
  achievedResults: z.string().max(5000).optional().nullable(),
  recommendations: z.string().max(5000).optional().nullable(),
});

// ─── Patient Financial (within prontuário context) ────────────────────────────
export const patientFinancialSchema = z.object({
  type: z.enum(FINANCIAL_RECORD_TYPES, { error: "type deve ser 'receita' ou 'despesa'" }),
  amount: z.union([z.number(), z.string()]).transform(Number).refine(v => !isNaN(v) && v > 0, { message: "amount deve ser um número maior que zero" }),
  description: z.string().min(1, "description é obrigatória").max(500),
  category: z.string().max(100).optional().nullable(),
});

// ─── Body Measurement ─────────────────────────────────────────────────────────
export const bodyMeasurementSchema = z.object({
  measuredAt: z.string().optional().nullable(),
  weight: z.number().positive().optional().nullable(),
  height: z.number().positive().optional().nullable(),
  waist: z.number().positive().optional().nullable(),
  abdomen: z.number().positive().optional().nullable(),
  hips: z.number().positive().optional().nullable(),
  thighRight: z.number().positive().optional().nullable(),
  thighLeft: z.number().positive().optional().nullable(),
  armRight: z.number().positive().optional().nullable(),
  armLeft: z.number().positive().optional().nullable(),
  calfRight: z.number().positive().optional().nullable(),
  calfLeft: z.number().positive().optional().nullable(),
  bodyFat: z.number().min(0).max(100).optional().nullable(),
  celluliteGrade: z.string().max(20).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});
