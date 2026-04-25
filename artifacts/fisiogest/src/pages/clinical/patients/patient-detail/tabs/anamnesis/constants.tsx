import React from "react";
import { Stethoscope, Sparkles, Leaf, Dumbbell } from "lucide-react";
import { AnamTemplate, AnamnesisForm } from "./types";

export const ACCEPTED_MIME = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

/**
 * Templates de anamnese disponíveis. Cada template está vinculado a uma
 * categoria de procedimento (`Reabilitação`, `Estética`, `Pilates`).
 * Apenas templates cujas categorias estão ativas na clínica aparecem na UI.
 */
export const TEMPLATE_OPTIONS: {
  value: AnamTemplate;
  label: string;
  desc: string;
  color: string;
  icon: React.ReactNode;
  /** Categoria de procedimento que habilita este template */
  procedureCategory: "Reabilitação" | "Estética" | "Pilates";
}[] = [
  {
    value: "reabilitacao",
    label: "Reabilitação",
    desc: "Fisioterapia, ortopedia, neurologia e pós-cirúrgico",
    color: "blue",
    icon: <Stethoscope className="w-4 h-4" />,
    procedureCategory: "Reabilitação",
  },
  {
    value: "esteticaFacial",
    label: "Estética Facial",
    desc: "Pele, tratamentos faciais e procedimentos estéticos",
    color: "rose",
    icon: <Sparkles className="w-4 h-4" />,
    procedureCategory: "Estética",
  },
  {
    value: "esteticaCorporal",
    label: "Estética Corporal",
    desc: "Modelagem, celulite, gordura localizada e flacidez",
    color: "violet",
    icon: <Leaf className="w-4 h-4" />,
    procedureCategory: "Estética",
  },
  {
    value: "pilates",
    label: "Pilates",
    desc: "Avaliação postural, mobilidade e objetivos no pilates",
    color: "teal",
    icon: <Dumbbell className="w-4 h-4" />,
    procedureCategory: "Pilates",
  },
];

export const emptyForm: AnamnesisForm = {
  // Compartilhados
  mainComplaint: "",
  diseaseHistory: "",
  medicalHistory: "",
  medications: "",
  allergies: "",
  familyHistory: "",
  lifestyle: "",
  occupation: "",
  laterality: "",
  cid10: "",
  painLocation: "",
  painAggravatingFactors: "",
  painRelievingFactors: "",
  functionalImpact: "",
  patientGoals: "",
  previousTreatments: "",
  tobaccoAlcohol: "",

  // Estética Facial
  phototype: "",
  skinType: "",
  skinConditions: "",
  sunExposure: "",
  sunProtector: "",
  currentSkincareRoutine: "",
  previousAestheticTreatments: "",
  aestheticReactions: "",
  facialSurgeries: "",
  sensitizingMedications: "",
  skinContraindications: "",
  aestheticGoalDetails: "",

  // Estética Corporal
  mainBodyConcern: "",
  bodyConcernRegions: "",
  celluliteGrade: "",
  bodyWeight: "",
  bodyHeight: "",
  bodyMeasurements: "",
  physicalActivityLevel: "",
  physicalActivityType: "",
  waterIntake: "",
  dietHabits: "",
  bodyMedicalConditions: "",
  bodyContraindications: "",
  previousBodyTreatments: "",

  // Pilates
  pilatesExperience: "",
  pilatesGoals: "",
  posturalAlterations: "",
  pregnancyStatus: "",
  previousInjuries: "",
  mobilityRestrictions: "",
  respiratoryConditions: "",
};
