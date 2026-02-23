import { pgTable, serial, integer, boolean, text, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./users";

export const superAdminTotp = pgTable(
  "super_admin_totp",
  {
    id: serial("id").primaryKey(),
    superAdminId: integer("super_admin_id").references(() => users.id).notNull(),
    secret: text("secret").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    verifiedAt: timestamp("verified_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_super_admin_totp_admin").on(table.superAdminId),
    index("idx_super_admin_totp_admin").on(table.superAdminId),
  ]
);

export const superAdminAuditLogs = pgTable(
  "super_admin_audit_logs",
  {
    id: serial("id").primaryKey(),
    superAdminId: integer("super_admin_id").references(() => users.id),
    action: text("action").notNull(),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("idx_super_admin_audit_admin").on(table.superAdminId)]
);

export const insertSuperAdminTotpSchema = createInsertSchema(superAdminTotp).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSuperAdminTotp = z.infer<typeof insertSuperAdminTotpSchema>;
export type SuperAdminTotp = typeof superAdminTotp.$inferSelect;

export const insertSuperAdminAuditLogSchema = createInsertSchema(superAdminAuditLogs).omit({ id: true, createdAt: true });
export type InsertSuperAdminAuditLog = z.infer<typeof insertSuperAdminAuditLogSchema>;
export type SuperAdminAuditLog = typeof superAdminAuditLogs.$inferSelect;
