import {
  pgTable,
  serial,
  integer,
  varchar,
  boolean,
  timestamp,
  jsonb,
  text,
  numeric,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { tenants } from "./tenants";
import { orders } from "./orders";

export const orderTypeDefinitions = pgTable(
  "order_type_definitions",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
    code: varchar("code", { length: 50 }).notNull(),
    label: varchar("label", { length: 120 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_order_type_definitions_tenant_code").on(table.tenantId, table.code),
    index("idx_order_type_definitions_tenant").on(table.tenantId),
  ]
);

export const orderFieldDefinitions = pgTable(
  "order_field_definitions",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
    orderTypeId: integer("order_type_id").references(() => orderTypeDefinitions.id).notNull(),
    fieldKey: varchar("field_key", { length: 80 }).notNull(),
    label: varchar("label", { length: 160 }).notNull(),
    fieldType: varchar("field_type", { length: 20 }).notNull(),
    required: boolean("required").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    config: jsonb("config").notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_order_field_definitions_type_key").on(table.orderTypeId, table.fieldKey),
    index("idx_order_field_definitions_tenant_type").on(table.tenantId, table.orderTypeId),
  ]
);

export const orderFieldValues = pgTable(
  "order_field_values",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
    orderId: integer("order_id").references(() => orders.id).notNull(),
    fieldDefinitionId: integer("field_definition_id").references(() => orderFieldDefinitions.id).notNull(),
    valueText: text("value_text"),
    valueNumber: numeric("value_number", { precision: 14, scale: 4 }),
    fileStorageKey: text("file_storage_key"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_order_field_values_tenant_order").on(table.tenantId, table.orderId),
    uniqueIndex("uq_order_field_values_order_field").on(table.orderId, table.fieldDefinitionId),
  ]
);

export const insertOrderTypeDefinitionSchema = createInsertSchema(orderTypeDefinitions).omit({
  id: true,
  createdAt: true,
});
export type InsertOrderTypeDefinition = z.infer<typeof insertOrderTypeDefinitionSchema>;
export type OrderTypeDefinition = typeof orderTypeDefinitions.$inferSelect;

export const insertOrderFieldDefinitionSchema = createInsertSchema(orderFieldDefinitions).omit({
  id: true,
  createdAt: true,
});
export type InsertOrderFieldDefinition = z.infer<typeof insertOrderFieldDefinitionSchema>;
export type OrderFieldDefinition = typeof orderFieldDefinitions.$inferSelect;

export const insertOrderFieldValueSchema = createInsertSchema(orderFieldValues).omit({
  id: true,
  createdAt: true,
});
export type InsertOrderFieldValue = z.infer<typeof insertOrderFieldValueSchema>;
export type OrderFieldValue = typeof orderFieldValues.$inferSelect;
