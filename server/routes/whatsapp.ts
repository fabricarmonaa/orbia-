import type { Express } from "express";
import { z } from "zod";
import { tenantAuth, requireAddon, enforceBranchScope, requireTenantAdmin, blockBranchScope } from "../auth";
import { validateBody, validateParams } from "../middleware/validate";
import {
  assignConversationToUser,
  channelToSafeResponse,
  getConversationByIdScoped,
  getTenantChannel,
  isWebhookSignatureValidationEnabled,
  listConversationsByTenant,
  listMessagesByConversation,
  markConversationAsRead,
  processIncomingWhatsAppWebhook,
  sendConversationWhatsAppMessage,
  sendTestWhatsAppMessage,
  updateConversationStatus,
  upsertTenantChannel,
  getLastManualSendEvent,
  isWithin24hWindow,
  WhatsAppWindowClosedError,
  getSuggestedTemplatesForConversation,
  sendConversationTemplateMessage,
  getChannelRuntimeInfo,
  createCustomerFromConversation,
  linkConversationToCustomer,
  listConversationTimeline,
  updateConversationOperationalState,
  findCustomerMatchesByPhone,
  CONVERSATION_OWNER_MODES,
  CONVERSATION_HANDOFF_STATUSES,
} from "../services/whatsapp-service";
import { WhatsAppProviderError } from "../services/whatsapp-provider";
import { storage } from "../storage";
import { and, eq, isNull } from "drizzle-orm";
import { users } from "@shared/schema";
import { db } from "../db";
import { whatsappRealtimeBus } from "../services/whatsapp-realtime";

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
  environmentMode: z.enum(["sandbox", "production"]).optional(),
  sandboxRecipientPhone: z.string().trim().max(40).optional().nullable(),
  connectedBusinessPhone: z.string().trim().max(40).optional().nullable(),
  sandboxAllowedRecipients: z.array(z.string().trim().min(5).max(40)).optional().nullable(),
});

const sendSchema = z.object({
  to: z.string().trim().min(5).max(40),
  text: z.string().trim().min(1).max(4096),
});

const conversationIdSchema = z.object({ id: z.coerce.number().int().positive() });
const sendTemplateSchema = z.object({ templateCode: z.string().trim().min(1).max(120) });

export function registerWhatsappRoutes(app: Express) {
  const internalSandboxEnabled = String(process.env.WHATSAPP_INTERNAL_SANDBOX || "").toLowerCase() === "true";
  const canUseSandbox = (req: any) => Boolean(req?.auth?.isSuperAdmin || req?.auth?.role === "admin" || internalSandboxEnabled);
  const runtimeForRequest = (_req: any, runtime: any) => runtime;
  app.get("/api/whatsapp/health", tenantAuth, requireAddon("messaging_whatsapp"), async (req, res) => {
    const channel = await getTenantChannel(req.auth!.tenantId!);
    const lastTest = await getLastManualSendEvent(req.auth!.tenantId!);
    const testMode = (process.env.WHATSAPP_SEND_TEST_MODE || "template_hello_world_test").toLowerCase();
    const runtime = runtimeForRequest(req, getChannelRuntimeInfo(channel));
    res.json({
      ok: true,
      signatureValidation: isWebhookSignatureValidationEnabled(),
      hasChannel: Boolean(channel),
      channelStatus: channel?.status || null,
      channelProductStatus: runtime.channelProductStatus,
      environmentMode: runtime.environmentMode,
      testMode,
      connectedPhone: runtime.connectedBusinessPhone || channel?.phoneNumber || null,
      sandboxRecipientPhone: runtime.sandboxRecipientPhone,
      businessAccountId: channel?.businessAccountId || null,
      lastTestAt: runtime.lastSuccessfulTestAt || lastTest?.createdAt || null,
      lastConnectionValidatedAt: runtime.lastConnectionValidatedAt || null,
      canEditTechnicalConfig: Boolean(req.auth?.role === "admin" || req.auth?.isSuperAdmin),
      sandboxAvailable: canUseSandbox(req),
    });
  });

  app.get("/api/whatsapp/webhook", async (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

    console.log("[WA WEBHOOK VERIFY] mode:", mode);
    console.log("[WA WEBHOOK VERIFY] received:", token);
    console.log("[WA WEBHOOK VERIFY] expected:", expected);

    if (mode === "subscribe" && token === expected) {
      return res.status(200).send(String(challenge));
    }

    return res.status(403).json({ error: "Webhook verification failed" });
  });

  app.post("/api/whatsapp/webhook", async (req, res) => {
    const payload = req.body || {};
    const result = await processIncomingWhatsAppWebhook(payload);
    res.json({ ok: true, ...result });
  });

  app.get("/api/whatsapp/channels/current", tenantAuth, requireAddon("messaging_whatsapp"), requireTenantAdmin, async (req, res) => {
    const channel = await getTenantChannel(req.auth!.tenantId!);
    res.json({ data: channelToSafeResponse(channel) });
  });


  app.get("/api/whatsapp/channels/summary", tenantAuth, requireAddon("messaging_whatsapp"), async (req, res) => {
    const channel = await getTenantChannel(req.auth!.tenantId!);
    const runtime = runtimeForRequest(req, getChannelRuntimeInfo(channel));
    const data = channel
      ? {
        status: channel.status,
        isActive: channel.isActive,
        connectedPhone: runtime.connectedBusinessPhone || channel.phoneNumber,
        sandboxRecipientPhone: runtime.sandboxRecipientPhone,
        environmentMode: runtime.environmentMode,
        channelProductStatus: runtime.channelProductStatus,
        lastSuccessfulTestAt: runtime.lastSuccessfulTestAt,
        lastConnectionValidatedAt: runtime.lastConnectionValidatedAt,
        sandboxAllowedRecipients: canUseSandbox(req) ? runtime.sandboxAllowedRecipients : [],
      }
      : {
        status: "DRAFT",
        isActive: false,
        connectedPhone: null,
        sandboxRecipientPhone: null,
        environmentMode: runtime.environmentMode,
        channelProductStatus: runtime.channelProductStatus,
        lastSuccessfulTestAt: null,
        lastConnectionValidatedAt: null,
        sandboxAllowedRecipients: [],
      };
    return res.json({ data });
  });


  app.get("/api/whatsapp/onboarding", tenantAuth, async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const [addonsRes, channelRes] = await Promise.all([
      storage.getTenantAddons(tenantId),
      getTenantChannel(tenantId),
    ]);
    const addonsMap: Record<string, boolean> = {};
    for (const a of addonsRes || []) addonsMap[a.addonKey] = Boolean(a.enabled);
    const messagingEnabled = Boolean(addonsMap.messaging_whatsapp);
    const inboxEnabled = Boolean(addonsMap.whatsapp_inbox);
    const runtime = runtimeForRequest(req, getChannelRuntimeInfo(channelRes));
    const steps = [
      { key: "activate_addons", title: "Activar addon Mensajería WhatsApp", completed: messagingEnabled },
      { key: "enable_inbox", title: "Activar addon WhatsApp Inbox", completed: inboxEnabled },
      { key: "connect_channel", title: runtime.environmentMode === "production" ? "Conectar número real del negocio" : "Configurar modo prueba", completed: Boolean(channelRes?.isActive) },
      { key: "validate_channel", title: "Validar canal", completed: Boolean(runtime.lastConnectionValidatedAt || runtime.lastSuccessfulTestAt) },
      { key: "use_inbox", title: "Operar inbox", completed: inboxEnabled && Boolean(channelRes?.isActive) },
    ];
    return res.json({
      data: {
        messagingEnabled,
        inboxEnabled,
        environmentMode: runtime.environmentMode,
        channelProductStatus: runtime.channelProductStatus,
        channelConnectedPhone: runtime.connectedBusinessPhone || channelRes?.phoneNumber || null,
        sandboxRecipientPhone: runtime.sandboxRecipientPhone,
        lastSuccessfulTestAt: runtime.lastSuccessfulTestAt,
        lastConnectionValidatedAt: runtime.lastConnectionValidatedAt,
        canEditTechnicalConfig: Boolean(req.auth?.role === "admin" || req.auth?.isSuperAdmin),
      sandboxAvailable: canUseSandbox(req),
        steps,
      },
    });
  });

  app.put(
    "/api/whatsapp/channels/current",
    tenantAuth,
    requireAddon("messaging_whatsapp"),
    requireTenantAdmin,
    blockBranchScope,
    validateBody(channelSchema),
    async (req, res) => {
      const payload = { ...req.body };
      if (!canUseSandbox(req)) {
        payload.environmentMode = "production";
        payload.sandboxRecipientPhone = null;
        payload.sandboxAllowedRecipients = [];
      }
      const saved = await upsertTenantChannel(req.auth!.tenantId!, payload);
      res.json({ data: channelToSafeResponse(saved) });
    },
  );

  app.post("/api/whatsapp/channels/test-connection", tenantAuth, requireAddon("messaging_whatsapp"), requireTenantAdmin, async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const channel = await getTenantChannel(tenantId);
    if (!channel) return res.status(404).json({ error: "Canal no configurado" });
    const healthy = Boolean(channel.phoneNumberId && channel.accessTokenEncrypted);
    if (healthy) {
      const safe = channelToSafeResponse(channel);
      await upsertTenantChannel(tenantId, {
        provider: channel.provider,
        phoneNumber: channel.phoneNumber,
        phoneNumberId: channel.phoneNumberId,
        businessAccountId: channel.businessAccountId,
        displayName: channel.displayName,
        accessToken: safe?.accessToken,
        appSecret: safe?.appSecret,
        webhookVerifyToken: safe?.webhookVerifyToken,
        status: channel.status,
        isActive: channel.isActive,
        environmentMode: canUseSandbox(req) ? safe?.environmentMode : "production",
        sandboxRecipientPhone: canUseSandbox(req) ? safe?.sandboxRecipientPhone : null,
        connectedBusinessPhone: safe?.connectedBusinessPhone,
        sandboxAllowedRecipients: canUseSandbox(req) ? safe?.sandboxAllowedRecipients : [],
        markConnectionValidatedAt: true,
      });
    }
    const runtime = runtimeForRequest(req, getChannelRuntimeInfo(await getTenantChannel(tenantId)));
    res.json({ ok: healthy, details: { provider: channel.provider, status: channel.status, isActive: channel.isActive, environmentMode: runtime.environmentMode, channelProductStatus: runtime.channelProductStatus } });
  });



  app.get(
    "/api/whatsapp/inbox/stream",
    (req, _res, next) => {
      const accessToken = typeof req.query.access_token === "string" ? req.query.access_token : "";
      if (accessToken && !req.headers.authorization) {
        req.headers.authorization = `Bearer ${accessToken}`;
      }
      next();
    },
    tenantAuth,
    requireAddon("whatsapp_inbox"),
    enforceBranchScope,
    async (req, res) => {
      const tenantId = req.auth!.tenantId!;
      const branchId = req.auth!.scope === "BRANCH" ? req.auth!.branchId : null;

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();

      const write = (eventName: string, data: unknown) => {
        res.write(`event: ${eventName}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      write("ready", {
        ok: true,
        tenantId,
        branchId,
        timestamp: new Date().toISOString(),
      });

      const heartbeat = setInterval(() => {
        write("heartbeat", { ts: Date.now() });
      }, 25000);

      const unsubscribe = whatsappRealtimeBus.subscribe({
        tenantId,
        branchId: branchId ?? null,
        onEvent: (event) => {
          write(event.eventType, event);
        },
      });

      req.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
    },
  );



  app.get(
    "/api/whatsapp/assignable-users",
    tenantAuth,
    requireAddon("whatsapp_inbox"),
    enforceBranchScope,
    async (req, res) => {
      const tenantId = req.auth!.tenantId!;
      const branchId = req.auth!.scope === "BRANCH" ? req.auth!.branchId : null;
      const rows = await db
        .select({ id: users.id, fullName: users.fullName, role: users.role, scope: users.scope, branchId: users.branchId })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), eq(users.isActive, true), isNull(users.deletedAt)));
      const data = rows.filter((u) => {
        if (!branchId) return true;
        if (u.scope === "TENANT") return true;
        return u.branchId === branchId;
      });
      return res.json({ data });
    },
  );

  app.get("/api/whatsapp/conversations", tenantAuth, requireAddon("whatsapp_inbox"), enforceBranchScope, async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const branchId = req.auth!.scope === "BRANCH" ? req.auth!.branchId : null;
    const data = await listConversationsByTenant(tenantId, branchId);
    const enriched = data.map((c) => ({ ...c, windowOpen: isWithin24hWindow(c.lastInboundAt) }));
    res.json({ data: enriched });
  });

  app.get(
    "/api/whatsapp/conversations/:id/messages",
    tenantAuth,
    requireAddon("whatsapp_inbox"),
    enforceBranchScope,
    validateParams(conversationIdSchema),
    async (req, res) => {
      const tenantId = req.auth!.tenantId!;
      const id = Number(req.params.id);
      const branchId = req.auth!.scope === "BRANCH" ? req.auth!.branchId : null;
      const conversation = await getConversationByIdScoped(tenantId, id, branchId);
      if (!conversation) return res.status(404).json({ error: "Conversación no encontrada" });
      const data = await listMessagesByConversation(tenantId, id);
      res.json({ data, conversation: { ...conversation, windowOpen: isWithin24hWindow(conversation.lastInboundAt) } });
    },
  );

  app.post("/api/whatsapp/messages/send-test", tenantAuth, requireAddon("messaging_whatsapp"), requireTenantAdmin, validateBody(sendSchema), async (req, res) => {
    try {
      const result = await sendTestWhatsAppMessage({
        tenantId: req.auth!.tenantId!,
        executedByUserId: req.auth!.userId,
        to: req.body.to,
        text: req.body.text,
      });
      return res.json({ data: result });
    } catch (error: any) {
      const providerError = error as WhatsAppProviderError;
      const providerCode = providerError?.code || "unknown";
      const providerDetails = providerError?.details || providerError?.message || "Error enviando mensaje de prueba";
      return res.status(providerError?.status || 500).json({
        error: `[META ${providerCode}] ${providerDetails}`,
        code: "WHATSAPP_SEND_TEST_FAILED",
        providerCode,
        providerDetails,
        providerRaw: providerError?.raw || null,
      });
    }
  });


  app.get(
    "/api/whatsapp/conversations/:id/template-suggestions",
    tenantAuth,
    requireAddon("whatsapp_inbox"),
    enforceBranchScope,
    validateParams(conversationIdSchema),
    async (req, res) => {
      const tenantId = req.auth!.tenantId!;
      const id = Number(req.params.id);
      const branchId = req.auth!.scope === "BRANCH" ? req.auth!.branchId : null;
      const conversation = await getConversationByIdScoped(tenantId, id, branchId);
      if (!conversation) return res.status(404).json({ error: "Conversación no encontrada" });
      const data = await getSuggestedTemplatesForConversation(tenantId, id, String(req.query.usageType || ""));
      return res.json({ data });
    },
  );

  app.post(
    "/api/whatsapp/conversations/:id/messages/send-template",
    tenantAuth,
    requireAddon("whatsapp_inbox"),
    enforceBranchScope,
    validateParams(conversationIdSchema),
    validateBody(sendTemplateSchema),
    async (req, res) => {
      const tenantId = req.auth!.tenantId!;
      const conversationId = Number(req.params.id);
      const branchId = req.auth!.scope === "BRANCH" ? req.auth!.branchId : null;
      const conversation = await getConversationByIdScoped(tenantId, conversationId, branchId);
      if (!conversation) return res.status(404).json({ error: "Conversación no encontrada" });

      try {
        const result = await sendConversationTemplateMessage({
          tenantId,
          conversationId,
          executedByUserId: req.auth!.userId,
          templateCode: req.body.templateCode,
          branchId,
        });
        return res.json({ data: result });
      } catch (error: any) {
        const providerError = error as WhatsAppProviderError;
        const providerCode = providerError?.code || "unknown";
        const providerDetails = providerError?.details || providerError?.message || "Error enviando plantilla";
        return res.status(providerError?.status || 500).json({
          error: `[META ${providerCode}] ${providerDetails}`,
          code: "WHATSAPP_INBOX_SEND_TEMPLATE_FAILED",
          providerCode,
          providerDetails,
          providerRaw: providerError?.raw || null,
        });
      }
    },
  );

  app.post(
    "/api/whatsapp/conversations/:id/messages/send",
    tenantAuth,
    requireAddon("whatsapp_inbox"),
    enforceBranchScope,
    validateParams(conversationIdSchema),
    validateBody(z.object({ text: z.string().trim().min(1).max(4096) })),
    async (req, res) => {
      const tenantId = req.auth!.tenantId!;
      const conversationId = Number(req.params.id);
      const branchId = req.auth!.scope === "BRANCH" ? req.auth!.branchId : null;
      const conversation = await getConversationByIdScoped(tenantId, conversationId, branchId);
      if (!conversation) return res.status(404).json({ error: "Conversación no encontrada" });

      try {
        const result = await sendConversationWhatsAppMessage({
          tenantId,
          conversationId,
          executedByUserId: req.auth!.userId,
          text: req.body.text,
          branchId,
        });
        return res.json({ data: result });
      } catch (error: any) {
        if (error instanceof WhatsAppWindowClosedError) {
          return res.status(400).json({
            error: error.message,
            code: error.code,
            hint: "Usá una plantilla de re-engagement para reabrir la conversación.",
          });
        }
        const providerError = error as WhatsAppProviderError;
        const providerCode = providerError?.code || "unknown";
        const providerDetails = providerError?.details || providerError?.message || "Error enviando mensaje";
        return res.status(providerError?.status || 500).json({
          error: `[META ${providerCode}] ${providerDetails}`,
          code: "WHATSAPP_INBOX_SEND_FAILED",
          providerCode,
          providerDetails,
          providerRaw: providerError?.raw || null,
        });
      }
    },
  );

  app.post(
    "/api/whatsapp/conversations/:id/mark-read",
    tenantAuth,
    requireAddon("whatsapp_inbox"),
    enforceBranchScope,
    validateParams(conversationIdSchema),
    async (req, res) => {
      const tenantId = req.auth!.tenantId!;
      const id = Number(req.params.id);
      const branchId = req.auth!.scope === "BRANCH" ? req.auth!.branchId : null;
      const conversation = await getConversationByIdScoped(tenantId, id, branchId);
      if (!conversation) return res.status(404).json({ error: "Conversación no encontrada" });
      const data = await markConversationAsRead(tenantId, id);
      res.json({ data });
    },
  );

  app.post(
    "/api/whatsapp/conversations/:id/status",
    tenantAuth,
    requireAddon("whatsapp_inbox"),
    enforceBranchScope,
    validateParams(conversationIdSchema),
    validateBody(z.object({ status: z.enum(["OPEN", "PENDING_CUSTOMER", "PENDING_BUSINESS", "WAITING_INTERNAL", "RESOLVED", "CLOSED"]) })),
    async (req, res) => {
      const tenantId = req.auth!.tenantId!;
      const id = Number(req.params.id);
      const branchId = req.auth!.scope === "BRANCH" ? req.auth!.branchId : null;
      const conversation = await getConversationByIdScoped(tenantId, id, branchId);
      if (!conversation) return res.status(404).json({ error: "Conversación no encontrada" });
      const data = await updateConversationStatus(tenantId, id, req.body.status);
      res.json({ data });
    },
  );

  app.post(
    "/api/whatsapp/conversations/:id/assign",
    tenantAuth,
    requireAddon("whatsapp_inbox"),
    requireTenantAdmin,
    enforceBranchScope,
    validateParams(conversationIdSchema),
    validateBody(z.object({ assignedUserId: z.union([z.null(), z.coerce.number().int().positive()]) })),
    async (req, res) => {
      const tenantId = req.auth!.tenantId!;
      const id = Number(req.params.id);
      const branchId = req.auth!.scope === "BRANCH" ? req.auth!.branchId : null;
      const conversation = await getConversationByIdScoped(tenantId, id, branchId);
      if (!conversation) return res.status(404).json({ error: "Conversación no encontrada" });

      if (req.body.assignedUserId) {
        const user = await storage.getUserById(req.body.assignedUserId, tenantId);
        if (!user || !user.isActive || user.deletedAt) {
          return res.status(400).json({ error: "Usuario de asignación inválido" });
        }
      }

      const data = await assignConversationToUser(tenantId, id, req.body.assignedUserId ?? null);
      res.json({ data });
    },
  );

  app.get(
    "/api/whatsapp/conversations/:id/timeline",
    tenantAuth,
    requireAddon("whatsapp_inbox"),
    enforceBranchScope,
    validateParams(conversationIdSchema),
    async (req, res) => {
      const tenantId = req.auth!.tenantId!;
      const id = Number(req.params.id);
      const branchId = req.auth!.scope === "BRANCH" ? req.auth!.branchId : null;
      const conversation = await getConversationByIdScoped(tenantId, id, branchId);
      if (!conversation) return res.status(404).json({ error: "Conversación no encontrada" });
      const data = await listConversationTimeline(tenantId, id, branchId);
      return res.json({ data });
    },
  );

  app.get(
    "/api/whatsapp/conversations/:id/customer-matches",
    tenantAuth,
    requireAddon("whatsapp_inbox"),
    enforceBranchScope,
    validateParams(conversationIdSchema),
    async (req, res) => {
      const tenantId = req.auth!.tenantId!;
      const id = Number(req.params.id);
      const branchId = req.auth!.scope === "BRANCH" ? req.auth!.branchId : null;
      const conversation = await getConversationByIdScoped(tenantId, id, branchId);
      if (!conversation) return res.status(404).json({ error: "Conversación no encontrada" });
      const data = await findCustomerMatchesByPhone(tenantId, conversation.customerPhone);
      return res.json({ data });
    },
  );

  app.post(
    "/api/whatsapp/conversations/:id/link-customer",
    tenantAuth,
    requireAddon("whatsapp_inbox"),
    requireTenantAdmin,
    enforceBranchScope,
    validateParams(conversationIdSchema),
    validateBody(z.object({ customerId: z.coerce.number().int().positive() })),
    async (req, res) => {
      const tenantId = req.auth!.tenantId!;
      const id = Number(req.params.id);
      const branchId = req.auth!.scope === "BRANCH" ? req.auth!.branchId : null;
      const data = await linkConversationToCustomer({
        tenantId,
        conversationId: id,
        customerId: req.body.customerId,
        actorUserId: req.auth!.userId,
        branchId,
      });
      return res.json({ data });
    },
  );

  app.post(
    "/api/whatsapp/conversations/:id/create-customer",
    tenantAuth,
    requireAddon("whatsapp_inbox"),
    requireTenantAdmin,
    enforceBranchScope,
    validateParams(conversationIdSchema),
    validateBody(z.object({ name: z.string().trim().max(200).optional(), email: z.string().email().optional() })),
    async (req, res) => {
      const tenantId = req.auth!.tenantId!;
      const id = Number(req.params.id);
      const branchId = req.auth!.scope === "BRANCH" ? req.auth!.branchId : null;
      const data = await createCustomerFromConversation({
        tenantId,
        conversationId: id,
        actorUserId: req.auth!.userId,
        name: req.body.name || null,
        email: req.body.email || null,
        branchId,
      });
      return res.json({ data });
    },
  );

  app.post(
    "/api/whatsapp/conversations/:id/operational-state",
    tenantAuth,
    requireAddon("whatsapp_inbox"),
    requireTenantAdmin,
    enforceBranchScope,
    validateParams(conversationIdSchema),
    validateBody(z.object({
      ownerMode: z.enum(CONVERSATION_OWNER_MODES).optional(),
      handoffStatus: z.enum(CONVERSATION_HANDOFF_STATUSES).optional(),
      automationEnabled: z.boolean().optional(),
      automationPausedReason: z.string().trim().max(300).nullable().optional(),
    })),
    async (req, res) => {
      const tenantId = req.auth!.tenantId!;
      const id = Number(req.params.id);
      const branchId = req.auth!.scope === "BRANCH" ? req.auth!.branchId : null;
      const data = await updateConversationOperationalState({
        tenantId,
        conversationId: id,
        actorUserId: req.auth!.userId,
        branchId,
        ownerMode: req.body.ownerMode,
        handoffStatus: req.body.handoffStatus,
        automationEnabled: req.body.automationEnabled,
        automationPausedReason: req.body.automationPausedReason,
      });
      return res.json({ data });
    },
  );

}
