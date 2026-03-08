import OpenAI from "openai";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  customers,
  tenantWhatsappAiConfigs,
  tenantWhatsappAiMemory,
  tenants,
  whatsappConversationAiMemory,
  whatsappConversationEvents,
  whatsappConversations,
  whatsappMessages,
} from "@shared/schema";
import { db } from "../db";
import { decryptSecret, encryptSecret, isMaskedSecretValue, maskSecret } from "./whatsapp-crypto";

export type WhatsAppAiDecisionAction = "reply" | "handoff" | "pause" | "no_action";

export type WhatsAppAiDecision = {
  action: WhatsAppAiDecisionAction;
  reason: string;
  replyText?: string;
  confidence?: number;
  model?: string;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
};

function aiLog(event: string, payload: Record<string, unknown>) {
  if (String(process.env.WHATSAPP_DEBUG_LOGS || "").toLowerCase() !== "true") return;
  console.log("[WA-AI]", event, payload);
}

export async function getTenantWhatsappAiConfig(tenantId: number) {
  const [cfg] = await db.select().from(tenantWhatsappAiConfigs).where(eq(tenantWhatsappAiConfigs.tenantId, tenantId)).limit(1);
  return cfg || null;
}

export function tenantWhatsappAiConfigToSafeResponse(cfg: any) {
  if (!cfg) return null;
  return {
    ...cfg,
    apiKey: maskSecret(decryptSecret(cfg.apiKeyEncrypted) || null),
  };
}

export async function upsertTenantWhatsappAiConfig(input: {
  tenantId: number;
  enabled?: boolean;
  provider?: "openai";
  model?: string;
  systemPrompt?: string | null;
  businessContext?: string | null;
  responseStyle?: string | null;
  escalationRules?: any;
  maxContextMessages?: number;
  summaryEnabled?: boolean;
  summaryMaxChars?: number;
  toolsEnabled?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  apiKey?: string | null;
}) {
  const existing = await getTenantWhatsappAiConfig(input.tenantId);
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof input.enabled === "boolean") values.enabled = input.enabled;
  if (input.provider) values.provider = input.provider;
  if (input.model) values.model = input.model.trim();
  if (input.systemPrompt !== undefined) values.systemPrompt = (input.systemPrompt || "").trim() || null;
  if (input.businessContext !== undefined) values.businessContext = (input.businessContext || "").trim() || null;
  if (input.responseStyle !== undefined) values.responseStyle = (input.responseStyle || "").trim() || "professional_friendly";
  if (input.escalationRules !== undefined) values.escalationRules = input.escalationRules || {};
  if (typeof input.maxContextMessages === "number") values.maxContextMessages = Math.max(4, Math.min(40, input.maxContextMessages));
  if (typeof input.summaryEnabled === "boolean") values.summaryEnabled = input.summaryEnabled;
  if (typeof input.summaryMaxChars === "number") values.summaryMaxChars = Math.max(300, Math.min(4000, input.summaryMaxChars));
  if (typeof input.toolsEnabled === "boolean") values.toolsEnabled = input.toolsEnabled;
  if (typeof input.temperature === "number") values.temperature = Math.max(0, Math.min(100, input.temperature));
  if (typeof input.maxOutputTokens === "number") values.maxOutputTokens = Math.max(100, Math.min(1500, input.maxOutputTokens));
  if (input.apiKey !== undefined && !isMaskedSecretValue(input.apiKey)) {
    values.apiKeyEncrypted = (input.apiKey || "").trim() ? encryptSecret((input.apiKey || "").trim()) : null;
  }

  if (existing) {
    const [saved] = await db.update(tenantWhatsappAiConfigs).set(values).where(eq(tenantWhatsappAiConfigs.id, existing.id)).returning();
    return saved;
  }

  const [created] = await db.insert(tenantWhatsappAiConfigs).values({
    tenantId: input.tenantId,
    enabled: Boolean(input.enabled),
    provider: input.provider || "openai",
    model: (input.model || "gpt-4o-mini").trim(),
    systemPrompt: (input.systemPrompt || "").trim() || null,
    businessContext: (input.businessContext || "").trim() || null,
    responseStyle: (input.responseStyle || "professional_friendly").trim(),
    escalationRules: input.escalationRules || {},
    maxContextMessages: Math.max(4, Math.min(40, input.maxContextMessages || 20)),
    summaryEnabled: input.summaryEnabled !== false,
    summaryMaxChars: Math.max(300, Math.min(4000, input.summaryMaxChars || 1200)),
    toolsEnabled: Boolean(input.toolsEnabled),
    temperature: Math.max(0, Math.min(100, input.temperature ?? 20)),
    maxOutputTokens: Math.max(100, Math.min(1500, input.maxOutputTokens || 500)),
    apiKeyEncrypted: (input.apiKey || "").trim() ? encryptSecret((input.apiKey || "").trim()) : null,
  }).returning();
  return created;
}

async function getOrCreateTenantMemory(tenantId: number) {
  const [mem] = await db
    .select()
    .from(tenantWhatsappAiMemory)
    .where(and(eq(tenantWhatsappAiMemory.tenantId, tenantId), eq(tenantWhatsappAiMemory.memoryType, "global")))
    .limit(1);
  if (mem) return mem;
  const [created] = await db.insert(tenantWhatsappAiMemory).values({ tenantId, memoryType: "global", content: null, metadataJson: {} }).returning();
  return created;
}

export async function getTenantAiGlobalMemory(tenantId: number) {
  return getOrCreateTenantMemory(tenantId);
}

async function getOrCreateConversationMemory(tenantId: number, conversationId: number) {
  const [mem] = await db
    .select()
    .from(whatsappConversationAiMemory)
    .where(and(eq(whatsappConversationAiMemory.tenantId, tenantId), eq(whatsappConversationAiMemory.conversationId, conversationId)))
    .limit(1);
  if (mem) return mem;
  const [created] = await db
    .insert(whatsappConversationAiMemory)
    .values({ tenantId, conversationId, summary: null, flagsJson: {}, lastMessagesJson: [] })
    .returning();
  return created;
}

function shouldSkipAi(conversation: any) {
  if (conversation.handoffStatus === "active") return { skip: true, reason: "handoff_active" };
  if (conversation.ownerMode !== "automation") return { skip: true, reason: "owner_mode_human" };
  if (!conversation.automationEnabled) return { skip: true, reason: "automation_disabled" };
  if (conversation.automationPausedUntil && new Date(conversation.automationPausedUntil).getTime() > Date.now()) return { skip: true, reason: "automation_paused" };
  const takeoverMs = Number(process.env.WHATSAPP_AUTOMATION_HUMAN_COOLDOWN_MINUTES || "20") * 60_000;
  if (conversation.lastHumanAt && (Date.now() - new Date(conversation.lastHumanAt).getTime()) < takeoverMs) return { skip: true, reason: "recent_human_takeover" };
  return { skip: false, reason: "ok" };
}

function buildEscalationFromText(text: string) {
  const raw = text.toLowerCase();
  if (["humano", "persona", "asesor", "operador", "agente"].some((k) => raw.includes(k))) return "human_requested";
  if (["reclamo", "enoj", "estafa", "denuncia", "cancel"].some((k) => raw.includes(k))) return "negative_sentiment";
  return null;
}

async function buildAiContext(tenantId: number, conversationId: number, cfg: any) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const [conversation] = await db
    .select()
    .from(whatsappConversations)
    .where(and(eq(whatsappConversations.tenantId, tenantId), eq(whatsappConversations.id, conversationId)))
    .limit(1);
  if (!conversation) throw new Error("Conversación no encontrada");
  const customer = conversation.customerId
    ? (await db.select().from(customers).where(and(eq(customers.tenantId, tenantId), eq(customers.id, conversation.customerId))).limit(1))[0]
    : null;

  const memTenant = await getOrCreateTenantMemory(tenantId);
  const memConversation = await getOrCreateConversationMemory(tenantId, conversationId);

  const maxContextMessages = Math.max(4, Math.min(40, Number(cfg.maxContextMessages || 20)));
  const rows = await db
    .select()
    .from(whatsappMessages)
    .where(and(eq(whatsappMessages.tenantId, tenantId), eq(whatsappMessages.conversationId, conversationId)))
    .orderBy(desc(whatsappMessages.createdAt))
    .limit(maxContextMessages);
  const messages = [...rows].reverse().map((m) => ({ role: m.direction === "INBOUND" ? "user" : "assistant", text: m.contentText || "", createdAt: m.createdAt }));

  return {
    tenant,
    conversation,
    customer,
    memTenant,
    memConversation,
    messages,
  };
}

function buildSystemPrompt(input: { cfg: any; context: any }) {
  const { cfg, context } = input;
  const basePrompt = [
    "Sos el asistente de WhatsApp de Orbia para atención comercial.",
    "No inventes precios, stock ni estado real de pedidos.",
    "Si no hay datos suficientes, pedí aclaración o sugerí handoff humano.",
    "Respondé breve, útil y en tono cordial.",
  ].join("\n");
  return [
    basePrompt,
    cfg.systemPrompt || "",
    `Negocio: ${context.tenant?.name || "N/A"}`,
    cfg.businessContext ? `Contexto negocio: ${cfg.businessContext}` : "",
    `Estilo deseado: ${cfg.responseStyle || "professional_friendly"}`,
    context.memTenant?.content ? `Memoria global tenant: ${context.memTenant.content}` : "",
    context.memConversation?.summary ? `Resumen conversación: ${context.memConversation.summary}` : "",
    context.customer ? `Cliente vinculado: ${context.customer.name || "N/A"} (${context.customer.phone || "sin teléfono"})` : "Cliente no vinculado.",
  ].filter(Boolean).join("\n\n");
}

async function callOpenAiGenerate(input: { cfg: any; context: any }) {
  const apiKey = decryptSecret(input.cfg.apiKeyEncrypted || null) || process.env.OPENAI_API_KEY || "";
  if (!apiKey) throw new Error("OPENAI_API_KEY_MISSING");
  const client = new OpenAI({ apiKey, timeout: Number(process.env.WHATSAPP_AI_TIMEOUT_MS || "15000") });

  const systemPrompt = buildSystemPrompt(input);
  const userText = input.context.messages.map((m: any) => `${m.role === "user" ? "Cliente" : "Asistente"}: ${m.text}`).join("\n");

  const response = await client.responses.create({
    model: input.cfg.model || "gpt-4o-mini",
    temperature: Number(input.cfg.temperature || 20) / 100,
    max_output_tokens: Number(input.cfg.maxOutputTokens || 500),
    input: [
      { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
      { role: "user", content: [{ type: "input_text", text: `Historial:\n${userText}\n\nGenerá JSON con {action, reason, replyText, confidence}.` }] },
    ],
  });

  const outputText = (response as any).output_text || "";
  const parsed = (() => {
    try {
      const firstJson = outputText.match(/\{[\s\S]*\}/)?.[0] || "{}";
      return JSON.parse(firstJson);
    } catch {
      return { action: "no_action", reason: "invalid_json", replyText: "" };
    }
  })();

  const usage = (response as any).usage || {};
  return {
    decision: {
      action: ["reply", "handoff", "pause", "no_action"].includes(parsed.action) ? parsed.action : "no_action",
      reason: String(parsed.reason || "ai_decision"),
      replyText: parsed.replyText ? String(parsed.replyText).trim() : undefined,
      confidence: Number(parsed.confidence || 0),
      model: input.cfg.model,
      usage: {
        promptTokens: usage.input_tokens,
        completionTokens: usage.output_tokens,
        totalTokens: usage.total_tokens,
      },
    } as WhatsAppAiDecision,
    rawText: outputText,
  };
}

export async function decideAutomationWithAi(input: { tenantId: number; conversationId: number }) {
  const cfg = await getTenantWhatsappAiConfig(input.tenantId);
  if (!cfg?.enabled) {
    return { decision: { action: "no_action", reason: "ai_disabled" } as WhatsAppAiDecision, context: null };
  }

  const context = await buildAiContext(input.tenantId, input.conversationId, cfg);
  const skip = shouldSkipAi(context.conversation);
  if (skip.skip) {
    await db.insert(whatsappConversationEvents).values({
      tenantId: input.tenantId,
      branchId: context.conversation.branchId || null,
      channelId: context.conversation.channelId || null,
      conversationId: context.conversation.id,
      customerId: context.conversation.customerId || null,
      eventType: "whatsapp.automation.ai_skipped",
      payloadJson: { reason: skip.reason },
    });
    return { decision: { action: "no_action", reason: skip.reason } as WhatsAppAiDecision, context };
  }

  const latestInbound = [...context.messages].reverse().find((m: any) => m.role === "user")?.text || "";
  const escalationByKeyword = buildEscalationFromText(latestInbound);
  if (escalationByKeyword) {
    const decision: WhatsAppAiDecision = { action: "handoff", reason: escalationByKeyword };
    await db.insert(whatsappConversationEvents).values({
      tenantId: input.tenantId,
      branchId: context.conversation.branchId || null,
      channelId: context.conversation.channelId || null,
      conversationId: context.conversation.id,
      customerId: context.conversation.customerId || null,
      eventType: "whatsapp.automation.ai_handoff_requested",
      payloadJson: { reason: escalationByKeyword },
    });
    return { decision, context };
  }

  await db.insert(whatsappConversationEvents).values({
    tenantId: input.tenantId,
    branchId: context.conversation.branchId || null,
    channelId: context.conversation.channelId || null,
    conversationId: context.conversation.id,
    customerId: context.conversation.customerId || null,
    eventType: "whatsapp.automation.ai_requested",
    payloadJson: { model: cfg.model },
  });

  try {
    const ai = await callOpenAiGenerate({ cfg, context });
    const summaryEnabled = cfg.summaryEnabled !== false;
    if (summaryEnabled) {
      const maxChars = Math.max(300, Math.min(4000, Number(cfg.summaryMaxChars || 1200)));
      const mergedSummary = [context.memConversation?.summary || "", `Última decisión: ${ai.decision.action}/${ai.decision.reason}`].filter(Boolean).join("\n").slice(0, maxChars);
      await db
        .update(whatsappConversationAiMemory)
        .set({ summary: mergedSummary, lastMessagesJson: context.messages.slice(-10), updatedAt: new Date() })
        .where(and(eq(whatsappConversationAiMemory.tenantId, input.tenantId), eq(whatsappConversationAiMemory.conversationId, input.conversationId)));
    }

    await db.insert(whatsappConversationEvents).values({
      tenantId: input.tenantId,
      branchId: context.conversation.branchId || null,
      channelId: context.conversation.channelId || null,
      conversationId: context.conversation.id,
      customerId: context.conversation.customerId || null,
      eventType: ai.decision.action === "handoff" ? "whatsapp.automation.ai_handoff_requested" : "whatsapp.automation.ai_replied",
      payloadJson: {
        action: ai.decision.action,
        reason: ai.decision.reason,
        model: ai.decision.model,
        usage: ai.decision.usage,
      },
    });

    aiLog("ai_decision", { tenantId: input.tenantId, conversationId: input.conversationId, action: ai.decision.action, reason: ai.decision.reason, model: ai.decision.model });
    return { decision: ai.decision, context };
  } catch (error: any) {
    await db.insert(whatsappConversationEvents).values({
      tenantId: input.tenantId,
      branchId: context.conversation.branchId || null,
      channelId: context.conversation.channelId || null,
      conversationId: context.conversation.id,
      customerId: context.conversation.customerId || null,
      eventType: "whatsapp.automation.ai_error",
      payloadJson: { message: error?.message || "unknown_error" },
    });
    return { decision: { action: "no_action", reason: "ai_error" } as WhatsAppAiDecision, context };
  }
}

export async function upsertTenantAiGlobalMemory(input: { tenantId: number; content: string; metadataJson?: any }) {
  const existing = await getOrCreateTenantMemory(input.tenantId);
  const [saved] = await db
    .update(tenantWhatsappAiMemory)
    .set({ content: input.content, metadataJson: input.metadataJson || existing.metadataJson || {}, updatedAt: new Date() })
    .where(eq(tenantWhatsappAiMemory.id, existing.id))
    .returning();
  return saved;
}
