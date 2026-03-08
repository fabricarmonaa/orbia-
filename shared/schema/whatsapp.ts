import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { branches } from "./branches";
import { customers } from "./customers";
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
  customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
  customerMatchConfidence: integer("customer_match_confidence"),
  linkedManuallyByUserId: integer("linked_manually_by_user_id").references(() => users.id, { onDelete: "set null" }),
  linkedAt: timestamp("linked_at"),
  customerPhone: varchar("customer_phone", { length: 40 }).notNull(),
  recipientPhoneCanonical: varchar("recipient_phone_canonical", { length: 40 }).notNull(),
  recipientWaId: varchar("recipient_wa_id", { length: 80 }),
  sandboxRecipientOverride: boolean("sandbox_recipient_override").notNull().default(false),
  customerName: varchar("customer_name", { length: 200 }),
  status: varchar("status", { length: 30 }).notNull().default("OPEN"),
  ownerMode: varchar("owner_mode", { length: 20 }).notNull().default("human"),
  handoffStatus: varchar("handoff_status", { length: 20 }).notNull().default("none"),
  automationEnabled: boolean("automation_enabled").notNull().default(false),
  automationPausedUntil: timestamp("automation_paused_until"),
  automationPausedReason: text("automation_paused_reason"),
  lastAutomationAt: timestamp("last_automation_at"),
  lastHumanAt: timestamp("last_human_at"),
  externalThreadId: varchar("external_thread_id", { length: 200 }),
  automationSessionId: varchar("automation_session_id", { length: 200 }),
  automationContext: jsonb("automation_context"),
  lastInboundMessageId: integer("last_inbound_message_id"),
  lastOutboundMessageId: integer("last_outbound_message_id"),
  assignedAt: timestamp("assigned_at"),
  lastHumanInterventionAt: timestamp("last_human_intervention_at"),
  hasHumanIntervention: boolean("has_human_intervention").notNull().default(false),
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

export const whatsappConversationEvents = pgTable("whatsapp_conversation_events", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  branchId: integer("branch_id").references(() => branches.id, { onDelete: "set null" }),
  channelId: integer("channel_id").references(() => tenantWhatsappChannels.id, { onDelete: "set null" }),
  conversationId: integer("conversation_id").notNull().references(() => whatsappConversations.id, { onDelete: "cascade" }),
  messageId: integer("message_id").references(() => whatsappMessages.id, { onDelete: "set null" }),
  customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
  actorUserId: integer("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  eventType: varchar("event_type", { length: 80 }).notNull(),
  payloadJson: jsonb("payload_json").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_whatsapp_conversation_events_conversation").on(table.conversationId, table.createdAt),
  index("idx_whatsapp_conversation_events_tenant").on(table.tenantId, table.createdAt),
  index("idx_whatsapp_conversation_events_type").on(table.eventType),
]);

export const tenantWhatsappAutomationConfigs = pgTable("tenant_whatsapp_automation_configs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  providerType: varchar("provider_type", { length: 50 }).notNull().default("n8n_webhook"),
  webhookUrl: text("webhook_url"),
  signingSecretEncrypted: text("signing_secret_encrypted"),
  timeoutMs: integer("timeout_ms").notNull().default(8000),
  retryEnabled: boolean("retry_enabled").notNull().default(true),
  retryMaxAttempts: integer("retry_max_attempts").notNull().default(3),
  allowedBranchId: integer("allowed_branch_id").references(() => branches.id, { onDelete: "set null" }),
  lastTestAt: timestamp("last_test_at"),
  lastTestStatus: varchar("last_test_status", { length: 20 }),
  lastTestMessage: text("last_test_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("uq_tenant_whatsapp_automation_configs_tenant").on(table.tenantId),
  index("idx_tenant_whatsapp_automation_configs_branch").on(table.allowedBranchId),
]);

export const insertTenantWhatsappChannelSchema = createInsertSchema(tenantWhatsappChannels).omit({ id: true, createdAt: true, updatedAt: true });
export const insertWhatsappConversationSchema = createInsertSchema(whatsappConversations).omit({ id: true, createdAt: true, updatedAt: true });
export const insertWhatsappMessageSchema = createInsertSchema(whatsappMessages).omit({ id: true, createdAt: true });
export const insertWhatsappWebhookEventSchema = createInsertSchema(whatsappWebhookEvents).omit({ id: true, createdAt: true });
export const insertWhatsappConversationEventSchema = createInsertSchema(whatsappConversationEvents).omit({ id: true, createdAt: true });
export const insertTenantWhatsappAutomationConfigSchema = createInsertSchema(tenantWhatsappAutomationConfigs).omit({ id: true, createdAt: true, updatedAt: true });

export type TenantWhatsappChannel = typeof tenantWhatsappChannels.$inferSelect;
export type InsertTenantWhatsappChannel = z.infer<typeof insertTenantWhatsappChannelSchema>;
export type WhatsappConversation = typeof whatsappConversations.$inferSelect;
export type InsertWhatsappConversation = z.infer<typeof insertWhatsappConversationSchema>;
export type WhatsappMessage = typeof whatsappMessages.$inferSelect;
export type InsertWhatsappMessage = z.infer<typeof insertWhatsappMessageSchema>;
export type WhatsappWebhookEvent = typeof whatsappWebhookEvents.$inferSelect;
export type InsertWhatsappWebhookEvent = z.infer<typeof insertWhatsappWebhookEventSchema>;
export type WhatsappConversationEvent = typeof whatsappConversationEvents.$inferSelect;
export type InsertWhatsappConversationEvent = z.infer<typeof insertWhatsappConversationEventSchema>;
export type TenantWhatsappAutomationConfig = typeof tenantWhatsappAutomationConfigs.$inferSelect;
export type InsertTenantWhatsappAutomationConfig = z.infer<typeof insertTenantWhatsappAutomationConfigSchema>;
