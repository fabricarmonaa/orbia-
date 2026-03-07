import {
  pgTable,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  serial,
  numeric,
  index,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { tenants } from "./tenants";

export const productCategories = pgTable(
  "product_categories",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    sortOrder: integer("sort_order").default(0),
  },
  (table) => [index("idx_prod_cats_tenant").on(table.tenantId)]
);

export const insertProductCategorySchema = createInsertSchema(
  productCategories
).omit({ id: true });
export type InsertProductCategory = z.infer<
  typeof insertProductCategorySchema
>;
export type ProductCategory = typeof productCategories.$inferSelect;

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    categoryId: integer("category_id").references(() => productCategories.id),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    cost: numeric("cost", { precision: 12, scale: 2 }),
    pricingMode: varchar("pricing_mode", { length: 20 }).notNull().default("MANUAL"),
    costAmount: numeric("cost_amount", { precision: 12, scale: 2 }),
    costCurrency: varchar("cost_currency", { length: 10 }),
    marginPct: numeric("margin_pct", { precision: 5, scale: 2 }),
    stock: integer("stock"),
    minStock: numeric("min_stock", { precision: 12, scale: 3 }).notNull().default("0"),
    sku: varchar("sku", { length: 100 }),
    isActive: boolean("is_active").notNull().default(true),
    statusCode: varchar("status_code", { length: 40 }).default("ACTIVE"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_products_tenant").on(table.tenantId),
    index("idx_products_tenant_active").on(table.tenantId, table.isActive, table.createdAt),
    index("idx_products_tenant_category_active_created").on(table.tenantId, table.categoryId, table.isActive, table.createdAt),
    uniqueIndex("uq_products_tenant_sku").on(table.tenantId, table.sku),
  ]
);

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
});
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

// ─────────────────────────────────────────────
// Campos Dinámicos para Productos (Configuración / Blueprint)
// ─────────────────────────────────────────────
export const productCustomFieldDefinitions = pgTable(
  "product_custom_field_definitions",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    fieldKey: varchar("field_key", { length: 80 }).notNull(),
    label: varchar("label", { length: 160 }).notNull(),
    fieldType: varchar("field_type", { length: 20 }).notNull(), // TEXT, NUMBER, SELECT, CHECKBOX
    required: boolean("required").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    config: jsonb("config").notNull().default({}), // Ej: { options: ["Rojo", "Azul"] }
    isActive: boolean("is_active").notNull().default(true),
    isFilterable: boolean("is_filterable").notNull().default(false), // Si aparece como filtro en UI
    filterType: varchar("filter_type", { length: 40 }).default("EXACT"), // EXACT, RANGE
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_prod_cf_def_tenant").on(table.tenantId),
    uniqueIndex("uq_prod_cf_def_tenant_key").on(table.tenantId, table.fieldKey),
  ]
);

export const insertProductCustomFieldDefinitionSchema = createInsertSchema(
  productCustomFieldDefinitions
).omit({ id: true, createdAt: true });
export type InsertProductCustomFieldDefinition = z.infer<typeof insertProductCustomFieldDefinitionSchema>;
export type ProductCustomFieldDefinition = typeof productCustomFieldDefinitions.$inferSelect;

// ─────────────────────────────────────────────
// Valores de los Campos Dinámicos (EAV)
// ─────────────────────────────────────────────
export const productCustomFieldValues = pgTable(
  "product_custom_field_values",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    productId: integer("product_id").references(() => products.id, { onDelete: "cascade" }).notNull(),
    fieldDefinitionId: integer("field_definition_id")
      .references(() => productCustomFieldDefinitions.id, { onDelete: "cascade" })
      .notNull(),
    valueText: text("value_text"),
    valueNumber: numeric("value_number", { precision: 16, scale: 4 }),
    valueBoolean: boolean("value_boolean"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_prod_cf_vals_tenant_prod").on(table.tenantId, table.productId),
    uniqueIndex("uq_prod_cf_vals_prod_def").on(table.productId, table.fieldDefinitionId),
  ]
);

export const insertProductCustomFieldValueSchema = createInsertSchema(
  productCustomFieldValues
).omit({ id: true, createdAt: true });
export type InsertProductCustomFieldValue = z.infer<typeof insertProductCustomFieldValueSchema>;
export type ProductCustomFieldValue = typeof productCustomFieldValues.$inferSelect;
