import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  tenantWhatsappChannels,
  whatsappConversations,
  whatsappMessages,
  whatsappWebhookEvents,
  whatsappConversationEvents,
  messageTemplates,
  customers,
  type TenantWhatsappChannel,
} from "@shared/schema";
import { db } from "../db";
import { decryptSecret, encryptSecret, isMaskedSecretValue, maskSecret } from "./whatsapp-crypto";
import { WhatsAppProviderError, resolveWhatsappProvider } from "./whatsapp-provider";
import { whatsappRealtimeBus, type WhatsAppRealtimeEventType } from "./whatsapp-realtime";

function isWhatsappDebugEnabled() {
  return String(process.env.WHATSAPP_DEBUG_LOGS || "").toLowerCase() === "true";
}

function waLog(...args: unknown[]) {
  if (!isWhatsappDebugEnabled()) return;
  console.log("[WA]", ...args);
}


const TEMPLATE_USAGE_TYPES = [
  "greeting",
  "follow_up",
  "reengagement",
  "confirmation",
  "reminder",
  "quote_or_budget",
  "handoff_human",
  "error_fallback",
  "closing",
  "custom",
] as const;

type TemplateUsageType = typeof TEMPLATE_USAGE_TYPES[number];

const CONVERSATION_STATUS_ALLOWED = [
  "OPEN",
  "PENDING_CUSTOMER",
  "PENDING_BUSINESS",
  "WAITING_INTERNAL",
  "RESOLVED",
  "CLOSED",
] as const;

export type ConversationOperationalStatus = typeof CONVERSATION_STATUS_ALLOWED[number];

export const CONVERSATION_OWNER_MODES = ["human", "assisted", "auto"] as const;
export type ConversationOwnerMode = typeof CONVERSATION_OWNER_MODES[number];

export const CONVERSATION_HANDOFF_STATUSES = ["none", "requested", "active", "completed"] as const;
export type ConversationHandoffStatus = typeof CONVERSATION_HANDOFF_STATUSES[number];

function normalizeTemplateUsageType(raw?: string | null): TemplateUsageType {
  const value = String(raw || "").trim().toLowerCase();
  const mapping: Record<string, TemplateUsageType> = {
    general: "custom",
    greeting: "greeting",
    reengagement: "reengagement",
    fallback: "error_fallback",
    human_handoff: "handoff_human",
    confirmation: "confirmation",
    order_followup: "follow_up",
  };
  if ((TEMPLATE_USAGE_TYPES as readonly string[]).includes(value)) return value as TemplateUsageType;
  if (mapping[value]) return mapping[value];
  return "custom";
}

function inferTemplateUsageType(key?: string | null, body?: string | null): TemplateUsageType {
  const source = `${String(key || "")} ${String(body || "")}`.toLowerCase();
  if (source.includes("saludo") || source.includes("hola") || source.includes("greeting")) return "greeting";
  if (source.includes("seguimiento") || source.includes("follow")) return "follow_up";
  if (source.includes("reengagement") || source.includes("reenganche")) return "reengagement";
  if (source.includes("confirm")) return "confirmation";
  if (source.includes("recordatorio") || source.includes("reminder")) return "reminder";
  if (source.includes("presupuesto") || source.includes("quote") || source.includes("budget")) return "quote_or_budget";
  if (source.includes("humano") || source.includes("handoff") || source.includes("asesor")) return "handoff_human";
  if (source.includes("error") || source.includes("fallback")) return "error_fallback";
  if (source.includes("cierre") || source.includes("closing")) return "closing";
  return "custom";
}


export class WhatsAppWindowClosedError extends Error {
  code = "WHATSAPP_WINDOW_CLOSED";
  constructor(message = "La ventana de 24h está cerrada. Debes usar una plantilla para reabrir la conversación.") {
    super(message);
    this.name = "WhatsAppWindowClosedError";
  }
}

export function isWithin24hWindow(lastInboundAt: Date | string | null | undefined) {
  if (!lastInboundAt) return false;
  const last = new Date(lastInboundAt).getTime();
  if (Number.isNaN(last)) return false;
  return (Date.now() - last) <= 24 * 60 * 60 * 1000;
}
export function normalizeWhatsAppRecipientForMeta(input: string): string {
  return String(input || "").replace(/\+/g, "").replace(/[\s\-()]/g, "").replace(/\D/g, "").trim();
}

function normalizePhone(phone?: string | null) {
  if (!phone) return "";
  return String(phone).replace(/[^\d+]/g, "").trim();
}


type ChannelEnvironmentMode = "sandbox" | "production";
type ChannelProductStatus = "not_configured" | "incomplete" | "sandbox_ready" | "production_ready" | "error";

type ChannelMetadata = {
  environmentMode?: ChannelEnvironmentMode;
  sandboxRecipientPhone?: string | null;
  connectedBusinessPhone?: string | null;
  lastSuccessfulTestAt?: string | null;
  lastConnectionValidatedAt?: string | null;
  sandboxAllowedRecipients?: string[];
};

function readChannelMetadata(channel?: TenantWhatsappChannel | null): ChannelMetadata {
  const raw = (channel?.metadataJson && typeof channel.metadataJson === "object") ? channel.metadataJson as any : {};
  return {
    environmentMode: raw.environmentMode === "production" ? "production" : raw.environmentMode === "sandbox" ? "sandbox" : undefined,
    sandboxRecipientPhone: raw.sandboxRecipientPhone ? normalizePhone(String(raw.sandboxRecipientPhone)) : null,
    connectedBusinessPhone: raw.connectedBusinessPhone ? normalizePhone(String(raw.connectedBusinessPhone)) : null,
    lastSuccessfulTestAt: raw.lastSuccessfulTestAt ? String(raw.lastSuccessfulTestAt) : null,
    lastConnectionValidatedAt: raw.lastConnectionValidatedAt ? String(raw.lastConnectionValidatedAt) : null,
    sandboxAllowedRecipients: normalizeAllowedRecipients(raw.sandboxAllowedRecipients),
  };
}


function generateWebhookVerifyToken() {
  return `orbia_${randomBytes(12).toString("hex")}`;
}

function defaultEnvironmentMode() {
  const mode = (process.env.WHATSAPP_SEND_TEST_MODE || "template_hello_world_test").toLowerCase();
  return mode === "template_hello_world_test" ? "sandbox" as const : "production" as const;
}

export function getChannelRuntimeInfo(channel: TenantWhatsappChannel | null) {
  const metadata = readChannelMetadata(channel);
  const environmentMode = metadata.environmentMode || defaultEnvironmentMode();
  const channelProductStatus = computeChannelProductStatus(channel, environmentMode);
  return {
    environmentMode,
    channelProductStatus,
    sandboxRecipientPhone: metadata.sandboxRecipientPhone || null,
    connectedBusinessPhone: metadata.connectedBusinessPhone || channel?.phoneNumber || null,
    lastSuccessfulTestAt: metadata.lastSuccessfulTestAt || null,
    lastConnectionValidatedAt: metadata.lastConnectionValidatedAt || null,
    sandboxAllowedRecipients: metadata.sandboxAllowedRecipients || [],
  };
}


function normalizeAllowedRecipients(input: unknown): string[] {
  const arr = Array.isArray(input) ? input : [];
  return Array.from(new Set(arr.map((v) => normalizeWhatsAppRecipientForMeta(String(v || ""))).filter(Boolean)));
}

function getConversationCanonicalRecipient(conversation: { recipientPhoneCanonical?: string | null; customerPhone?: string | null }) {
  const canonical = normalizeWhatsAppRecipientForMeta(conversation.recipientPhoneCanonical || "");
  if (canonical) return canonical;
  return normalizeWhatsAppRecipientForMeta(conversation.customerPhone || "");
}

function assertSandboxRecipientAllowed(channel: TenantWhatsappChannel, targetTo: string) {
  const runtime = getChannelRuntimeInfo(channel);
  if (runtime.environmentMode !== "sandbox") return;
  const allowed = runtime.sandboxAllowedRecipients || [];
  if (!allowed.length) return;
  const normalized = normalizeWhatsAppRecipientForMeta(targetTo);
  if (allowed.includes(normalized)) return;
  throw new WhatsAppProviderError(
    `Sandbox recipient not allowed (${normalized})`,
    400,
    {
      error: {
        code: 131030,
        message: "Número de teléfono del destinatario no incluido en la lista de autorizados.",
        error_data: {
          details: `Este chat está ligado a ${normalized}. Agregalo en destinatarios permitidos de sandbox para este canal.`,
        },
      },
      resolvedRecipient: normalized,
      sandboxAllowedRecipients: allowed,
      sandboxRecipientOverride: false,
    },
  );
}

type ReplyTargetContext = {
  conversationId: number;
  conversationCustomerPhone: string;
  conversationCanonicalPhone?: string | null;
  conversationWaId?: string | null;
  mode: "manual_text" | "manual_template" | "send_test";
  overrideTo?: string | null;
};

export function resolveWhatsAppReplyTarget(channel: TenantWhatsappChannel, ctx: ReplyTargetContext) {
  const runtime = getChannelRuntimeInfo(channel);
  const canonicalConversation = normalizeWhatsAppRecipientForMeta(ctx.conversationCanonicalPhone || ctx.conversationCustomerPhone);
  const override = normalizeWhatsAppRecipientForMeta(ctx.overrideTo || "");
  if (ctx.mode === "send_test" && override) {
    return {
      environmentMode: runtime.environmentMode,
      to: override,
      source: "send_test_override",
      sandboxOverrideApplied: false,
      allowed: runtime.sandboxAllowedRecipients || [],
    };
  }
  if (!canonicalConversation) {
    throw new WhatsAppProviderError(
      "Conversation recipient is missing or invalid",
      400,
      {
        error: {
          code: 422001,
          message: "No se pudo resolver el destinatario canónico de la conversación.",
          error_data: { details: "Abrí un chat con inbound válido o re-vinculá el destinatario antes de enviar." },
        },
        conversationId: ctx.conversationId,
      },
    );
  }
  return {
    environmentMode: runtime.environmentMode,
    to: canonicalConversation,
    source: "conversation_recipient_canonical",
    sandboxOverrideApplied: false,
    allowed: runtime.sandboxAllowedRecipients || [],
  };
}

function extractMetaEvents(payload: any) {
  const out: Array<{ type: string; value: any; metadata?: any; contact?: any }> = [];
  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value || {};
      const metadata = value?.metadata || {};
      const contact = value?.contacts?.[0] || null;
      for (const msg of value?.messages || []) out.push({ type: "message", value: msg, metadata, contact });
      for (const st of value?.statuses || []) out.push({ type: "status", value: st, metadata, contact });
    }
  }
  return out;
}

function extractStatusError(statusPayload: any) {
  const first = statusPayload?.errors?.[0] || null;
  const code = first?.code ? Number(first.code) : null;
  const details = first?.error_data?.details || first?.title || first?.message || null;
  return { code, details };
}

async function buildConversationSnapshot(tenantId: number, conversationId: number) {
  const [conversation] = await db
    .select()
    .from(whatsappConversations)
    .where(and(eq(whatsappConversations.tenantId, tenantId), eq(whatsappConversations.id, conversationId)))
    .limit(1);
  if (!conversation) return null;
  return { ...conversation, windowOpen: isWithin24hWindow(conversation.lastInboundAt) };
}

async function buildMessageSnapshot(tenantId: number, messageId: number) {
  const [message] = await db
    .select()
    .from(whatsappMessages)
    .where(and(eq(whatsappMessages.tenantId, tenantId), eq(whatsappMessages.id, messageId)))
    .limit(1);
  return message || null;
}

async function emitRealtimeInboxEvent(input: {
  eventType: WhatsAppRealtimeEventType;
  tenantId: number;
  conversationId: number;
  messageId?: number;
  changedFields?: string[];
}) {
  const conversation = await buildConversationSnapshot(input.tenantId, input.conversationId);
  if (!conversation) return;
  const message = input.messageId ? await buildMessageSnapshot(input.tenantId, input.messageId) : null;
  whatsappRealtimeBus.publish({
    eventType: input.eventType,
    tenantId: input.tenantId,
    branchId: conversation.branchId ?? null,
    conversationId: input.conversationId,
    messageId: input.messageId,
    changedFields: input.changedFields,
    timestamp: new Date().toISOString(),
    conversation,
    message: message || undefined,
  });
}

export async function resolveWhatsAppChannelByPhoneNumberId(phoneNumberId: string) {
  const [channel] = await db
    .select()
    .from(tenantWhatsappChannels)
    .where(and(eq(tenantWhatsappChannels.phoneNumberId, phoneNumberId), eq(tenantWhatsappChannels.isActive, true)))
    .limit(1);
  return channel || null;
}

export async function resolveWhatsAppChannelByDestinationPhone(destinationPhone: string) {
  const normalized = normalizePhone(destinationPhone);
  const [channel] = await db
    .select()
    .from(tenantWhatsappChannels)
    .where(and(eq(tenantWhatsappChannels.phoneNumber, normalized), eq(tenantWhatsappChannels.isActive, true)))
    .limit(1);
  return channel || null;
}

export async function verifyMetaWebhookChallenge(mode?: string, verifyToken?: string, challenge?: string) {
  if (mode !== "subscribe" || !verifyToken || !challenge) return null;
  const channels = await db.select().from(tenantWhatsappChannels).where(eq(tenantWhatsappChannels.isActive, true)).limit(200);
  const matched = channels.find((c) => decryptSecret(c.webhookVerifyTokenEncrypted) === verifyToken);
  if (!matched) return null;
  return { challenge, channel: matched };
}

export async function persistConversationDomainEvent(input: {
  tenantId: number;
  branchId?: number | null;
  channelId?: number | null;
  conversationId: number;
  messageId?: number | null;
  customerId?: number | null;
  actorUserId?: number | null;
  eventType: string;
  payload?: unknown;
}) {
  const [saved] = await db
    .insert(whatsappConversationEvents)
    .values({
      tenantId: input.tenantId,
      branchId: input.branchId || null,
      channelId: input.channelId || null,
      conversationId: input.conversationId,
      messageId: input.messageId || null,
      customerId: input.customerId || null,
      actorUserId: input.actorUserId || null,
      eventType: input.eventType,
      payloadJson: input.payload || {},
    })
    .returning();
  return saved;
}

export async function listConversationTimeline(tenantId: number, conversationId: number, branchId?: number | null) {
  const conditions = [
    eq(whatsappConversationEvents.tenantId, tenantId),
    eq(whatsappConversationEvents.conversationId, conversationId),
  ];
  if (branchId) conditions.push(eq(whatsappConversationEvents.branchId, branchId));
  return db
    .select()
    .from(whatsappConversationEvents)
    .where(and(...conditions))
    .orderBy(desc(whatsappConversationEvents.createdAt));
}

export async function persistWebhookEvent(event: {
  tenantId?: number | null;
  channelId?: number | null;
  eventType: string;
  provider?: string;
  payload: unknown;
  signatureValid?: boolean | null;
  processingStatus?: string;
  errorMessage?: string | null;
}) {
  const [saved] = await db
    .insert(whatsappWebhookEvents)
    .values({
      tenantId: event.tenantId || null,
      channelId: event.channelId || null,
      eventType: event.eventType,
      provider: event.provider || "meta",
      payloadJson: event.payload,
      signatureValid: event.signatureValid ?? null,
      processingStatus: event.processingStatus || "PENDING",
      errorMessage: event.errorMessage || null,
      processedAt: event.processingStatus && event.processingStatus !== "PENDING" ? new Date() : null,
    })
    .returning();
  return saved;
}

export async function findOrCreateConversation(input: {
  tenantId: number;
  branchId?: number | null;
  channelId: number;
  customerPhone: string;
  customerName?: string | null;
  recipientPhoneCanonical?: string | null;
  recipientWaId?: string | null;
}) {
  const customerPhone = normalizePhone(input.customerPhone);
  const recipientPhoneCanonical = normalizeWhatsAppRecipientForMeta(input.recipientPhoneCanonical || customerPhone);
  const [found] = await db
    .select()
    .from(whatsappConversations)
    .where(
      and(
        eq(whatsappConversations.tenantId, input.tenantId),
        eq(whatsappConversations.channelId, input.channelId),
        eq(whatsappConversations.recipientPhoneCanonical, recipientPhoneCanonical),
      ),
    )
    .limit(1);

  if (found) {
    if ((!found.recipientWaId && input.recipientWaId) || found.recipientPhoneCanonical !== recipientPhoneCanonical) {
      const [updated] = await db
        .update(whatsappConversations)
        .set({
          recipientPhoneCanonical,
          recipientWaId: input.recipientWaId || found.recipientWaId,
          updatedAt: new Date(),
        })
        .where(eq(whatsappConversations.id, found.id))
        .returning();
      return { conversation: updated || found, created: false as const };
    }
    return { conversation: found, created: false as const };
  }


  const customerRows = await db
    .select()
    .from(customers)
    .where(eq(customers.tenantId, input.tenantId))
    .limit(2000);
  const matchedCustomer = customerRows.find((row) => normalizeWhatsAppRecipientForMeta(row.phone || "") === normalizeWhatsAppRecipientForMeta(customerPhone)) || null;

  const [created] = await db
    .insert(whatsappConversations)
    .values({
      tenantId: input.tenantId,
      branchId: input.branchId || null,
      channelId: input.channelId,
      customerId: matchedCustomer?.id || null,
      customerMatchConfidence: matchedCustomer ? 100 : null,
      linkedAt: matchedCustomer ? new Date() : null,
      customerPhone,
      recipientPhoneCanonical,
      recipientWaId: input.recipientWaId || null,
      sandboxRecipientOverride: false,
      customerName: input.customerName || matchedCustomer?.name || null,
      status: "OPEN",
      ownerMode: "human",
      handoffStatus: "none",
      unreadCount: 0,
      lastMessageAt: new Date(),
    })
    .returning();
  return { conversation: created, created: true as const };
}

export async function createInboundMessage(input: {
  tenantId: number;
  conversationId: number;
  channelId: number;
  providerMessageId?: string | null;
  customerName?: string | null;
  contentText?: string | null;
  rawPayload: unknown;
  messageType?: string;
}) {
  const now = new Date();
  const [msg] = await db
    .insert(whatsappMessages)
    .values({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      channelId: input.channelId,
      providerMessageId: input.providerMessageId || null,
      direction: "INBOUND",
      senderType: "CUSTOMER",
      messageType: input.messageType || "TEXT",
      contentText: input.contentText || null,
      rawPayloadJson: input.rawPayload,
      status: "RECEIVED",
      receivedAt: now,
    })
    .returning();

  await db
    .update(whatsappConversations)
    .set({
      customerName: input.customerName || undefined,
      unreadCount: sql`${whatsappConversations.unreadCount} + 1`,
      lastInboundAt: now,
      lastMessageAt: now,
      updatedAt: now,
    })
    .where(eq(whatsappConversations.id, input.conversationId));

  return msg;
}

export async function createOutboundMessage(input: {
  tenantId: number;
  conversationId: number;
  channelId: number;
  senderUserId?: number | null;
  providerMessageId?: string | null;
  contentText: string;
  status?: string;
  rawPayload?: unknown;
}) {
  const now = new Date();
  const [msg] = await db
    .insert(whatsappMessages)
    .values({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      channelId: input.channelId,
      providerMessageId: input.providerMessageId || null,
      direction: "OUTBOUND",
      senderType: input.senderUserId ? "USER" : "SYSTEM",
      senderUserId: input.senderUserId || null,
      messageType: "TEXT",
      contentText: input.contentText,
      rawPayloadJson: input.rawPayload || {},
      status: input.status || "QUEUED",
      sentAt: now,
    })
    .returning();

  await db
    .update(whatsappConversations)
    .set({ lastOutboundAt: now, lastMessageAt: now, hasHumanIntervention: true, lastHumanInterventionAt: now, updatedAt: now })
    .where(eq(whatsappConversations.id, input.conversationId));

  return msg;
}

export async function processIncomingWhatsAppWebhook(payload: any) {
  const parsedEvents = extractMetaEvents(payload);
  if (!parsedEvents.length) {
    await persistWebhookEvent({ eventType: "empty", payload, processingStatus: "IGNORED" });
    return { processed: 0 };
  }

  let processed = 0;
  for (const event of parsedEvents) {
    const phoneNumberId = event.metadata?.phone_number_id;
    const destinationPhone = event.metadata?.display_phone_number;
    const channel = phoneNumberId
      ? await resolveWhatsAppChannelByPhoneNumberId(String(phoneNumberId))
      : await resolveWhatsAppChannelByDestinationPhone(destinationPhone);

    const baseEvent = await persistWebhookEvent({
      tenantId: channel?.tenantId || null,
      channelId: channel?.id || null,
      eventType: event.type,
      payload: event,
      processingStatus: "PENDING",
    });

    try {
      if (!channel) {
        await db
          .update(whatsappWebhookEvents)
          .set({ processingStatus: "IGNORED", errorMessage: "channel_not_found", processedAt: new Date() })
          .where(eq(whatsappWebhookEvents.id, baseEvent.id));
        continue;
      }

      if (event.type === "message") {
        const messageType = String(event.value?.type || "unknown").toUpperCase();
        const text = event.value?.text?.body || null;
        const from = normalizePhone(event.value?.from || "");
        const name = event.contact?.profile?.name || null;

        const { conversation, created: conversationCreated } = await findOrCreateConversation({
          tenantId: channel.tenantId,
          branchId: channel.branchId,
          channelId: channel.id,
          customerPhone: from,
          customerName: name,
          recipientPhoneCanonical: from,
          recipientWaId: event.contact?.wa_id || null,
        });

        if (conversationCreated) {
          await emitRealtimeInboxEvent({
            eventType: "conversation.created",
            tenantId: channel.tenantId,
            conversationId: conversation.id,
            changedFields: ["status", "lastMessageAt"],
          });
          await persistConversationDomainEvent({
            tenantId: channel.tenantId,
            branchId: channel.branchId,
            channelId: channel.id,
            conversationId: conversation.id,
            customerId: conversation.customerId,
            eventType: "whatsapp.conversation.created",
            payload: { source: "webhook_inbound" },
          });
        }

        if (messageType === "TEXT") {
          const inboundMessage = await createInboundMessage({
            tenantId: channel.tenantId,
            conversationId: conversation.id,
            channelId: channel.id,
            providerMessageId: event.value?.id,
            contentText: text,
            customerName: name,
            rawPayload: event,
            messageType,
          });
          await emitRealtimeInboxEvent({
            eventType: "message.created",
            tenantId: channel.tenantId,
            conversationId: conversation.id,
            messageId: inboundMessage.id,
            changedFields: ["unreadCount", "lastMessageAt", "lastInboundAt"],
          });
          await emitRealtimeInboxEvent({
            eventType: "conversation.updated",
            tenantId: channel.tenantId,
            conversationId: conversation.id,
            changedFields: ["unreadCount", "lastMessageAt", "lastInboundAt"],
          });
          await persistConversationDomainEvent({
            tenantId: channel.tenantId,
            branchId: channel.branchId,
            channelId: channel.id,
            conversationId: conversation.id,
            messageId: inboundMessage.id,
            customerId: conversation.customerId,
            eventType: "whatsapp.message.inbound",
            payload: { providerMessageId: inboundMessage.providerMessageId, messageType: inboundMessage.messageType },
          });
        }

        await db
          .update(whatsappWebhookEvents)
          .set({ processingStatus: messageType === "TEXT" ? "PROCESSED" : "IGNORED", processedAt: new Date() })
          .where(eq(whatsappWebhookEvents.id, baseEvent.id));
      } else if (event.type === "status") {
        const status = String(event.value?.status || "").toUpperCase();
        const providerMessageId = event.value?.id || null;
        const { code, details } = extractStatusError(event.value);
        const statusMap: Record<string, string> = {
          SENT: "SENT",
          DELIVERED: "DELIVERED",
          READ: "READ",
          FAILED: "FAILED",
        };

        let statusMessageId: number | null = null;
        let statusConversationId: number | null = null;
        if (providerMessageId) {
          const [updatedMessage] = await db
            .update(whatsappMessages)
            .set({
              status: statusMap[status] || "QUEUED",
              rawPayloadJson: event,
            })
            .where(
              and(
                eq(whatsappMessages.tenantId, channel.tenantId),
                eq(whatsappMessages.channelId, channel.id),
                eq(whatsappMessages.providerMessageId, providerMessageId),
              ),
            )
            .returning();
          if (updatedMessage) {
            statusMessageId = updatedMessage.id;
            statusConversationId = updatedMessage.conversationId;
          }
        }

        await db
          .update(whatsappWebhookEvents)
          .set({
            processingStatus: status === "FAILED" ? "FAILED" : "PROCESSED",
            errorMessage: status === "FAILED" ? `status_failed:${code || "unknown"}:${details || "n/a"}` : null,
            processedAt: new Date(),
          })
          .where(eq(whatsappWebhookEvents.id, baseEvent.id));

        if (statusConversationId && statusMessageId) {
          await emitRealtimeInboxEvent({
            eventType: "message.status_updated",
            tenantId: channel.tenantId,
            conversationId: statusConversationId,
            messageId: statusMessageId,
            changedFields: ["status"],
          });
          await persistConversationDomainEvent({
            tenantId: channel.tenantId,
            branchId: channel.branchId,
            channelId: channel.id,
            conversationId: statusConversationId,
            messageId: statusMessageId,
            eventType: "whatsapp.message.status_updated",
            payload: { status: statusMap[status] || "QUEUED", providerMessageId },
          });
        }

        waLog("status_webhook", { status, providerMessageId, code, details, channelId: channel.id, tenantId: channel.tenantId });
      } else {
        await db
          .update(whatsappWebhookEvents)
          .set({ processingStatus: "IGNORED", processedAt: new Date() })
          .where(eq(whatsappWebhookEvents.id, baseEvent.id));
      }

      processed += 1;
    } catch (error: any) {
      await db
        .update(whatsappWebhookEvents)
        .set({ processingStatus: "FAILED", errorMessage: error?.message || "processing_error", processedAt: new Date() })
        .where(eq(whatsappWebhookEvents.id, baseEvent.id));
    }
  }

  return { processed };
}



function normalizeConversationStatus(raw: string): ConversationOperationalStatus {
  const value = String(raw || "").trim().toUpperCase();
  if ((CONVERSATION_STATUS_ALLOWED as readonly string[]).includes(value)) return value as ConversationOperationalStatus;
  if (value === "HUMAN" || value === "BOT") return "PENDING_BUSINESS";
  return "OPEN";
}

export async function getConversationByIdScoped(tenantId: number, conversationId: number, branchId?: number | null) {
  const whereClause = branchId
    ? and(
      eq(whatsappConversations.id, conversationId),
      eq(whatsappConversations.tenantId, tenantId),
      eq(whatsappConversations.branchId, branchId),
    )
    : and(eq(whatsappConversations.id, conversationId), eq(whatsappConversations.tenantId, tenantId));
  const [conversation] = await db.select().from(whatsappConversations).where(whereClause).limit(1);
  return conversation || null;
}

export async function markConversationAsRead(tenantId: number, conversationId: number) {
  const [saved] = await db
    .update(whatsappConversations)
    .set({ unreadCount: 0, updatedAt: new Date() })
    .where(and(eq(whatsappConversations.tenantId, tenantId), eq(whatsappConversations.id, conversationId)))
    .returning();
  if (saved) {
    await emitRealtimeInboxEvent({
      eventType: "conversation.read",
      tenantId,
      conversationId,
      changedFields: ["unreadCount"],
    });
    await persistConversationDomainEvent({
      tenantId,
      branchId: saved.branchId,
      channelId: saved.channelId,
      conversationId,
      customerId: saved.customerId,
      eventType: "whatsapp.conversation.read",
      payload: { unreadCount: 0 },
    });
  }
  return saved || null;
}

export async function updateConversationStatus(tenantId: number, conversationId: number, status: ConversationOperationalStatus) {
  const [saved] = await db
    .update(whatsappConversations)
    .set({ status: normalizeConversationStatus(status), updatedAt: new Date() })
    .where(and(eq(whatsappConversations.tenantId, tenantId), eq(whatsappConversations.id, conversationId)))
    .returning();
  if (saved) {
    await emitRealtimeInboxEvent({
      eventType: "conversation.status_changed",
      tenantId,
      conversationId,
      changedFields: ["status"],
    });
    await persistConversationDomainEvent({
      tenantId,
      branchId: saved.branchId,
      channelId: saved.channelId,
      conversationId,
      customerId: saved.customerId,
      eventType: "whatsapp.conversation.status_changed",
      payload: { status: saved.status },
    });
  }
  return saved || null;
}

export async function assignConversationToUser(tenantId: number, conversationId: number, assignedUserId: number | null) {
  const [saved] = await db
    .update(whatsappConversations)
    .set({ assignedUserId, assignedAt: assignedUserId ? new Date() : null, updatedAt: new Date() })
    .where(and(eq(whatsappConversations.tenantId, tenantId), eq(whatsappConversations.id, conversationId)))
    .returning();
  if (saved) {
    await emitRealtimeInboxEvent({
      eventType: "conversation.assigned",
      tenantId,
      conversationId,
      changedFields: ["assignedUserId"],
    });
    await persistConversationDomainEvent({
      tenantId,
      branchId: saved.branchId,
      channelId: saved.channelId,
      conversationId,
      customerId: saved.customerId,
      eventType: "whatsapp.conversation.assigned",
      payload: { assignedUserId: saved.assignedUserId },
    });
  }
  return saved || null;
}

export async function sendConversationWhatsAppMessage(input: {
  tenantId: number;
  conversationId: number;
  executedByUserId: number;
  text: string;
  branchId?: number | null;
}) {
  const conversation = await getConversationByIdScoped(input.tenantId, input.conversationId, input.branchId ?? null);
  if (!conversation) throw new Error("Conversación no encontrada");

  const channel = await getTenantChannel(input.tenantId);
  if (!channel || !channel.isActive) throw new Error("Canal WhatsApp no activo para el tenant");

  const windowOpen = isWithin24hWindow(conversation.lastInboundAt);
  const target = resolveWhatsAppReplyTarget(channel, {
    conversationId: conversation.id,
    conversationCustomerPhone: conversation.customerPhone,
    conversationCanonicalPhone: conversation.recipientPhoneCanonical,
    conversationWaId: conversation.recipientWaId,
    mode: "manual_text",
  });


  const canonicalFromConversation = getConversationCanonicalRecipient(conversation);
  if (!canonicalFromConversation || canonicalFromConversation !== target.to) {
    waLog("reply_manual_target_mismatch", {
      conversationId: conversation.id,
      storedConversationPhone: conversation.customerPhone,
      storedCanonicalPhone: conversation.recipientPhoneCanonical,
      resolvedTarget: target.to,
      expectedCanonicalTarget: canonicalFromConversation,
    });
    throw new WhatsAppProviderError(
      "Conversation recipient mismatch",
      400,
      {
        error: {
          code: 422002,
          message: "El destinatario del chat es inconsistente.",
          error_data: { details: "No se envió el mensaje para evitar envío cruzado entre conversaciones." },
        },
      },
    );
  }
  waLog("reply_manual_start", {
    conversationId: conversation.id,
    channelId: conversation.channelId,
    storedConversationPhone: conversation.customerPhone,
    storedCanonicalPhone: conversation.recipientPhoneCanonical,
    storedWaId: conversation.recipientWaId,
    resolvedTarget: target.to,
    targetSource: target.source,
    sandboxOverrideApplied: target.sandboxOverrideApplied,
    environmentMode: target.environmentMode,
    windowOpen,
    modeUsed: windowOpen ? "text_freeform" : "blocked_window_closed",
  });

  if (!windowOpen) {
    await persistWebhookEvent({
      tenantId: input.tenantId,
      channelId: channel.id,
      eventType: "manual_inbox_send_blocked",
      payload: {
        conversationId: conversation.id,
        originalRecipient: conversation.customerPhone,
        resolvedTarget: target.to,
        reason: "window_closed",
      },
      processingStatus: "FAILED",
      errorMessage: "window_closed_24h",
    });
    throw new WhatsAppWindowClosedError();
  }

  assertSandboxRecipientAllowed(channel, target.to);
  const provider = resolveWhatsappProvider(channel.provider);
  const result = await provider.sendTextMessage(channel, target.to, input.text);

  waLog("reply_manual_meta_response", {
    conversationId: conversation.id,
    modeUsed: "text_freeform",
    resolvedTarget: target.to,
    raw: result.raw,
  });

  const message = await createOutboundMessage({
    tenantId: input.tenantId,
    conversationId: conversation.id,
    channelId: channel.id,
    senderUserId: input.executedByUserId,
    providerMessageId: result.providerMessageId || null,
    contentText: input.text,
    status: result.mocked ? "QUEUED" : "SENT",
    rawPayload: { modeUsed: "text_freeform", normalizedTo: target.to, targetSource: target.source, providerRaw: result.raw },
  });

  await persistWebhookEvent({
    tenantId: input.tenantId,
    channelId: channel.id,
    eventType: "manual_inbox_send",
    payload: {
      conversationId: conversation.id,
      storedConversationPhone: conversation.customerPhone,
      storedCanonicalPhone: conversation.recipientPhoneCanonical,
      resolvedTarget: target.to,
      text: input.text,
      modeUsed: "text_freeform",
      executedByUserId: input.executedByUserId,
      result,
    },
    processingStatus: "PROCESSED",
  });

  await emitRealtimeInboxEvent({
    eventType: "message.created",
    tenantId: input.tenantId,
    conversationId: conversation.id,
    messageId: message.id,
    changedFields: ["lastOutboundAt", "lastMessageAt"],
  });
  await emitRealtimeInboxEvent({
    eventType: "conversation.updated",
    tenantId: input.tenantId,
    conversationId: conversation.id,
    changedFields: ["lastOutboundAt", "lastMessageAt"],
  });
  await persistConversationDomainEvent({
    tenantId: input.tenantId,
    branchId: conversation.branchId,
    channelId: conversation.channelId,
    conversationId: conversation.id,
    messageId: message.id,
    customerId: conversation.customerId,
    actorUserId: input.executedByUserId,
    eventType: "whatsapp.message.outbound",
    payload: { modeUsed: "text_freeform", text: input.text },
  });

  return { conversation, message, result, normalizedTo: target.to, modeUsed: "text_freeform", windowOpen: true, targetSource: target.source };
}


export async function sendConversationTemplateMessage(input: {
  tenantId: number;
  conversationId: number;
  executedByUserId: number;
  templateCode: string;
  branchId?: number | null;
}) {
  const conversation = await getConversationByIdScoped(input.tenantId, input.conversationId, input.branchId ?? null);
  if (!conversation) throw new Error("Conversación no encontrada");

  const channel = await getTenantChannel(input.tenantId);
  if (!channel || !channel.isActive) throw new Error("Canal WhatsApp no activo para el tenant");

  const provider = resolveWhatsappProvider(channel.provider);
  const target = resolveWhatsAppReplyTarget(channel, {
    conversationId: conversation.id,
    conversationCustomerPhone: conversation.customerPhone,
    conversationCanonicalPhone: conversation.recipientPhoneCanonical,
    conversationWaId: conversation.recipientWaId,
    mode: "manual_template",
  });
  assertSandboxRecipientAllowed(channel, target.to);


  const canonicalFromConversation = getConversationCanonicalRecipient(conversation);
  if (!canonicalFromConversation || canonicalFromConversation !== target.to) {
    waLog("reply_manual_target_mismatch", {
      conversationId: conversation.id,
      storedConversationPhone: conversation.customerPhone,
      storedCanonicalPhone: conversation.recipientPhoneCanonical,
      resolvedTarget: target.to,
      expectedCanonicalTarget: canonicalFromConversation,
    });
    throw new WhatsAppProviderError(
      "Conversation recipient mismatch",
      400,
      {
        error: {
          code: 422002,
          message: "El destinatario del chat es inconsistente.",
          error_data: { details: "No se envió el mensaje para evitar envío cruzado entre conversaciones." },
        },
      },
    );
  }
  waLog("reply_manual_start", {
    conversationId: conversation.id,
    channelId: conversation.channelId,
    storedConversationPhone: conversation.customerPhone,
    storedCanonicalPhone: conversation.recipientPhoneCanonical,
    storedWaId: conversation.recipientWaId,
    resolvedTarget: target.to,
    targetSource: target.source,
    sandboxOverrideApplied: target.sandboxOverrideApplied,
    environmentMode: target.environmentMode,
    windowOpen: isWithin24hWindow(conversation.lastInboundAt),
    modeUsed: "template_manual",
    templateCode: input.templateCode,
  });

  const result = await provider.sendTemplateMessage(channel, target.to, input.templateCode, [], "en_US");

  const message = await createOutboundMessage({
    tenantId: input.tenantId,
    conversationId: conversation.id,
    channelId: channel.id,
    senderUserId: input.executedByUserId,
    providerMessageId: result.providerMessageId || null,
    contentText: `[template:${input.templateCode}]`,
    status: result.mocked ? "QUEUED" : "SENT",
    rawPayload: { modeUsed: "template_manual", templateCode: input.templateCode, normalizedTo: target.to, targetSource: target.source, providerRaw: result.raw },
  });

  await persistWebhookEvent({
    tenantId: input.tenantId,
    channelId: channel.id,
    eventType: "manual_inbox_send_template",
    payload: {
      conversationId: conversation.id,
      storedConversationPhone: conversation.customerPhone,
      storedCanonicalPhone: conversation.recipientPhoneCanonical,
      resolvedTarget: target.to,
      targetSource: target.source,
            templateCode: input.templateCode,
      modeUsed: "template_manual",
      executedByUserId: input.executedByUserId,
      result,
    },
    processingStatus: "PROCESSED",
  });

  await emitRealtimeInboxEvent({
    eventType: "message.created",
    tenantId: input.tenantId,
    conversationId: conversation.id,
    messageId: message.id,
    changedFields: ["lastOutboundAt", "lastMessageAt"],
  });
  await emitRealtimeInboxEvent({
    eventType: "conversation.updated",
    tenantId: input.tenantId,
    conversationId: conversation.id,
    changedFields: ["lastOutboundAt", "lastMessageAt"],
  });
  await persistConversationDomainEvent({
    tenantId: input.tenantId,
    branchId: conversation.branchId,
    channelId: conversation.channelId,
    conversationId: conversation.id,
    messageId: message.id,
    customerId: conversation.customerId,
    actorUserId: input.executedByUserId,
    eventType: "whatsapp.message.outbound",
    payload: { modeUsed: "template_manual", templateCode: input.templateCode },
  });

  return { conversation, message, result, normalizedTo: target.to, modeUsed: "template_manual", windowOpen: isWithin24hWindow(conversation.lastInboundAt), targetSource: target.source };
}

export async function listConversationsByTenant(tenantId: number, branchId?: number | null) {
  const conditions = [eq(whatsappConversations.tenantId, tenantId)];
  if (branchId) conditions.push(eq(whatsappConversations.branchId, branchId));
  return db.select().from(whatsappConversations).where(and(...conditions)).orderBy(desc(whatsappConversations.lastMessageAt), desc(whatsappConversations.createdAt));
}

export async function listMessagesByConversation(tenantId: number, conversationId: number) {
  return db
    .select()
    .from(whatsappMessages)
    .where(and(eq(whatsappMessages.tenantId, tenantId), eq(whatsappMessages.conversationId, conversationId)))
    .orderBy(asc(whatsappMessages.createdAt));
}



export function computeChannelProductStatus(channel: TenantWhatsappChannel | null, environmentMode: ChannelEnvironmentMode): ChannelProductStatus {
  if (!channel) return "not_configured";
  if (channel.status === "ERROR") return "error";
  if (!channel.isActive) return "incomplete";
  if (!channel.phoneNumberId || !channel.phoneNumber) return "incomplete";
  return environmentMode === "sandbox" ? "sandbox_ready" : "production_ready";
}

export async function getSuggestedTemplatesForConversation(tenantId: number, conversationId: number, usageType?: string) {
  const conversation = await getConversationByIdScoped(tenantId, conversationId, null);
  if (!conversation) return [];
  const windowOpen = isWithin24hWindow(conversation.lastInboundAt);
  const rows = await db.select().from(messageTemplates).where(eq(messageTemplates.tenantId, tenantId)).orderBy(desc(messageTemplates.updatedAt));
  const normalizedUsage = usageType ? normalizeTemplateUsageType(usageType) : null;
  const inferred = rows.map((t) => {
    const mapped = normalizeTemplateUsageType((t as any).usageType || inferTemplateUsageType(t.key, t.body));
    return { ...t, usageType: mapped };
  });
  const windowFiltered = inferred.filter((tpl) => {
    if (windowOpen) return tpl.usageType !== "reengagement";
    return tpl.usageType === "reengagement" || tpl.usageType === "handoff_human";
  });
  return normalizedUsage ? windowFiltered.filter((tpl) => tpl.usageType === normalizedUsage) : windowFiltered;
}

export async function getLastManualSendEvent(tenantId: number) {
  const [event] = await db
    .select()
    .from(whatsappWebhookEvents)
    .where(and(eq(whatsappWebhookEvents.tenantId, tenantId), eq(whatsappWebhookEvents.eventType, "manual_send")))
    .orderBy(desc(whatsappWebhookEvents.createdAt))
    .limit(1);
  return event || null;
}

export async function getTenantChannel(tenantId: number) {
  const [channel] = await db.select().from(tenantWhatsappChannels).where(eq(tenantWhatsappChannels.tenantId, tenantId)).orderBy(desc(tenantWhatsappChannels.updatedAt)).limit(1);
  return channel || null;
}

export async function upsertTenantChannel(tenantId: number, payload: {
  branchId?: number | null;
  provider?: string;
  phoneNumber: string;
  phoneNumberId: string;
  businessAccountId?: string | null;
  displayName?: string | null;
  accessToken?: string | null;
  appSecret?: string | null;
  webhookVerifyToken?: string | null;
  status?: string;
  isActive?: boolean;
  environmentMode?: ChannelEnvironmentMode;
  sandboxRecipientPhone?: string | null;
  connectedBusinessPhone?: string | null;
  sandboxAllowedRecipients?: string[] | null;
  markConnectionValidatedAt?: boolean;
}) {
  const existing = await getTenantChannel(tenantId);
  const now = new Date();
  const values: Partial<TenantWhatsappChannel> = {
    branchId: payload.branchId ?? null,
    provider: payload.provider || "meta",
    phoneNumber: normalizePhone(payload.phoneNumber),
    phoneNumberId: payload.phoneNumberId,
    businessAccountId: payload.businessAccountId || null,
    displayName: payload.displayName || null,
    status: payload.status || "DRAFT",
    isActive: Boolean(payload.isActive),
    updatedAt: now,
  };

  const incomingAccessToken = payload.accessToken ?? null;
  const incomingAppSecret = payload.appSecret ?? null;
  const incomingVerifyToken = payload.webhookVerifyToken ?? null;

  const shouldReplaceAccessToken = Boolean(incomingAccessToken && !isMaskedSecretValue(incomingAccessToken));
  const shouldReplaceAppSecret = Boolean(incomingAppSecret && !isMaskedSecretValue(incomingAppSecret));
  const shouldReplaceVerifyToken = Boolean(incomingVerifyToken && !isMaskedSecretValue(incomingVerifyToken));

  if (shouldReplaceAccessToken) values.accessTokenEncrypted = encryptSecret(incomingAccessToken);
  if (shouldReplaceAppSecret) values.appSecretEncrypted = encryptSecret(incomingAppSecret);
  if (shouldReplaceVerifyToken) values.webhookVerifyTokenEncrypted = encryptSecret(incomingVerifyToken);
  if (!existing && !values.webhookVerifyTokenEncrypted) {
    values.webhookVerifyTokenEncrypted = encryptSecret(generateWebhookVerifyToken());
  }

  waLog("upsert_channel_secret_source", {
    tenantId,
    replaceAccessToken: shouldReplaceAccessToken,
    replaceAppSecret: shouldReplaceAppSecret,
    replaceVerifyToken: shouldReplaceVerifyToken,
  });


  const previousMetadata = readChannelMetadata(existing);
  values.metadataJson = {
    ...(existing?.metadataJson && typeof existing.metadataJson === "object" ? existing.metadataJson as any : {}),
    environmentMode: payload.environmentMode || previousMetadata.environmentMode || defaultEnvironmentMode(),
    sandboxRecipientPhone: payload.sandboxRecipientPhone !== undefined ? normalizePhone(payload.sandboxRecipientPhone) : (previousMetadata.sandboxRecipientPhone || null),
    connectedBusinessPhone: payload.connectedBusinessPhone !== undefined ? normalizePhone(payload.connectedBusinessPhone) : (previousMetadata.connectedBusinessPhone || normalizePhone(payload.phoneNumber)),
    lastSuccessfulTestAt: previousMetadata.lastSuccessfulTestAt || null,
    lastConnectionValidatedAt: payload.markConnectionValidatedAt ? new Date().toISOString() : (previousMetadata.lastConnectionValidatedAt || null),
    sandboxAllowedRecipients: payload.sandboxAllowedRecipients !== undefined
      ? normalizeAllowedRecipients(payload.sandboxAllowedRecipients)
      : (previousMetadata.sandboxAllowedRecipients || []),
  };

  waLog("onboarding_state", {
    tenantId,
    environmentMode: (values.metadataJson as any)?.environmentMode,
    channelProductStatus: computeChannelProductStatus(existing || null, ((values.metadataJson as any)?.environmentMode || defaultEnvironmentMode())),
  });

  if (existing) {
    const [updated] = await db.update(tenantWhatsappChannels).set(values).where(eq(tenantWhatsappChannels.id, existing.id)).returning();
    return updated;
  }

  const [created] = await db.insert(tenantWhatsappChannels).values({
    tenantId,
    provider: values.provider || "meta",
    phoneNumber: values.phoneNumber || "",
    phoneNumberId: values.phoneNumberId || "",
    branchId: values.branchId || null,
    businessAccountId: values.businessAccountId || null,
    displayName: values.displayName || null,
    accessTokenEncrypted: values.accessTokenEncrypted || null,
    appSecretEncrypted: values.appSecretEncrypted || null,
    webhookVerifyTokenEncrypted: values.webhookVerifyTokenEncrypted || null,
    status: values.status || "DRAFT",
    isActive: Boolean(values.isActive),
    metadataJson: values.metadataJson || {},
    updatedAt: now,
  }).returning();
  return created;
}

export async function sendTestWhatsAppMessage(input: {
  tenantId: number;
  executedByUserId: number;
  to: string;
  text: string;
}) {
  const channel = await getTenantChannel(input.tenantId);
  if (!channel || !channel.isActive) {
    throw new Error("Canal WhatsApp no activo para el tenant");
  }

  const runtime = getChannelRuntimeInfo(channel);
  const productionTestMode = (process.env.WHATSAPP_SEND_TEST_MODE_PRODUCTION || "text_freeform").toLowerCase();
  const mode = runtime.environmentMode === "sandbox"
    ? "template_hello_world_test"
    : (productionTestMode === "template_hello_world_test" ? "template_hello_world_test" : "text_freeform");
  const target = resolveWhatsAppReplyTarget(channel, {
    conversationId: 0,
    conversationCustomerPhone: input.to,
    conversationCanonicalPhone: input.to,
    mode: "send_test",
    overrideTo: input.to,
  });
  const normalizedTo = target.to;
  const { conversation } = await findOrCreateConversation({
    tenantId: input.tenantId,
    branchId: channel.branchId,
    channelId: channel.id,
    customerPhone: normalizedTo,
    recipientPhoneCanonical: normalizedTo,
  });

  const provider = resolveWhatsappProvider(channel.provider);
  assertSandboxRecipientAllowed(channel, target.to);

  waLog("send_test_start", {
    originalRecipientInput: input.to,
    resolvedTarget: target.to,
    phoneNumberId: channel.phoneNumberId,
    businessAccountId: channel.businessAccountId,
    accessTokenSource: channel.accessTokenEncrypted ? "db_encrypted" : "missing",
    environmentMode: runtime.environmentMode,
    modeRequested: mode,
  });

  try {
    const result = mode === "text_freeform"
      ? await provider.sendTextMessage(channel, normalizedTo, input.text)
      : await provider.sendTemplateMessage(channel, normalizedTo, "hello_world", [], "en_US");

    waLog("send_test_meta_response", {
      status: "ok",
      modeUsed: mode === "text_freeform" ? "text_freeform" : "template_hello_world_test",
      payloadSent: {
        messaging_product: "whatsapp",
        to: normalizedTo,
        type: mode === "text_freeform" ? "text" : "template",
        templateName: mode === "text_freeform" ? undefined : "hello_world",
        templateLang: mode === "text_freeform" ? undefined : "en_US",
      },
      raw: result.raw,
    });

    const message = await createOutboundMessage({
      tenantId: input.tenantId,
      conversationId: conversation.id,
      channelId: channel.id,
      senderUserId: input.executedByUserId,
      providerMessageId: result.providerMessageId || null,
      contentText: mode === "text_freeform" ? input.text : "[template:hello_world]",
      status: result.mocked ? "QUEUED" : "SENT",
      rawPayload: {
        modeUsed: mode === "text_freeform" ? "text_freeform" : "template_hello_world_test",
        normalizedTo,
        providerRaw: result.raw,
      },
    });

    await persistWebhookEvent({
      tenantId: input.tenantId,
      channelId: channel.id,
      eventType: "manual_send",
      payload: {
        originalRecipientInput: input.to,
        normalizedTo,
        text: input.text,
        result,
        modeUsed: mode === "text_freeform" ? "text_freeform" : "template_hello_world_test",
        executedByUserId: input.executedByUserId,
      },
      processingStatus: "PROCESSED",
    });
    await db
      .update(tenantWhatsappChannels)
      .set({
        metadataJson: {
          ...(channel.metadataJson && typeof channel.metadataJson === "object" ? channel.metadataJson as any : {}),
          ...readChannelMetadata(channel),
          lastSuccessfulTestAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(eq(tenantWhatsappChannels.id, channel.id));

    return {
      channel,
      conversation,
      message,
      result,
      modeUsed: mode === "text_freeform" ? "text_freeform" : "template_hello_world_test",
      normalizedTo,
      messageId: result.providerMessageId || null,
    };
  } catch (error: any) {
    const providerError = error as WhatsAppProviderError;
    waLog("send_test_meta_response", {
      status: "error",
      modeUsed: mode === "text_freeform" ? "text_freeform" : "template_hello_world_test",
      payloadSent: {
        messaging_product: "whatsapp",
        to: normalizedTo,
        type: mode === "text_freeform" ? "text" : "template",
        templateName: mode === "text_freeform" ? undefined : "hello_world",
        templateLang: mode === "text_freeform" ? undefined : "en_US",
      },
      responseStatus: providerError?.status,
      responseBody: providerError?.raw,
    });

    await persistWebhookEvent({
      tenantId: input.tenantId,
      channelId: channel.id,
      eventType: "manual_send_failed",
      payload: {
        originalRecipientInput: input.to,
        normalizedTo,
        modeUsed: mode === "text_freeform" ? "text_freeform" : "template_hello_world_test",
        providerError: {
          status: providerError?.status || null,
          code: providerError?.code || null,
          details: providerError?.details || providerError?.message || "unknown",
          raw: providerError?.raw || null,
        },
        executedByUserId: input.executedByUserId,
      },
      processingStatus: "FAILED",
      errorMessage: providerError?.details || providerError?.message || "send_test_failed",
    });

    throw error;
  }
}

export function channelToSafeResponse(channel: TenantWhatsappChannel | null) {
  if (!channel) return null;
  const runtime = getChannelRuntimeInfo(channel);
  return {
    ...channel,
    ...runtime,
    accessToken: maskSecret(decryptSecret(channel.accessTokenEncrypted)),
    appSecret: maskSecret(decryptSecret(channel.appSecretEncrypted)),
    webhookVerifyToken: maskSecret(decryptSecret(channel.webhookVerifyTokenEncrypted)),
  };
}

export function isWebhookSignatureValidationEnabled() {
  return String(process.env.WHATSAPP_VALIDATE_SIGNATURE || "").toLowerCase() === "true";
}


export async function updateConversationOperationalState(input: {
  tenantId: number;
  conversationId: number;
  actorUserId: number;
  branchId?: number | null;
  ownerMode?: ConversationOwnerMode;
  handoffStatus?: ConversationHandoffStatus;
  automationEnabled?: boolean;
  automationPausedReason?: string | null;
}) {
  const conversation = await getConversationByIdScoped(input.tenantId, input.conversationId, input.branchId ?? null);
  if (!conversation) return null;
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.ownerMode) patch.ownerMode = input.ownerMode;
  if (input.handoffStatus) patch.handoffStatus = input.handoffStatus;
  if (typeof input.automationEnabled === "boolean") patch.automationEnabled = input.automationEnabled;
  if (input.automationPausedReason !== undefined) patch.automationPausedReason = input.automationPausedReason;

  const [saved] = await db
    .update(whatsappConversations)
    .set(patch)
    .where(and(eq(whatsappConversations.tenantId, input.tenantId), eq(whatsappConversations.id, input.conversationId)))
    .returning();
  if (!saved) return null;

  await emitRealtimeInboxEvent({
    eventType: "conversation.updated",
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    changedFields: ["ownerMode", "handoffStatus", "automationEnabled", "automationPausedReason"],
  });
  await persistConversationDomainEvent({
    tenantId: input.tenantId,
    branchId: saved.branchId,
    channelId: saved.channelId,
    conversationId: saved.id,
    customerId: saved.customerId,
    actorUserId: input.actorUserId,
    eventType: "whatsapp.conversation.automation_updated",
    payload: {
      ownerMode: saved.ownerMode,
      handoffStatus: saved.handoffStatus,
      automationEnabled: saved.automationEnabled,
      automationPausedReason: saved.automationPausedReason,
    },
  });
  return saved;
}

export async function linkConversationToCustomer(input: {
  tenantId: number;
  conversationId: number;
  customerId: number;
  actorUserId: number;
  branchId?: number | null;
  manual?: boolean;
}) {
  const conversation = await getConversationByIdScoped(input.tenantId, input.conversationId, input.branchId ?? null);
  if (!conversation) throw new Error("Conversación no encontrada");
  const [customer] = await db.select().from(customers).where(and(eq(customers.tenantId, input.tenantId), eq(customers.id, input.customerId))).limit(1);
  if (!customer) throw new Error("Cliente no encontrado");

  const [saved] = await db
    .update(whatsappConversations)
    .set({
      customerId: customer.id,
      customerName: conversation.customerName || customer.name,
      customerMatchConfidence: input.manual === false ? 100 : 90,
      linkedManuallyByUserId: input.manual === false ? null : input.actorUserId,
      linkedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(whatsappConversations.tenantId, input.tenantId), eq(whatsappConversations.id, input.conversationId)))
    .returning();

  if (!saved) return null;

  await emitRealtimeInboxEvent({
    eventType: "conversation.updated",
    tenantId: input.tenantId,
    conversationId: saved.id,
    changedFields: ["customerId", "customerName", "customerMatchConfidence", "linkedAt"],
  });

  await persistConversationDomainEvent({
    tenantId: input.tenantId,
    branchId: saved.branchId,
    channelId: saved.channelId,
    conversationId: saved.id,
    customerId: saved.customerId,
    actorUserId: input.actorUserId,
    eventType: "whatsapp.customer.linked",
    payload: { customerId: customer.id, phone: customer.phone, manual: input.manual !== false },
  });

  return saved;
}

export async function findCustomerMatchesByPhone(tenantId: number, phone: string) {
  const normalized = normalizeWhatsAppRecipientForMeta(phone);
  if (!normalized) return [];
  const rows = await db.select().from(customers).where(eq(customers.tenantId, tenantId)).orderBy(desc(customers.updatedAt));
  return rows
    .filter((c) => normalizeWhatsAppRecipientForMeta(c.phone || "") === normalized)
    .slice(0, 8);
}

export async function createCustomerFromConversation(input: {
  tenantId: number;
  conversationId: number;
  actorUserId: number;
  name?: string | null;
  email?: string | null;
  branchId?: number | null;
}) {
  const conversation = await getConversationByIdScoped(input.tenantId, input.conversationId, input.branchId ?? null);
  if (!conversation) throw new Error("Conversación no encontrada");

  const [created] = await db
    .insert(customers)
    .values({
      tenantId: input.tenantId,
      name: (input.name || conversation.customerName || `Cliente ${conversation.customerPhone}`).trim(),
      phone: conversation.customerPhone,
      email: input.email || null,
    })
    .returning();

  if (!created) throw new Error("No se pudo crear el cliente");
  const linked = await linkConversationToCustomer({
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    customerId: created.id,
    actorUserId: input.actorUserId,
    branchId: input.branchId,
    manual: true,
  });

  return { customer: created, conversation: linked };
}
