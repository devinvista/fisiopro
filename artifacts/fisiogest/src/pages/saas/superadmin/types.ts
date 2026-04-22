
// ─── Types ────────────────────────────────────────────────────────────────────

export type Plan = {
  id: number;
  name: string;
  displayName: string;
  description: string;
  price: string;
  maxProfessionals: number | null;
  maxPatients: number | null;
  maxSchedules: number | null;
  maxUsers: number | null;
  trialDays: number;
  features: string[];
  isActive: boolean;
  sortOrder: number;
};

export type PlanStats = {
  planId: number;
  planName: string;
  planDisplayName: string;
  price: string;
  total: number;
  active: number;
  trial: number;
  suspended: number;
  cancelled: number;
  mrr: number;
};

export type SubRow = {
  sub: {
    id: number;
    clinicId: number;
    planId: number;
    status: string;
    trialStartDate: string | null;
    trialEndDate: string | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    amount: string | null;
    paymentStatus: string;
    paidAt: string | null;
    notes: string | null;
    createdAt: string;
  };
  clinic: { id: number; name: string; email: string | null; isActive: boolean; createdAt: string } | null;
  plan: Plan | null;
};

