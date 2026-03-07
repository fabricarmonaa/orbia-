import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { branches } from "./branches";
import { tenants } from "./tenants";
import { users } from "./users";

export const tenantWhatsappChannels = pgTable("tenant_whatsapp_channels", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  branchId: integer("branch_id").references(() => branches.id, { onDelete: "set null" }),
  provider: varchar("provider", { length: 20 }).notNull().default("meta"),
  phoneNumber: varchar("phone_number", { length: 40 }).notNull(),
  phoneNumberId: varchar("phone_number_id", { length: 120 }).notNull(),
  businessAccountId: varchar("business_account_id", { length: 120 }),
  displayName: varchar("display_name", { length: 200 }),
  accessTokenEncrypted: text("access_token_encrypted"),
  appSecretEncrypted: text("app_secret_encrypted"),
  webhookVerifyTokenEncrypted: text("webhook_verify_token_encrypted"),
  status: varchar("status", { length: 20 }).notNull().default("DRAFT"),
  isActive: boolean("is_active").notNull().default(false),
  metadataJson: jsonb("metadata_json").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("uq_tenant_whatsapp_channels_tenant_phone").on(table.tenantId, table.phoneNumber),
  index("idx_tenant_whatsapp_channels_phone_number_id").on(table.phoneNumberId),
  index("idx_tenant_whatsapp_channels_tenant").on(table.tenantId),
]);

export const whatsappConversations = pgTable("whatsapp_conversations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  branchId: integer("branch_id").references(() => branches.id, { onDelete: "set null" }),
  channelId: integer("channel_id").notNull().references(() => tenantWhatsappChannels.id, { onDelete: "cascade" }),
  customerId: integer("customer_id"),
  customerPhone: varchar("customer_phone", { length: 40 }).notNull(),
  customerName: varchar("customer_name", { length: 200 }),
  status: varchar("status", { length: 20 }).notNull().default("OPEN"),
  assignedUserId: integer("assigned_user_id").references(() => users.id, { onDelete: "set null" }),
  unreadCount: integer("unread_count").notNull().default(0),
  lastInboundAt: timestamp("last_inbound_at"),
  lastOutboundAt: timestamp("last_outbound_at"),
  lastMessageAt: timestamp("last_message_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_whatsapp_conversations_tenant_phone").on(table.tenantId, table.customerPhone),
  index("idx_whatsapp_conversations_channel").on(table.channelId),
  index("idx_whatsapp_conversations_assigned_user").on(table.assignedUserId),
]);

export const whatsappMessages = pgTable("whatsapp_messages", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  conversationId: integer("conversation_id").notNull().references(() => whatsappConversations.id, { onDelete: "cascade" }),
  channelId: integer("channel_id").notNull().references(() => tenantWhatsappChannels.id, { onDelete: "cascade" }),
  providerMessageId: varchar("provider_message_id", { length: 160 }),
  direction: varchar("direction", { length: 20 }).notNull(),
  senderType: varchar("sender_type", { length: 20 }).notNull(),
  senderUserId: integer("sender_user_id").references(() => users.id, { onDelete: "set null" }),
  messageType: varchar("message_type", { length: 20 }).notNull().default("UNKNOWN"),
  contentText: text("content_text"),
  mediaUrl: text("media_url"),
  mimeType: varchar("mime_type", { length: 120 }),
  transcriptionText: text("transcription_text"),
  status: varchar("status", { length: 20 }).notNull().default("RECEIVED"),
  rawPayloadJson: jsonb("raw_payload_json").default({}),
  sentAt: timestamp("sent_at"),
  receivedAt: timestamp("received_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_whatsapp_messages_tenant_conversation").on(table.tenantId, table.conversationId),
  index("idx_whatsapp_messages_provider_message_id").on(table.providerMessageId),
  index("idx_whatsapp_messages_created_at").on(table.createdAt),
]);

export const whatsappWebhookEvents = pgTable("whatsapp_webhook_events", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
  channelId: integer("channel_id").references(() => tenantWhatsappChannels.id, { onDelete: "set null" }),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  provider: varchar("provider", { length: 20 }).notNull().default("meta"),
  payloadJson: jsonb("payload_json").notNull(),
  signatureValid: boolean("signature_valid"),
  processingStatus: varchar("processing_status", { length: 20 }).notNull().default("PENDING"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  processedAt: timestamp("processed_at"),
}, (table) => [
  index("idx_whatsapp_webhook_events_processing_status").on(table.processingStatus),
  index("idx_whatsapp_webhook_events_created_at").on(table.createdAt),
]);

export const insertTenantWhatsappChannelSchema = createInsertSchema(tenantWhatsappChannels).omit({ id: true, createdAt: true, updatedAt: true });
export const insertWhatsappConversationSchema = createInsertSchema(whatsappConversations).omit({ id: true, createdAt: true, updatedAt: true });
export const insertWhatsappMessageSchema = createInsertSchema(whatsappMessages).omit({ id: true, createdAt: true });
export const insertWhatsappWebhookEventSchema = createInsertSchema(whatsappWebhookEvents).omit({ id: true, createdAt: true });

export type TenantWhatsappChannel = typeof tenantWhatsappChannels.$inferSelect;
export type InsertTenantWhatsappChannel = z.infer<typeof insertTenantWhatsappChannelSchema>;
export type WhatsappConversation = typeof whatsappConversations.$inferSelect;
export type InsertWhatsappConversation = z.infer<typeof insertWhatsappConversationSchema>;
export type WhatsappMessage = typeof whatsappMessages.$inferSelect;
export type InsertWhatsappMessage = z.infer<typeof insertWhatsappMessageSchema>;
export type WhatsappWebhookEvent = typeof whatsappWebhookEvents.$inferSelect;
export type InsertWhatsappWebhookEvent = z.infer<typeof insertWhatsappWebhookEventSchema>;
