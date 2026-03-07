import type { Express } from "express";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { tenantAuth, requireAddon, enforceBranchScope, requireTenantAdmin, blockBranchScope } from "../auth";
import { validateBody, validateParams } from "../middleware/validate";
import {
  channelToSafeResponse,
  getTenantChannel,
  isWebhookSignatureValidationEnabled,
  listConversationsByTenant,
  listMessagesByConversation,
  processIncomingWhatsAppWebhook,
  sendTestWhatsAppMessage,
  upsertTenantChannel,
  verifyMetaWebhookChallenge,
} from "../services/whatsapp-service";
import { db } from "../db";
import { whatsappConversations } from "@shared/schema";

const channelSchema = z.object({
  provider: z.string().trim().min(2).max(20).default("meta"),
  phoneNumber: z.string().trim().min(5).max(40),
  phoneNumberId: z.string().trim().min(3).max(120),
  businessAccountId: z.string().trim().max(120).optional().nullable(),
  displayName: z.string().trim().max(200).optional().nullable(),
  accessToken: z.string().trim().max(4000).optional().nullable(),
  appSecret: z.string().trim().max(4000).optional().nullable(),
  webhookVerifyToken: z.string().trim().max(4000).optional().nullable(),
  status: z.enum(["DRAFT", "ACTIVE", "DISABLED", "ERROR"]).default("DRAFT"),
  isActive: z.boolean().default(false),
  branchId: z.coerce.number().int().positive().optional().nullable(),
});

const sendSchema = z.object({
  to: z.string().trim().min(5).max(40),
  text: z.string().trim().min(1).max(4096),
});

const conversationIdSchema = z.object({ id: z.coerce.number().int().positive() });

export function registerWhatsappRoutes(app: Express) {
  app.get("/api/whatsapp/health", tenantAuth, requireAddon("messaging_whatsapp"), async (req, res) => {
    const channel = await getTenantChannel(req.auth!.tenantId!);
    res.json({ ok: true, signatureValidation: isWebhookSignatureValidationEnabled(), hasChannel: Boolean(channel), channelStatus: channel?.status || null });
  });

  app.get("/api/whatsapp/webhook", async (req, res) => {
    const mode = String(req.query["hub.mode"] || "");
    const verifyToken = String(req.query["hub.verify_token"] || "");
    const challenge = String(req.query["hub.challenge"] || "");
    const verified = await verifyMetaWebhookChallenge(mode, verifyToken, challenge);
    if (!verified) {
      return res.status(403).json({ error: "Webhook verification failed" });
    }
    return res.status(200).send(verified.challenge);
  });

  app.post("/api/whatsapp/webhook", async (req, res) => {
    const payload = req.body || {};
    const result = await processIncomingWhatsAppWebhook(payload);
    res.json({ ok: true, ...result });
  });

  app.get("/api/whatsapp/channels/current", tenantAuth, requireAddon("messaging_whatsapp"), async (req, res) => {
    const channel = await getTenantChannel(req.auth!.tenantId!);
    res.json({ data: channelToSafeResponse(channel) });
  });

  app.put(
    "/api/whatsapp/channels/current",
    tenantAuth,
    requireAddon("messaging_whatsapp"),
    requireTenantAdmin,
    blockBranchScope,
    validateBody(channelSchema),
    async (req, res) => {
      const saved = await upsertTenantChannel(req.auth!.tenantId!, req.body);
      res.json({ data: channelToSafeResponse(saved) });
    },
  );

  app.post("/api/whatsapp/channels/test-connection", tenantAuth, requireAddon("messaging_whatsapp"), requireTenantAdmin, async (req, res) => {
    const channel = await getTenantChannel(req.auth!.tenantId!);
    if (!channel) return res.status(404).json({ error: "Canal no configurado" });
    const healthy = Boolean(channel.phoneNumberId && channel.accessTokenEncrypted);
    res.json({ ok: healthy, details: { provider: channel.provider, status: channel.status, isActive: channel.isActive } });
  });

  app.get("/api/whatsapp/conversations", tenantAuth, requireAddon("messaging_whatsapp"), enforceBranchScope, async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const branchId = req.auth!.scope === "BRANCH" ? req.auth!.branchId : null;
    const data = await listConversationsByTenant(tenantId, branchId);
    res.json({ data });
  });

  app.get(
    "/api/whatsapp/conversations/:id/messages",
    tenantAuth,
    requireAddon("messaging_whatsapp"),
    enforceBranchScope,
    validateParams(conversationIdSchema),
    async (req, res) => {
      const tenantId = req.auth!.tenantId!;
      const id = Number(req.params.id);
      const branchId = req.auth!.scope === "BRANCH" ? req.auth!.branchId : null;
      const whereClause = branchId
        ? and(eq(whatsappConversations.id, id), eq(whatsappConversations.tenantId, tenantId), eq(whatsappConversations.branchId, branchId))
        : and(eq(whatsappConversations.id, id), eq(whatsappConversations.tenantId, tenantId));
      const [conversation] = await db.select().from(whatsappConversations).where(whereClause).limit(1);
      if (!conversation) return res.status(404).json({ error: "Conversación no encontrada" });
      const data = await listMessagesByConversation(tenantId, id);
      res.json({ data });
    },
  );

  app.post("/api/whatsapp/messages/send-test", tenantAuth, requireAddon("messaging_whatsapp"), requireTenantAdmin, validateBody(sendSchema), async (req, res) => {
    const result = await sendTestWhatsAppMessage({
      tenantId: req.auth!.tenantId!,
      executedByUserId: req.auth!.userId,
      to: req.body.to,
      text: req.body.text,
    });
    res.json({ data: result });
  });

  app.post(
    "/api/whatsapp/conversations/:id/messages/send",
    tenantAuth,
    requireAddon("messaging_whatsapp"),
    validateParams(conversationIdSchema),
    validateBody(z.object({ text: z.string().trim().min(1).max(4096) })),
    async (req, res) => {
      const tenantId = req.auth!.tenantId!;
      const conversationId = Number(req.params.id);
      const [conversation] = await db
        .select()
        .from(whatsappConversations)
        .where(and(eq(whatsappConversations.id, conversationId), eq(whatsappConversations.tenantId, tenantId)))
        .limit(1);
      if (!conversation) return res.status(404).json({ error: "Conversación no encontrada" });

      const result = await sendTestWhatsAppMessage({
        tenantId,
        executedByUserId: req.auth!.userId,
        to: conversation.customerPhone,
        text: req.body.text,
      });

      res.json({ data: result });
    },
  );
}
