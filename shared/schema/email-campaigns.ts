import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { tenants } from "./tenants";

export const emailCampaigns = pgTable("email_campaigns", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdByUserId: integer("created_by_user_id").references(() => users.id).notNull(),
  subject: varchar("subject", { length: 200 }).notNull(),
  html: text("html").notNull(),
  text: text("text"),
  sendToAll: boolean("send_to_all").notNull().default(false),
  requestedTenantIdsJson: jsonb("requested_tenant_ids_json").default([]),
  status: varchar("status", { length: 20 }).notNull().default("PENDING"),
  totalRecipients: integer("total_recipients").notNull().default(0),
  successCount: integer("success_count").notNull().default(0),
  failureCount: integer("failure_count").notNull().default(0),
}, (table) => [index("idx_email_campaigns_created_by").on(table.createdByUserId)]);

export const emailDeliveryLogs = pgTable("email_delivery_logs", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").references(() => emailCampaigns.id).notNull(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  toEmail: varchar("to_email", { length: 255 }).notNull(),
  status: varchar("status", { length: 10 }).notNull(),
  errorMessage: varchar("error_message", { length: 500 }),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
}, (table) => [
  index("idx_email_delivery_campaign").on(table.campaignId),
  index("idx_email_delivery_tenant").on(table.tenantId),
]);
