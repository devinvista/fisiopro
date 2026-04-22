
// ── Types ─────────────────────────────────────────────────────────────────────

export interface PublicProcedure {
  id: number;
  name: string;
  category: string;
  durationMinutes: number;
  price: string;
  description?: string | null;
  maxCapacity: number;
}

export interface TimeSlot {
  time: string;
  available: boolean;
  spotsLeft: number;
}

export interface PublicSchedule {
  id: number;
  name: string;
  description?: string | null;
  type: string;
  workingDays: string;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  color: string;
}

export interface BookingConfirmation {
  bookingToken: string;
  appointment: {
    id: number;
    date: string;
    startTime: string;
    endTime: string;
    status: string;
    procedure: {
      name: string;
      durationMinutes: number;
      price: string;
    };
  };
}

export interface BookingDetails {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  notes?: string | null;
  bookingToken: string;
  patient: { name: string; phone: string; email?: string | null } | null;
  procedure: { id: number; name: string; durationMinutes: number; price: string } | null;
}

export interface PatientLookupResult {
  found: boolean;
  patient?: {
    id: number;
    name: string;
    phone: string;
    email: string | null;
    cpf: string;
  };
  activeTreatmentPlan?: {
    id: number;
    objectives: string | null;
    techniques: string | null;
    frequency: string | null;
    estimatedSessions: number | null;
    status: string;
  } | null;
  activeClinicId?: number | null;
  activeClinicName?: string | null;
  recommendedProcedureIds?: number[];
}

export interface PatientFormData {
  name: string;
  phone: string;
  email: string;
  cpf: string;
  notes: string;
}
