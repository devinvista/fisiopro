import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const schedulesTable = pgTable("schedules", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type").notNull().default("clinic"),
  professionalId: integer("professional_id").references(() => usersTable.id),
  workingDays: text("working_days").notNull().default("1,2,3,4,5"),
  startTime: text("start_time").notNull().default("08:00"),
  endTime: text("end_time").notNull().default("18:00"),
  slotDurationMinutes: integer("slot_duration_minutes").notNull().default(30),
  isActive: boolean("is_active").notNull().default(true),
  color: text("color").notNull().default("#6366f1"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertScheduleSchema = createInsertSchema(schedulesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSchedule = z.infer<typeof insertScheduleSchema>;
export type Schedule = typeof schedulesTable.$inferSelect;
