import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  tenantWhatsappChannels,
  whatsappConversations,
  whatsappMessages,
  whatsappWebhookEvents,
  type TenantWhatsappChannel,
} from "@shared/schema";
import { db } from "../db";
import { decryptSecret, encryptSecret, maskSecret } from "./whatsapp-crypto";
import { resolveWhatsappProvider } from "./whatsapp-provider";

function normalizePhone(phone?: string | null) {
  if (!phone) return "";
  return String(phone).replace(/[^\d+]/g, "").trim();
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

  if (payload.accessToken) values.accessTokenEncrypted = encryptSecret(payload.accessToken);
  if (payload.appSecret) values.appSecretEncrypted = encryptSecret(payload.appSecret);
  if (payload.webhookVerifyToken) values.webhookVerifyTokenEncrypted = encryptSecret(payload.webhookVerifyToken);

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
    metadataJson: {},
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

  const conversation = await findOrCreateConversation({
    tenantId: input.tenantId,
    branchId: channel.branchId,
    channelId: channel.id,
    customerPhone: input.to,
  });

  const provider = resolveWhatsappProvider(channel.provider);
  const result = await provider.sendTextMessage(channel, normalizePhone(input.to), input.text);

  const message = await createOutboundMessage({
    tenantId: input.tenantId,
    conversationId: conversation.id,
    channelId: channel.id,
    senderUserId: input.executedByUserId,
    providerMessageId: result.providerMessageId || null,
    contentText: input.text,
    status: result.mocked ? "QUEUED" : "SENT",
    rawPayload: result.raw,
  });

  await persistWebhookEvent({
    tenantId: input.tenantId,
    channelId: channel.id,
    eventType: "manual_send",
    payload: { to: input.to, text: input.text, result, executedByUserId: input.executedByUserId },
    processingStatus: "PROCESSED",
  });

  return { channel, conversation, message, result };
}

export function channelToSafeResponse(channel: TenantWhatsappChannel | null) {
  if (!channel) return null;
  return {
    ...channel,
    accessToken: maskSecret(decryptSecret(channel.accessTokenEncrypted)),
    appSecret: maskSecret(decryptSecret(channel.appSecretEncrypted)),
    webhookVerifyToken: maskSecret(decryptSecret(channel.webhookVerifyTokenEncrypted)),
  };
}

export function isWebhookSignatureValidationEnabled() {
  return String(process.env.WHATSAPP_VALIDATE_SIGNATURE || "").toLowerCase() === "true";
}
