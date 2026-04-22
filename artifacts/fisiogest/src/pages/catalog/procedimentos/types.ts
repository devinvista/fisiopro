
export interface ProcedureCost {
  priceOverride: string | null;
  monthlyPriceOverride: string | null;
  fixedCost: string;
  variableCost: string;
  notes: string | null;
}

export interface OverheadSchedule {
  name: string;
  startTime: string;
  endTime: string;
  workingDays: string;
  hoursPerDay: number;
  workingDaysInMonth: number;
  hoursInMonth: number;
}

export interface OverheadAnalysis {
  month: number;
  year: number;
  totalOverhead: number;
  schedules: OverheadSchedule[];
  totalAvailableHours: number;
  costPerHour: number;
  procedureStats: {
    procedureId: number;
    durationMinutes: number;
    fixedCostPerSession: number;
    confirmedAppointments: number;
    totalHoursUsed: number;
    fixedCostAllocatedMonthly: number;
    avgActualParticipants: number | null;
    fixedCostPerSessionReal: number;
    uniqueCompletedSessions: number;
  } | null;
}

export interface Procedure {
  id: number;
  name: string;
  category: string;
  modalidade: "individual" | "dupla" | "grupo";
  durationMinutes: number;
  price: string | number;
  cost: string | number;
  description?: string;
  maxCapacity: number;
  onlineBookingEnabled: boolean;
  isActive: boolean;
  clinicId: number | null;
  createdAt: string;
  isGlobal: boolean;
  effectivePrice: string | number;
  effectiveTotalCost: string | number;
  clinicCost: ProcedureCost | null;
}

export type ViewMode = "cards" | "list";
