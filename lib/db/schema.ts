import { pgTable, serial, text, date, timestamp } from "drizzle-orm/pg-core"

export const patients = pgTable("patients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  birthDate: date("birth_date").notNull(),
  concern: text("concern").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export type Patient = typeof patients.$inferSelect
export type NewPatient = typeof patients.$inferInsert
