import type { Section } from "./helpers";

export interface Clinic {
  id: number;
  name: string;
  type?: string | null;
  cnpj?: string | null;
  cpf?: string | null;
  crefito?: string | null;
  responsibleTechnical?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  isActive: boolean;
  createdAt: string;
  cancellationPolicyHours?: number | null;
  autoConfirmHours?: number | null;
  noShowFeeEnabled?: boolean;
  noShowFeeAmount?: string | null;
}

/** Sprint 2 — T5: configurações financeiras da clínica. */
export interface ClinicFinancialSettings {
  clinicId: number;
  monthlyExpenseBudget: number | null;
  monthlyRevenueGoal: number | null;
  cashReserveTarget: number | null;
  defaultDueDays: number;
  configured: boolean;
}

export interface SystemUser {
  id: number;
  name: string;
  cpf: string;
  email?: string | null;
  roles: string[];
  createdAt: string;
}

export interface Professional {
  id: number;
  name: string;
  email: string;
}

export interface Schedule {
  id: number;
  clinicId: number;
  name: string;
  description: string | null;
  type: string;
  professionalId: number | null;
  professional: Professional | null;
  workingDays: string;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  isActive: boolean;
  color: string;
  createdAt: string;
  updatedAt: string;
}

/* ─── Constants ─────────────────────────────────────────────── */

export interface ScheduleFormState {
  name: string;
  description: string;
  type: string;
  professionalId: string;
  workingDays: string[];
  startTime: string;
  endTime: string;
  slotDurationMinutes: string;
  color: string;
}

export interface SectionConfig {
  id: Section;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  permission: "settings.manage" | "users.manage" | null;
  /** Se preenchido, a seção só aparece para clínicas cujo plano libera a feature. */
  feature?: import("@/utils/plan-features").Feature;
}

