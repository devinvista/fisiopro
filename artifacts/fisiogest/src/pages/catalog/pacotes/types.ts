export interface Procedure {
  id: number;
  name: string;
  category: string;
  modalidade: string;
  price: string | number;
  durationMinutes: number;
  isActive: boolean;
}

export interface PackageItem {
  id: number;
  name: string;
  description?: string | null;
  procedureId: number;
  procedureName: string;
  procedureCategory: string;
  procedureModalidade: string;
  procedureDurationMinutes: number;
  procedurePricePerSession: string | number;
  packageType: "sessoes" | "mensal";
  totalSessions?: number | null;
  sessionsPerWeek: number;
  validityDays?: number | null;
  price: string | number;
  monthlyPrice?: string | number | null;
  billingDay?: number | null;
  absenceCreditLimit: number;
  isActive: boolean;
  createdAt: string;
}

export type PackageType = PackageItem["packageType"];

export interface PackageFormData {
  name: string;
  description: string;
  procedureId: string;
  packageType: PackageType;
  totalSessions: number;
  sessionsPerWeek: number;
  validityDays: number;
  price: string;
  monthlyPrice: string;
  billingDay: number;
  absenceCreditLimit: number;
}
