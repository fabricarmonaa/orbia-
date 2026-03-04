import { pgTable, serial, integer, varchar, boolean, timestamp, jsonb, text, numeric, date, uniqueIndex, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { sales } from "./sales";
import { orders } from "./orders";
import { products } from "./products";

export const saleFieldDefinitions = pgTable(
  "sale_field_definitions",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    fieldKey: varchar("field_key", { length: 80 }).notNull(),
    label: varchar("label", { length: 160 }).notNull(),
    fieldType: varchar("field_type", { length: 20 }).notNull(),
    required: boolean("required").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    config: jsonb("config").notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    visibleInTicket: boolean("visible_in_ticket").notNull().default(true),
    visibleInInternal: boolean("visible_in_internal").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_sale_field_definitions_tenant_key").on(table.tenantId, table.fieldKey),
    index("idx_sale_field_definitions_tenant").on(table.tenantId, table.sortOrder, table.id),
  ]
);

export const saleFieldValues = pgTable(
  "sale_field_values",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    saleId: integer("sale_id").references(() => sales.id, { onDelete: "cascade" }).notNull(),
    fieldDefinitionId: integer("field_definition_id").references(() => saleFieldDefinitions.id, { onDelete: "cascade" }).notNull(),
    fieldKey: varchar("field_key", { length: 80 }),
    valueText: text("value_text"),
    valueNumber: numeric("value_number", { precision: 14, scale: 4 }),
    valueBool: boolean("value_bool"),
    valueDate: date("value_date"),
    valueJson: jsonb("value_json"),
    valueMoneyAmount: numeric("value_money_amount", { precision: 14, scale: 2 }),
    valueMoneyDirection: integer("value_money_direction"),
    currency: varchar("currency", { length: 3 }),
    fileStorageKey: text("file_storage_key"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_sale_field_values_tenant_sale").on(table.tenantId, table.saleId),
    uniqueIndex("uq_sale_field_values_sale_field").on(table.tenantId, table.saleId, table.fieldDefinitionId),
    uniqueIndex("uq_sale_field_values_tenant_sale_field_key").on(table.tenantId, table.saleId, table.fieldKey),
  ]
);

export const entityVisibilitySettings = pgTable(
  "entity_visibility_settings",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    entityType: varchar("entity_type", { length: 20 }).notNull(),
    settings: jsonb("settings").notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("uq_entity_visibility_settings_tenant_entity").on(table.tenantId, table.entityType)]
);

export type SaleFieldDefinition = typeof saleFieldDefinitions.$inferSelect;
export type SaleFieldValue = typeof saleFieldValues.$inferSelect;
