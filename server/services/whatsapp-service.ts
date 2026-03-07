import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  tenantWhatsappChannels,
  whatsappConversations,
  whatsappMessages,
  whatsappWebhookEvents,
  messageTemplates,
  type TenantWhatsappChannel,
} from "@shared/schema";
import { db } from "../db";
import { decryptSecret, encryptSecret, isMaskedSecretValue, maskSecret } from "./whatsapp-crypto";
import { WhatsAppProviderError, resolveWhatsappProvider } from "./whatsapp-provider";

function isWhatsappDebugEnabled() {
  return String(process.env.WHATSAPP_DEBUG_LOGS || "").toLowerCase() === "true";
}

function waLog(...args: unknown[]) {
  if (!isWhatsappDebugEnabled()) return;
  console.log("[WA]", ...args);
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
};

function readChannelMetadata(channel?: TenantWhatsappChannel | null): ChannelMetadata {
  const raw = (channel?.metadataJson && typeof channel.metadataJson === "object") ? channel.metadataJson as any : {};
  return {
    environmentMode: raw.environmentMode === "production" ? "production" : raw.environmentMode === "sandbox" ? "sandbox" : undefined,
    sandboxRecipientPhone: raw.sandboxRecipientPhone ? normalizePhone(String(raw.sandboxRecipientPhone)) : null,
    connectedBusinessPhone: raw.connectedBusinessPhone ? normalizePhone(String(raw.connectedBusinessPhone)) : null,
    lastSuccessfulTestAt: raw.lastSuccessfulTestAt ? String(raw.lastSuccessfulTestAt) : null,
    lastConnectionValidatedAt: raw.lastConnectionValidatedAt ? String(raw.lastConnectionValidatedAt) : null,
  };
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
}) {
  const customerPhone = normalizePhone(input.customerPhone);
  const [found] = await db
    .select()
    .from(whatsappConversations)
    .where(
      and(
        eq(whatsappConversations.tenantId, input.tenantId),
        eq(whatsappConversations.channelId, input.channelId),
        eq(whatsappConversations.customerPhone, customerPhone),
      ),
    )
    .limit(1);

  if (found) return found;

  const [created] = await db
    .insert(whatsappConversations)
    .values({
      tenantId: input.tenantId,
      branchId: input.branchId || null,
      channelId: input.channelId,
      customerPhone,
      customerName: input.customerName || null,
      status: "OPEN",
      unreadCount: 0,
      lastMessageAt: new Date(),
    })
    .returning();
  return created;
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
    .set({ lastOutboundAt: now, lastMessageAt: now, updatedAt: now })
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

        const conversation = await findOrCreateConversation({
          tenantId: channel.tenantId,
          branchId: channel.branchId,
          channelId: channel.id,
          customerPhone: from,
          customerName: name,
        });

        if (messageType === "TEXT") {
          await createInboundMessage({
            tenantId: channel.tenantId,
            conversationId: conversation.id,
            channelId: channel.id,
            providerMessageId: event.value?.id,
            contentText: text,
            customerName: name,
            rawPayload: event,
            messageType,
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

        if (providerMessageId) {
          await db
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
            );
        }

        await db
          .update(whatsappWebhookEvents)
          .set({
            processingStatus: status === "FAILED" ? "FAILED" : "PROCESSED",
            errorMessage: status === "FAILED" ? `status_failed:${code || "unknown"}:${details || "n/a"}` : null,
            processedAt: new Date(),
          })
          .where(eq(whatsappWebhookEvents.id, baseEvent.id));

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
  return saved || null;
}

export async function updateConversationStatus(tenantId: number, conversationId: number, status: "OPEN" | "HUMAN" | "BOT" | "CLOSED") {
  const [saved] = await db
    .update(whatsappConversations)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(whatsappConversations.tenantId, tenantId), eq(whatsappConversations.id, conversationId)))
    .returning();
  return saved || null;
}

export async function assignConversationToUser(tenantId: number, conversationId: number, assignedUserId: number | null) {
  const [saved] = await db
    .update(whatsappConversations)
    .set({ assignedUserId, updatedAt: new Date() })
    .where(and(eq(whatsappConversations.tenantId, tenantId), eq(whatsappConversations.id, conversationId)))
    .returning();
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
  const normalizedTo = normalizeWhatsAppRecipientForMeta(conversation.customerPhone);

  waLog("reply_manual_start", {
    conversationId: conversation.id,
    originalRecipient: conversation.customerPhone,
    normalizedRecipient: normalizedTo,
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
        normalizedRecipient: normalizedTo,
        reason: "window_closed",
      },
      processingStatus: "FAILED",
      errorMessage: "window_closed_24h",
    });
    throw new WhatsAppWindowClosedError();
  }

  const provider = resolveWhatsappProvider(channel.provider);
  const result = await provider.sendTextMessage(channel, normalizedTo, input.text);

  waLog("reply_manual_meta_response", {
    conversationId: conversation.id,
    modeUsed: "text_freeform",
    normalizedRecipient: normalizedTo,
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
    rawPayload: { modeUsed: "text_freeform", normalizedTo, providerRaw: result.raw },
  });

  await persistWebhookEvent({
    tenantId: input.tenantId,
    channelId: channel.id,
    eventType: "manual_inbox_send",
    payload: {
      conversationId: conversation.id,
      originalRecipient: conversation.customerPhone,
      normalizedRecipient: normalizedTo,
      text: input.text,
      modeUsed: "text_freeform",
      executedByUserId: input.executedByUserId,
      result,
    },
    processingStatus: "PROCESSED",
  });

  return { conversation, message, result, normalizedTo, modeUsed: "text_freeform", windowOpen: true };
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
  const normalizedTo = normalizeWhatsAppRecipientForMeta(conversation.customerPhone);

  waLog("reply_manual_start", {
    conversationId: conversation.id,
    originalRecipient: conversation.customerPhone,
    normalizedRecipient: normalizedTo,
    windowOpen: isWithin24hWindow(conversation.lastInboundAt),
    modeUsed: "template_manual",
    templateCode: input.templateCode,
  });

  const result = await provider.sendTemplateMessage(channel, normalizedTo, input.templateCode, [], "en_US");

  const message = await createOutboundMessage({
    tenantId: input.tenantId,
    conversationId: conversation.id,
    channelId: channel.id,
    senderUserId: input.executedByUserId,
    providerMessageId: result.providerMessageId || null,
    contentText: `[template:${input.templateCode}]`,
    status: result.mocked ? "QUEUED" : "SENT",
    rawPayload: { modeUsed: "template_manual", templateCode: input.templateCode, normalizedTo, providerRaw: result.raw },
  });

  await persistWebhookEvent({
    tenantId: input.tenantId,
    channelId: channel.id,
    eventType: "manual_inbox_send_template",
    payload: {
      conversationId: conversation.id,
      originalRecipient: conversation.customerPhone,
      normalizedRecipient: normalizedTo,
      templateCode: input.templateCode,
      modeUsed: "template_manual",
      executedByUserId: input.executedByUserId,
      result,
    },
    processingStatus: "PROCESSED",
  });

  return { conversation, message, result, normalizedTo, modeUsed: "template_manual", windowOpen: isWithin24hWindow(conversation.lastInboundAt) };
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

export async function getSuggestedTemplatesForConversation(tenantId: number, conversationId: number) {
  const conversation = await getConversationByIdScoped(tenantId, conversationId, null);
  if (!conversation) return [];
  const windowOpen = isWithin24hWindow(conversation.lastInboundAt);
  const rows = await db.select().from(messageTemplates).where(eq(messageTemplates.tenantId, tenantId)).orderBy(desc(messageTemplates.updatedAt));
  const inferred = rows.map((t) => {
    const key = String(t.key || "").toLowerCase();
    let usageType = "general";
    if (key.includes("saludo") || key.includes("greeting")) usageType = "greeting";
    else if (key.includes("reengagement") || key.includes("reenganche")) usageType = "reengagement";
    else if (key.includes("fallback") || key.includes("error")) usageType = "fallback";
    else if (key.includes("humano") || key.includes("derivacion")) usageType = "handoff_human";
    else if (key.includes("confirm")) usageType = "confirmation";
    else if (key.includes("pedido") || key.includes("seguimiento")) usageType = "order_followup";
    return { ...t, usageType };
  });
  return inferred.filter((t) => windowOpen ? t.usageType !== "reengagement" : t.usageType === "reengagement");
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
  const normalizedTo = normalizeWhatsAppRecipientForMeta(input.to);
  const conversation = await findOrCreateConversation({
    tenantId: input.tenantId,
    branchId: channel.branchId,
    channelId: channel.id,
    customerPhone: normalizedTo,
  });

  const provider = resolveWhatsappProvider(channel.provider);

  waLog("send_test_start", {
    originalRecipientInput: input.to,
    normalizedRecipient: normalizedTo,
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
