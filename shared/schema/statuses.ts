import { pgTable, serial, integer, varchar, boolean, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { tenants } from "./tenants";

export const statusDefinitions = pgTable(
  "status_definitions",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
    entityType: varchar("entity_type", { length: 20 }).notNull(),
    code: varchar("code", { length: 40 }).notNull(),
    label: varchar("label", { length: 60 }).notNull(),
    color: varchar("color", { length: 20 }),
    sortOrder: integer("sort_order").notNull().default(0),
    isDefault: boolean("is_default").notNull().default(false),
    isFinal: boolean("is_final").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    isLocked: boolean("is_locked").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_status_definitions_tenant_entity").on(table.tenantId, table.entityType),
    uniqueIndex("uq_status_definitions_tenant_entity_code").on(table.tenantId, table.entityType, table.code),
  ]
);

export const insertStatusDefinitionSchema = createInsertSchema(statusDefinitions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertStatusDefinition = z.infer<typeof insertStatusDefinitionSchema>;
export type StatusDefinition = typeof statusDefinitions.$inferSelect;
