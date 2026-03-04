import { pgTable, serial, integer, varchar, timestamp, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";


export const optionLists = pgTable(
  "option_lists",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
    key: varchar("key", { length: 80 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    entityScope: varchar("entity_scope", { length: 30 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_option_lists_tenant_key").on(table.tenantId, table.key),
    index("idx_option_lists_tenant").on(table.tenantId),
  ]
);

export const optionListItems = pgTable(
  "option_list_items",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    listId: integer("list_id").references(() => optionLists.id).notNull(),
    value: varchar("value", { length: 120 }).notNull(),
    label: varchar("label", { length: 120 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_option_list_items_list_value").on(table.listId, table.value),
    index("idx_option_list_items_list").on(table.listId),
    index("idx_option_list_items_tenant").on(table.tenantId, table.listId),
  ]
);

export type OptionList = typeof optionLists.$inferSelect;
export type OptionListItem = typeof optionListItems.$inferSelect;
