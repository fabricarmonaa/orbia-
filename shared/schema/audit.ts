import { pgTable, serial, integer, varchar, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

export const auditLogs = pgTable("audit_logs", {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
    userId: integer("user_id").references(() => users.id),
    action: varchar("action", { length: 100 }).notNull(), // "create", "update", "delete"
    entityType: varchar("entity_type", { length: 100 }).notNull(), // "order", "product", "cash_session"
    entityId: integer("entity_id"),
    changes: jsonb("changes"), // { field: { old: x, new: y } }
    metadata: jsonb("metadata"), // IP, user agent, etc.
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
    tenantIdx: index("audit_logs_tenant_idx").on(table.tenantId),
    entityIdx: index("audit_logs_entity_idx").on(table.entityType, table.entityId),
    userIdx: index("audit_logs_user_idx").on(table.userId),
}));

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
