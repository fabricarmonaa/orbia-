import { pgTable, serial, integer, varchar, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { tenants } from "./tenants";
import { branches } from "./branches";
import { users } from "./users";

export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  branchId: integer("branch_id").references(() => branches.id),
  title: varchar("title", { length: 220 }).notNull(),
  content: text("content"),
  remindAt: timestamp("remind_at"),
  allDay: boolean("all_day").notNull().default(false),
  showInAgenda: boolean("show_in_agenda").notNull().default(false),
  status: varchar("status", { length: 20 }).notNull().default("ACTIVA"),
  createdById: integer("created_by_id").references(() => users.id).notNull(),
  updatedById: integer("updated_by_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_notes_tenant_status").on(table.tenantId, table.status),
  index("idx_notes_tenant_remind_at").on(table.tenantId, table.remindAt),
  index("idx_notes_tenant_branch").on(table.tenantId, table.branchId),
]);

export const insertNoteSchema = createInsertSchema(notes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertNote = z.infer<typeof insertNoteSchema>;
export type Note = typeof notes.$inferSelect;
