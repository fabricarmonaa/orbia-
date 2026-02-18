import { pgTable, serial, integer, varchar, text, boolean, timestamp, unique, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { tenants } from "./tenants";

export const permissions = pgTable("permissions", {
    id: serial("id").primaryKey(),
    key: varchar("key", { length: 100 }).notNull().unique(), // "cash.close", "products.create"
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    category: varchar("category", { length: 50 }), // "cash", "products", "orders"
});

export const userPermissions = pgTable("user_permissions", {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
    userId: integer("user_id").references(() => users.id).notNull(),
    permissionId: integer("permission_id").references(() => permissions.id).notNull(),
    grantedAt: timestamp("granted_at").defaultNow().notNull(),
    grantedById: integer("granted_by_id").references(() => users.id),
}, (table) => ({
    uniqueUserPermission: unique().on(table.userId, table.permissionId),
    tenantUserIdx: index("user_permissions_tenant_user_idx").on(table.tenantId, table.userId),
}));

export type Permission = typeof permissions.$inferSelect;
export type InsertPermission = typeof permissions.$inferInsert;
export type UserPermission = typeof userPermissions.$inferSelect;
export type InsertUserPermission = typeof userPermissions.$inferInsert;
