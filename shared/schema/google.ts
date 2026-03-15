import { pgTable, serial, integer, varchar, text, timestamp, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { tenants } from "./tenants";

export const userGoogleConnections = pgTable("user_google_connections", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  googleUserId: varchar("google_user_id", { length: 255 }).notNull(),
  googleEmail: varchar("google_email", { length: 255 }).notNull(),
  encryptedRefreshToken: text("encrypted_refresh_token"),
  encryptedAccessToken: text("encrypted_access_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  selectedCalendarId: varchar("selected_calendar_id", { length: 255 }),
  scopes: text("scopes"),
  connectedAt: timestamp("connected_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  isActive: boolean("is_active").notNull().default(true),
}, (table) => [
  // Un usuario solo puede tener una conexión Google por tenant.
  uniqueIndex("uq_user_google_conn_user_tenant").on(table.userId, table.tenantId),
  // Una cuenta Google solo puede estar conectada a un usuario por tenant.
  uniqueIndex("uq_user_google_conn_google_per_tenant").on(table.tenantId, table.googleUserId),
  index("idx_user_google_connections_tenant").on(table.tenantId),
]);
