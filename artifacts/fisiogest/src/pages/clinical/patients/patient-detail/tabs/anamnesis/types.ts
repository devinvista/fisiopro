export type ExamAttachment = {
  id: number;
  patientId: number;
  examTitle: string | null;
  originalFilename: string | null;
  contentType: string | null;
  fileSize: number | null;
  objectPath: string | null;
  description: string | null;
  resultText: string | null;
  uploadedAt: string;
};

export type AnamTemplate = "reabilitacao" | "esteticaFacial" | "esteticaCorporal" | "pilates";

/**
 * AnamnesisForm — espelha 1:1 as colunas reais da tabela `anamnesis`
 * (lib/db/src/schema/medical-records.ts). Todos os campos são `string`
 * (a UI grava texto livre; conversão acontece apenas no painScale).
 */
export type AnamnesisForm = {
  // ── Compartilhados ──
  mainComplaint: string;
  diseaseHistory: string;
  medicalHistory: string;
  medications: string;
  allergies: string;
  familyHistory: string;
  lifestyle: string;
  occupation: string;
  laterality: string;
  cid10: string;
  painLocation: string;
  painAggravatingFactors: string;
  painRelievingFactors: string;
  functionalImpact: string;
  patientGoals: string;
  previousTreatments: string;
  tobaccoAlcohol: string;

  // ── Estética Facial ──
  phototype: string;
  skinType: string;
  skinConditions: string;
  sunExposure: string;
  sunProtector: string;
  currentSkincareRoutine: string;
  previousAestheticTreatments: string;
  aestheticReactions: string;
  facialSurgeries: string;
  sensitizingMedications: string;
  skinContraindications: string;
  aestheticGoalDetails: string;

  // ── Estética Corporal ──
  mainBodyConcern: string;
  bodyConcernRegions: string;
  celluliteGrade: string;
  bodyWeight: string;
  bodyHeight: string;
  bodyMeasurements: string;
  physicalActivityLevel: string;
  physicalActivityType: string;
  waterIntake: string;
  dietHabits: string;
  bodyMedicalConditions: string;
  bodyContraindications: string;
  previousBodyTreatments: string;

  // ── Pilates ──
  pilatesExperience: string;
  pilatesGoals: string;
  posturalAlterations: string;
  pregnancyStatus: string;
  previousInjuries: string;
  mobilityRestrictions: string;
  respiratoryConditions: string;
};
