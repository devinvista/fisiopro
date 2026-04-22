import { HOUR_START, SLOT_HEIGHT } from "./constants";
import type { Appointment, PositionedItem } from "./types";

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTop(minutes: number, hourStart: number = HOUR_START): number {
  return ((minutes - hourStart * 60) / 60) * SLOT_HEIGHT;
}

export function minutesToHeight(minutes: number): number {
  return (minutes / 60) * SLOT_HEIGHT;
}

export function positionAppointments(appointments: Appointment[]): PositionedItem[] {
  if (appointments.length === 0) return [];

  // Separate group-session appointments from singles.
  // Cancelled/missed appointments in a group are shown individually.
  const groupMap = new Map<string, Appointment[]>();
  const singles: Appointment[] = [];

  for (const apt of appointments) {
    const maxCap = apt.procedure?.maxCapacity ?? 1;
    if (maxCap > 1 && !["cancelado", "faltou"].includes(apt.status)) {
      const key = `${apt.procedureId}|${apt.startTime}`;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(apt);
    } else {
      singles.push(apt);
    }
  }

  // Build a unified slot list for layout calculation.
  type Slot =
    | { kind: "single"; apt: Appointment }
    | { kind: "group"; key: string; apts: Appointment[] };

  const slots: Slot[] = [
    ...[...groupMap.entries()].map(([key, apts]) => ({ kind: "group" as const, key, apts })),
    ...singles.map((apt) => ({ kind: "single" as const, apt })),
  ];

  const getStart = (s: Slot) =>
    timeToMinutes(s.kind === "single" ? s.apt.startTime : s.apts[0].startTime);
  const getEnd = (s: Slot) =>
    timeToMinutes(s.kind === "single" ? s.apt.endTime : s.apts[0].endTime);

  slots.sort((a, b) => getStart(a) - getStart(b));

  // Overlap grouping for column layout.
  const layoutGroups: Slot[][] = [];
  let current: Slot[] = [];
  let maxEnd = 0;

  for (const slot of slots) {
    const start = getStart(slot);
    const end = getEnd(slot);
    if (current.length === 0 || start < maxEnd) {
      current.push(slot);
      maxEnd = Math.max(maxEnd, end);
    } else {
      layoutGroups.push(current);
      current = [slot];
      maxEnd = end;
    }
  }
  if (current.length > 0) layoutGroups.push(current);

  const result: PositionedItem[] = [];
  for (const group of layoutGroups) {
    const totalCols = group.length;
    group.forEach((slot, col) => {
      if (slot.kind === "single") {
        result.push({ type: "single", appointment: slot.apt, col, totalCols });
      } else {
        const first = slot.apts[0];
        result.push({
          type: "group",
          appointments: slot.apts,
          procedureId: first.procedureId,
          startTime: first.startTime,
          endTime: first.endTime,
          maxCapacity: first.procedure?.maxCapacity ?? slot.apts.length,
          col,
          totalCols,
        });
      }
    });
  }
  return result;
}
