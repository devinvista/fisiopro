export interface MonthlyRevenue {
  month: number;
  monthName: string;
  revenue: number;
  expenses: number;
  profit: number;
}

export interface ProcedureRevenue {
  procedureId: number;
  procedureName: string;
  category: string;
  totalRevenue: number;
  totalSessions: number;
  averageTicket: number;
}

export interface ScheduleOccupation {
  totalSlots: number;
  occupiedSlots: number;
  occupationRate: number;
  canceledCount: number;
  noShowCount: number;
  noShowRate: number;
  activePatients: number;
  byDayOfWeek: { dayOfWeek: string; count: number }[];
}

export interface CategoryRevenue {
  category: string;
  revenue: number;
  sessions: number;
}
