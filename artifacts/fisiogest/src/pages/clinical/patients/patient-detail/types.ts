/**
 * Tipos compartilhados pelos sub-componentes da página de detalhe do paciente.
 * Mantemos aqui qualquer tipo usado em mais de um arquivo (ex.: tabs +
 * utilitários de impressão).
 */

export type PatientBasic = {
  name: string;
  cpf?: string | null;
  birthDate?: string | null;
  phone?: string | null;
};

export interface ClinicInfo {
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
  cancellationPolicyHours?: number | null;
  autoConfirmHours?: number | null;
  noShowFeeEnabled?: boolean;
  noShowFeeAmount?: string | null;
}

export interface PkgOption {
  id: number;
  name: string;
  procedureName: string;
  packageType: "sessoes" | "mensal";
  totalSessions?: number | null;
  sessionsPerWeek: number;
  validityDays?: number | null;
  price: string | number;
  monthlyPrice?: string | number | null;
  billingDay?: number | null;
  absenceCreditLimit: number;
  procedurePricePerSession: string | number;
}

export interface PlanProcedureItem {
  id: number;
  planId: number;
  packageId?: number | null;
  procedureId?: number | null;
  sessionsPerWeek: number;
  totalSessions?: number | null;
  notes?: string | null;
  packageName?: string | null;
  procedureName?: string | null;
  packageType?: string | null;
  monthlyPrice?: string | null;
  unitMonthlyPrice?: string | null;
  billingDay?: number | null;
  absenceCreditLimit?: number;
  price?: string | null;
  unitPrice?: string | null;
  discount?: string | null;
  usedSessions?: number;
}
