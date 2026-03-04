import { index, integer, jsonb, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const auditEvents = pgTable(
  "audit_events",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    branchId: integer("branch_id"),
    actorUserId: integer("actor_user_id"),
    actorCashierId: integer("actor_cashier_id"),
    actorRole: varchar("actor_role", { length: 40 }).notNull().default("sistema"),
    action: varchar("action", { length: 120 }).notNull(),
    entityType: varchar("entity_type", { length: 120 }).notNull(),
    entityId: varchar("entity_id", { length: 120 }),
    metadata: jsonb("metadata").notNull().default({}),
    ip: varchar("ip", { length: 120 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_audit_events_tenant_created_at").on(table.tenantId, table.createdAt),
    index("idx_audit_events_entity").on(table.tenantId, table.entityType, table.entityId),
    index("idx_audit_events_actor_user").on(table.tenantId, table.actorUserId, table.createdAt),
    index("idx_audit_events_actor_cashier").on(table.tenantId, table.actorCashierId, table.createdAt),
  ]
);
