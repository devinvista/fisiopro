import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { schedulesTable } from "./schedules";

export const blockedSlotsTable = pgTable("blocked_slots", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  reason: text("reason"),
  recurrenceGroupId: text("recurrence_group_id"),
  userId: integer("user_id").references(() => usersTable.id),
  clinicId: integer("clinic_id"),
  scheduleId: integer("schedule_id").references(() => schedulesTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type BlockedSlot = typeof blockedSlotsTable.$inferSelect;
