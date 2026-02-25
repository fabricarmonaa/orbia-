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

// ─────────────────────────────────────────────
// Order type definitions
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// Etapa A – Order type presets (max 3 per type per tenant)
// ─────────────────────────────────────────────
export const orderTypePresets = pgTable(
  "order_type_presets",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
    orderTypeId: integer("order_type_id").references(() => orderTypeDefinitions.id).notNull(),
    code: varchar("code", { length: 80 }).notNull(),  // slug: "default", "garantia", etc.
    label: varchar("label", { length: 200 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_order_type_presets_tenant_type_code").on(table.tenantId, table.orderTypeId, table.code),
    index("idx_order_type_presets_tenant_type").on(table.tenantId, table.orderTypeId),
  ]
);

// ─────────────────────────────────────────────
// Order field definitions – now belong to a preset
// ─────────────────────────────────────────────
export const orderFieldDefinitions = pgTable(
  "order_field_definitions",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
    orderTypeId: integer("order_type_id").references(() => orderTypeDefinitions.id).notNull(),
    // Etapa A: preset FK (nullable for backcompat; backfill sets it for all existing records)
    presetId: integer("preset_id").references(() => orderTypePresets.id),
    fieldKey: varchar("field_key", { length: 80 }).notNull(),
    label: varchar("label", { length: 160 }).notNull(),
    fieldType: varchar("field_type", { length: 20 }).notNull(),
    required: boolean("required").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    config: jsonb("config").notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    isSystemDefault: boolean("is_system_default").notNull().default(false),
    // Etapa B: visibility in public tracking page
    visibleInTracking: boolean("visible_in_tracking").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // Changed from (order_type_id, field_key) to (preset_id, field_key) to allow
    // same key in different presets of the same type.
    // Note: preset_id nullable means this partial index won't enforce uniqueness for
    // legacy rows until backfill runs. That's acceptable.
    index("idx_order_field_definitions_preset").on(table.presetId),
    index("idx_order_field_definitions_tenant_type").on(table.tenantId, table.orderTypeId),
  ]
);

// ─────────────────────────────────────────────
// Order field values
// ─────────────────────────────────────────────
export const orderFieldValues = pgTable(
  "order_field_values",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
    orderId: integer("order_id").references(() => orders.id).notNull(),
    fieldDefinitionId: integer("field_definition_id").references(() => orderFieldDefinitions.id).notNull(),
    valueText: text("value_text"),
    valueNumber: numeric("value_number", { precision: 14, scale: 4 }),
    // For FILE fields: "att:{attachment_id}" referencing order_attachments.id
    fileStorageKey: text("file_storage_key"),
    // Etapa B: per-value tracking visibility override
    // null = use field_definition.visible_in_tracking; true/false = explicit override
    visibleOverride: boolean("visible_override"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_order_field_values_tenant_order").on(table.tenantId, table.orderId),
    uniqueIndex("uq_order_field_values_order_field").on(table.orderId, table.fieldDefinitionId),
  ]
);

// ─────────────────────────────────────────────
// Zod schemas and TypeScript types
// ─────────────────────────────────────────────
export const insertOrderTypeDefinitionSchema = createInsertSchema(orderTypeDefinitions).omit({
  id: true,
  createdAt: true,
});
export type InsertOrderTypeDefinition = z.infer<typeof insertOrderTypeDefinitionSchema>;
export type OrderTypeDefinition = typeof orderTypeDefinitions.$inferSelect;

export const insertOrderTypePresetSchema = createInsertSchema(orderTypePresets).omit({
  id: true,
  createdAt: true,
});
export type InsertOrderTypePreset = z.infer<typeof insertOrderTypePresetSchema>;
export type OrderTypePreset = typeof orderTypePresets.$inferSelect;

export const insertOrderFieldDefinitionSchema = createInsertSchema(orderFieldDefinitions).omit({
  id: true,
  createdAt: true,
});
export type InsertOrderFieldDefinition = z.infer<typeof insertOrderFieldDefinitionSchema>;
export type OrderFieldDefinition = typeof orderFieldDefinitions.$inferSelect;
export type OrderFieldDefinitionPublic = Pick<
  OrderFieldDefinition,
  "id" | "fieldKey" | "label" | "fieldType" | "required" | "sortOrder" | "config" | "isSystemDefault" | "visibleInTracking" | "presetId"
>;

export const insertOrderFieldValueSchema = createInsertSchema(orderFieldValues).omit({
  id: true,
  createdAt: true,
});
export type InsertOrderFieldValue = z.infer<typeof insertOrderFieldValueSchema>;
export type OrderFieldValue = typeof orderFieldValues.$inferSelect;

// ─────────────────────────────────────────────
// Etapa C – File attachments for orders
// Physical files stored in storage/tenants/{code}/orders/{id}/
// ─────────────────────────────────────────────
export const orderAttachments = pgTable(
  "order_attachments",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
    orderId: integer("order_id").references(() => orders.id, { onDelete: "cascade" }).notNull(),
    fieldDefinitionId: integer("field_definition_id").references(() => orderFieldDefinitions.id),
    // Original filename as provided by the user (sanitized for display only)
    originalName: varchar("original_name", { length: 260 }).notNull(),
    // Unique internal filename: {tenantId}_{orderId}_{fieldKey}_{uuid}.{ext}
    storedName: varchar("stored_name", { length: 400 }).notNull(),
    mimeType: varchar("mime_type", { length: 127 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    // Path relative to process.cwd()/storage/
    storagePath: text("storage_path").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_order_attachments_order").on(table.orderId),
    index("idx_order_attachments_tenant").on(table.tenantId),
  ]
);

export const insertOrderAttachmentSchema = createInsertSchema(orderAttachments).omit({
  id: true,
  createdAt: true,
});
export type InsertOrderAttachment = z.infer<typeof insertOrderAttachmentSchema>;
export type OrderAttachment = typeof orderAttachments.$inferSelect;
