import { pgTable, serial, integer, text, date, timestamp, index } from "drizzle-orm/pg-core";
import { appointmentsTable } from "./appointments";
import { usersTable } from "./users";

export const appointmentReschedulesTable = pgTable("appointment_reschedules", {
  id: serial("id").primaryKey(),
  appointmentId: integer("appointment_id").notNull().references(() => appointmentsTable.id, { onDelete: "cascade" }),
  fromDate: date("from_date").notNull(),
  fromStartTime: text("from_start_time").notNull(),
  fromEndTime: text("from_end_time").notNull(),
  toDate: date("to_date").notNull(),
  toStartTime: text("to_start_time").notNull(),
  toEndTime: text("to_end_time").notNull(),
  reason: text("reason"),
  rescheduledByUserId: integer("rescheduled_by_user_id").references(() => usersTable.id),
  rescheduledByUserName: text("rescheduled_by_user_name"),
  rescheduledAt: timestamp("rescheduled_at").defaultNow().notNull(),
}, (table) => [
  index("idx_appt_reschedules_appointment_id").on(table.appointmentId),
  index("idx_appt_reschedules_rescheduled_at").on(table.rescheduledAt),
]);

export type AppointmentReschedule = typeof appointmentReschedulesTable.$inferSelect;
