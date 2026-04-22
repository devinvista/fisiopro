export interface EvoTemplate {
  id: string;
  name: string;
  icon: string;
  category: string;
  color: string;
  description: string;
  patientResponse: string;
  clinicalNotes: string;
  complications: string;
  chips: {
    description: string[];
    patientResponse: string[];
    clinicalNotes: string[];
    complications: string[];
  };
}

export type EvoFormState = {
  appointmentId: string | number;
  description: string;
  patientResponse: string;
  clinicalNotes: string;
  complications: string;
  painScale: number | null;
  sessionDuration: string | number;
  techniquesUsed: string;
  homeExercises: string;
  nextSessionGoals: string;
};
