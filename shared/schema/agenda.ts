import { pgTable, serial, integer, varchar, text, timestamp, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { tenants } from "./tenants";
import { branches } from "./branches";
import { users } from "./users";

export const agendaEvents = pgTable("agenda_events", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  branchId: integer("branch_id").references(() => branches.id),
  title: varchar("title", { length: 220 }).notNull(),
  description: text("description"),
  eventType: varchar("event_type", { length: 40 }).notNull().default("MANUAL"),
  sourceEntityType: varchar("source_entity_type", { length: 40 }),
  sourceEntityId: integer("source_entity_id"),
  sourceFieldKey: varchar("source_field_key", { length: 100 }),
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at"),
  allDay: boolean("all_day").notNull().default(false),
  color: varchar("color", { length: 20 }),
  status: varchar("status", { length: 30 }),
  createdById: integer("created_by_id").references(() => users.id).notNull(),
  updatedById: integer("updated_by_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_agenda_events_tenant_starts_at").on(table.tenantId, table.startsAt),
  index("idx_agenda_events_tenant_source").on(table.tenantId, table.sourceEntityType, table.sourceEntityId),
  index("idx_agenda_events_tenant_branch_starts_at").on(table.tenantId, table.branchId, table.startsAt),
  uniqueIndex("uq_agenda_events_source_field").on(table.tenantId, table.sourceEntityType, table.sourceEntityId, table.sourceFieldKey),
]);

export const insertAgendaEventSchema = createInsertSchema(agendaEvents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAgendaEvent = z.infer<typeof insertAgendaEventSchema>;
export type AgendaEvent = typeof agendaEvents.$inferSelect;
