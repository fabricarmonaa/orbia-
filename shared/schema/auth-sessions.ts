import { pgTable, serial, integer, varchar, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { tenants } from "./tenants";
import { users } from "./users";

export const authRefreshSessions = pgTable(
  "auth_refresh_sessions",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    deviceLabel: varchar("device_label", { length: 160 }),
    ipAddress: varchar("ip_address", { length: 120 }),
    userAgent: text("user_agent"),
    rememberDevice: boolean("remember_device").notNull().default(false),
    expiresAt: timestamp("expires_at").notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
    revokedAt: timestamp("revoked_at"),
    replacedBySessionId: integer("replaced_by_session_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_auth_refresh_sessions_user").on(table.userId, table.revokedAt),
    index("idx_auth_refresh_sessions_hash").on(table.tokenHash),
    index("idx_auth_refresh_sessions_tenant").on(table.tenantId, table.expiresAt),
  ]
);

export const insertAuthRefreshSessionSchema = createInsertSchema(authRefreshSessions).omit({
  id: true,
  createdAt: true,
  lastSeenAt: true,
});

export type InsertAuthRefreshSession = z.infer<typeof insertAuthRefreshSessionSchema>;
export type AuthRefreshSession = typeof authRefreshSessions.$inferSelect;
