import type { AppointmentWithDetails } from "@workspace/api-client-react";

export type Appointment = AppointmentWithDetails;
export type ViewMode = "day" | "fullweek" | "month";

export interface BlockedSlot {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  reason?: string | null;
  scheduleId?: number | null;
  recurrenceGroupId?: string | null;
}

export interface ScheduleOption {
  id: number;
  clinicId: number;
  name: string;
  type: string;
  professionalId: number | null;
  workingDays: string;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  isActive: boolean;
  color: string;
  professional: { id: number; name: string } | null;
}

export type PositionedItem =
  | { type: "single"; appointment: Appointment; col: number; totalCols: number }
  | {
      type: "group";
      appointments: Appointment[];
      procedureId: number;
      startTime: string;
      endTime: string;
      maxCapacity: number;
      col: number;
      totalCols: number;
    };

export interface TreatmentPlan {
  id: number;
  patientId: number;
  objectives: string | null;
  techniques: string | null;
  frequency: string | null;
  estimatedSessions: number | null;
  status: string;
}

export interface PlanProcedureForAgenda {
  id: number;
  procedureId: number | null;
  procedureName: string | null;
  packageId: number | null;
  packageName: string | null;
}
