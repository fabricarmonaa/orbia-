import { pgTable, serial, integer, varchar, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { tenants } from "./tenants";

export const messageTemplates = pgTable(
  "message_templates",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
    key: varchar("key", { length: 60 }),
    name: varchar("name", { length: 120 }).notNull(),
    body: text("body").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    channel: varchar("channel", { length: 40 }).notNull().default("whatsapp_link"),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("idx_message_templates_tenant").on(table.tenantId),
    index("idx_message_templates_active").on(table.tenantId, table.isActive),
  ]
);

export const insertMessageTemplateSchema = createInsertSchema(messageTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastUsedAt: true,
  deletedAt: true,
});

export type InsertMessageTemplate = z.infer<typeof insertMessageTemplateSchema>;
export type MessageTemplate = typeof messageTemplates.$inferSelect;
