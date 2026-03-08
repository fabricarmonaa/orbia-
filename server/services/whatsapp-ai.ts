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
export type WhatsAppAiProvider = "openai" | "openrouter";

const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4o-mini";

export type WhatsAppAiDecision = {
  action: WhatsAppAiDecisionAction;
  reason: string;
  replyText?: string;
  confidence?: number;
  model?: string;
  provider?: WhatsAppAiProvider;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
};

type AiErrorFallbackAction = "fallback_reply" | "no_action" | "handoff";

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
  provider?: WhatsAppAiProvider;
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
  if (input.provider && !input.model && existing && existing.provider !== input.provider) {
    values.model = getDefaultModelForProvider(input.provider);
  }
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

  const providerForValidation = (input.provider || existing?.provider || "openai") as WhatsAppAiProvider;
  const modelForValidation = String(input.model || values.model || existing?.model || getDefaultModelForProvider(providerForValidation)).trim();
  const hasApiKeyForValidation = Boolean((values.apiKeyEncrypted as string | undefined) || existing?.apiKeyEncrypted || (input.apiKey && !isMaskedSecretValue(input.apiKey) && input.apiKey.trim()));
  const enabledForValidation = typeof input.enabled === "boolean" ? input.enabled : Boolean(existing?.enabled);
  validateAiConfigForRuntime({
    provider: providerForValidation,
    model: modelForValidation,
    hasApiKey: hasApiKeyForValidation,
    enabled: enabledForValidation,
  });

  if (existing) {
    const [saved] = await db.update(tenantWhatsappAiConfigs).set(values).where(eq(tenantWhatsappAiConfigs.id, existing.id)).returning();
    return saved;
  }

  const [created] = await db.insert(tenantWhatsappAiConfigs).values({
    tenantId: input.tenantId,
    enabled: Boolean(input.enabled),
    provider: input.provider || "openai",
    model: (input.model || (input.provider === "openrouter" ? DEFAULT_OPENROUTER_MODEL : DEFAULT_OPENAI_MODEL)).trim(),
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

function getDefaultModelForProvider(provider: WhatsAppAiProvider) {
  return provider === "openrouter" ? DEFAULT_OPENROUTER_MODEL : DEFAULT_OPENAI_MODEL;
}

function getEffectiveProvider(cfg: any): WhatsAppAiProvider {
  return cfg?.provider === "openrouter" ? "openrouter" : "openai";
}

function isModelCompatibleWithProvider(provider: WhatsAppAiProvider, model: string) {
  const normalized = String(model || "").trim();
  if (!normalized) return false;
  if (provider === "openrouter") {
    return normalized.includes("/");
  }
  return !normalized.includes("/");
}

function validateAiConfigForRuntime(input: { provider: WhatsAppAiProvider; model: string; hasApiKey: boolean; enabled: boolean }) {
  if (!input.enabled) return;
  if (!input.provider) throw new Error("AI_CONFIG_PROVIDER_REQUIRED");
  if (!input.model.trim()) throw new Error("AI_CONFIG_MODEL_REQUIRED");
  if (!input.hasApiKey) throw new Error("AI_CONFIG_API_KEY_REQUIRED");
  if (!isModelCompatibleWithProvider(input.provider, input.model)) {
    if (input.provider === "openrouter") throw new Error("AI_CONFIG_MODEL_INCOMPATIBLE_OPENROUTER");
    throw new Error("AI_CONFIG_MODEL_INCOMPATIBLE_OPENAI");
  }
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
    context.memConversation?.flagsJson && Object.keys(context.memConversation.flagsJson || {}).length
      ? `Flags conversación: ${JSON.stringify(context.memConversation.flagsJson)}`
      : "",
    context.customer ? `Cliente vinculado: ${context.customer.name || "N/A"} (${context.customer.phone || "sin teléfono"})` : "Cliente no vinculado.",
  ].filter(Boolean).join("\n\n");
}

function buildUserPrompt(context: any) {
  const userText = context.messages.map((m: any) => `${m.role === "user" ? "Cliente" : "Asistente"}: ${m.text}`).join("\n");
  return `Historial:
${userText}

Generá JSON con {action, reason, replyText, confidence}.`;
}

function buildCompletionMessages(input: { cfg: any; context: any }) {
  return [
    { role: "system", content: buildSystemPrompt(input) },
    { role: "user", content: buildUserPrompt(input.context) },
  ];
}

function parseAiOutputText(outputText: string, model: string) {
  const cleanText = String(outputText || "").trim();
  const parsed = (() => {
    try {
      const firstJson = cleanText.match(/\{[\s\S]*\}/)?.[0] || "{}";
      return JSON.parse(firstJson);
    } catch {
      return null;
    }
  })();

  if (!parsed) {
    return {
      action: "reply" as WhatsAppAiDecisionAction,
      reason: "plain_text_fallback",
      replyText: cleanText || undefined,
      confidence: 0,
      model,
    };
  }

  return {
    action: ["reply", "handoff", "pause", "no_action"].includes(parsed.action) ? parsed.action : "no_action",
    reason: String(parsed.reason || "ai_decision"),
    replyText: parsed.replyText ? String(parsed.replyText).trim() : undefined,
    confidence: Number(parsed.confidence || 0),
    model,
  };
}

async function callOpenAiGenerate(input: { cfg: any; context: any }) {
  const apiKey = decryptSecret(input.cfg.apiKeyEncrypted || null) || process.env.OPENAI_API_KEY || "";
  if (!apiKey) throw new Error("OPENAI_API_KEY_MISSING");
  const client = new OpenAI({ apiKey, timeout: Number(process.env.WHATSAPP_AI_TIMEOUT_MS || "15000") });

  const response = await client.responses.create({
    model: input.cfg.model || DEFAULT_OPENAI_MODEL,
    temperature: Number(input.cfg.temperature || 20) / 100,
    max_output_tokens: Number(input.cfg.maxOutputTokens || 500),
    input: buildCompletionMessages(input).map((m: any) => ({ role: m.role, content: [{ type: "input_text", text: m.content }] })),
  });

  const outputText = (response as any).output_text || "";
  const decision = parseAiOutputText(outputText, input.cfg.model || DEFAULT_OPENAI_MODEL);
  const usage = (response as any).usage || {};

  return {
    decision: {
      ...decision,
      usage: {
        promptTokens: usage.input_tokens,
        completionTokens: usage.output_tokens,
        totalTokens: usage.total_tokens,
      },
    } as WhatsAppAiDecision,
    rawText: outputText,
  };
}

async function callOpenRouterGenerate(input: { cfg: any; context: any }) {
  const apiKey = decryptSecret(input.cfg.apiKeyEncrypted || null) || process.env.OPENROUTER_API_KEY || "";
  if (!apiKey) throw new Error("OPENROUTER_API_KEY_MISSING");

  const timeoutMs = Number(process.env.WHATSAPP_AI_TIMEOUT_MS || "15000");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const messages = buildCompletionMessages(input);
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: input.cfg.model || DEFAULT_OPENROUTER_MODEL,
        messages,
        temperature: Number(input.cfg.temperature || 20) / 100,
      }),
      signal: controller.signal,
    });

    const payload: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      const providerMessage = String(payload?.error?.message || payload?.message || "").trim();
      throw new Error(`OPENROUTER_HTTP_${response.status}:${providerMessage || "no_message"}`);
    }

    const outputText = String(payload?.choices?.[0]?.message?.content || "").trim();
    if (!outputText) {
      throw new Error("OPENROUTER_INVALID_RESPONSE:missing_choices_message_content");
    }
    const decision = parseAiOutputText(outputText, input.cfg.model || DEFAULT_OPENROUTER_MODEL);
    const usage = payload?.usage || {};
    return {
      decision: {
        ...decision,
        usage: {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
        },
      } as WhatsAppAiDecision,
      rawText: outputText,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function callAiProviderGenerate(input: { cfg: any; context: any }) {
  const provider = getEffectiveProvider(input.cfg);
  if (provider === "openrouter") return callOpenRouterGenerate(input);
  return callOpenAiGenerate(input);
}

async function appendConversationEvent(input: { tenantId: number; context: any; eventType: string; payloadJson?: Record<string, unknown> }) {
  await db.insert(whatsappConversationEvents).values({
    tenantId: input.tenantId,
    branchId: input.context.conversation.branchId || null,
    channelId: input.context.conversation.channelId || null,
    conversationId: input.context.conversation.id,
    customerId: input.context.conversation.customerId || null,
    eventType: input.eventType,
    payloadJson: input.payloadJson || {},
  });
}

function classifyAiError(error: any) {
  const message = String(error?.message || "unknown_error");
  const msgLower = message.toLowerCase();

  if (message.includes("AI_CONFIG_PROVIDER_REQUIRED")) return { code: "config_missing_provider", message };
  if (message.includes("AI_CONFIG_MODEL_REQUIRED")) return { code: "config_missing_model", message };
  if (message.includes("AI_CONFIG_API_KEY_REQUIRED") || message.includes("API_KEY_MISSING")) return { code: "config_missing_api_key", message };
  if (message.includes("AI_CONFIG_MODEL_INCOMPATIBLE_OPENROUTER")) return { code: "config_model_incompatible_openrouter", message };
  if (message.includes("AI_CONFIG_MODEL_INCOMPATIBLE_OPENAI")) return { code: "config_model_incompatible_openai", message };
  if (message.includes("Conversación no encontrada")) return { code: "conversation_not_found", message };

  if (message.includes("OPENROUTER_HTTP_")) {
    const statusPart = message.split("OPENROUTER_HTTP_")[1] || "";
    const statusCode = Number(statusPart.split(":")[0] || 0);
    if (statusCode === 401) return { code: "provider_http_401", message };
    if (statusCode === 402) return { code: "provider_http_402", message };
    if (statusCode === 404) return { code: "provider_http_404_model", message };
    if (statusCode === 429) return { code: "provider_http_429", message };
    return { code: "provider_http_error", message };
  }

  if (message.includes("OPENROUTER_INVALID_RESPONSE")) return { code: "provider_invalid_response", message };
  if (msgLower.includes("no endpoints found for")) return { code: "provider_no_endpoint_for_model", message };
  if (msgLower.includes("abort") || msgLower.includes("timeout")) return { code: "provider_timeout", message };
  if (message.includes("OPENAI")) return { code: "provider_openai_error", message };
  if (message.includes("OPENROUTER")) return { code: "provider_openrouter_error", message };
  return { code: "unknown_error", message };
}

function getAiErrorFallbackPolicy(cfg: any): { action: AiErrorFallbackAction; replyText: string } {
  const raw = String(cfg?.escalationRules?.providerErrorPolicy || cfg?.escalationRules?.onProviderErrorAction || "").trim().toLowerCase();
  const normalizedRaw = raw === "reply_fallback" ? "fallback_reply" : raw;
  const action: AiErrorFallbackAction = normalizedRaw === "handoff" || normalizedRaw === "fallback_reply" || normalizedRaw === "no_action" ? normalizedRaw : "no_action";
  const replyText = String(cfg?.escalationRules?.providerErrorFallbackReply || "Estamos procesando tu consulta. En breve te respondemos.").trim();
  return { action, replyText };
}

export async function decideAutomationWithAi(input: { tenantId: number; conversationId: number; trigger?: string; source?: string; requestedAt?: string }) {
  const cfg = await getTenantWhatsappAiConfig(input.tenantId);
  if (!cfg?.enabled) {
    return { decision: { action: "no_action", reason: "ai_disabled" } as WhatsAppAiDecision, context: null, meta: { provider: "openai", model: DEFAULT_OPENAI_MODEL } };
  }

  const provider = getEffectiveProvider(cfg);
  const model = String(cfg.model || getDefaultModelForProvider(provider)).trim();
  const hasApiKey = Boolean(decryptSecret(cfg.apiKeyEncrypted || null) || (provider === "openai" ? process.env.OPENAI_API_KEY : process.env.OPENROUTER_API_KEY));
  validateAiConfigForRuntime({ provider, model, hasApiKey, enabled: Boolean(cfg.enabled) });

  aiLog("automation_ai_request_start", { tenantId: input.tenantId, conversationId: input.conversationId, provider, model, trigger: input.trigger || "unknown", source: input.source || "unknown" });

  const context = await buildAiContext(input.tenantId, input.conversationId, cfg);
  aiLog("automation_ai_context_built", {
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    provider,
    model,
    messagesCount: context.messages.length,
    hasSummary: Boolean(context.memConversation?.summary),
    hasFlags: Boolean(context.memConversation?.flagsJson && Object.keys(context.memConversation.flagsJson || {}).length),
  });

  const skip = shouldSkipAi(context.conversation);
  if (skip.skip) {
    await appendConversationEvent({
      tenantId: input.tenantId,
      context,
      eventType: "whatsapp.automation.ai_skipped",
      payloadJson: { reason: skip.reason, provider, model },
    });
    return { decision: { action: "no_action", reason: skip.reason, provider, model } as WhatsAppAiDecision, context, meta: { provider, model } };
  }

  const latestInbound = [...context.messages].reverse().find((m: any) => m.role === "user")?.text || "";
  const escalationByKeyword = buildEscalationFromText(latestInbound);
  if (escalationByKeyword) {
    const decision: WhatsAppAiDecision = { action: "handoff", reason: escalationByKeyword, provider, model };
    await appendConversationEvent({
      tenantId: input.tenantId,
      context,
      eventType: "whatsapp.automation.ai_handoff_requested",
      payloadJson: { reason: escalationByKeyword, provider, model },
    });
    return { decision, context, meta: { provider, model } };
  }

  await appendConversationEvent({
    tenantId: input.tenantId,
    context,
    eventType: "whatsapp.automation.ai_requested",
    payloadJson: { provider, model, trigger: input.trigger || null, source: input.source || null, requestedAt: input.requestedAt || null },
  });

  try {
    await appendConversationEvent({
      tenantId: input.tenantId,
      context,
      eventType: "whatsapp.automation.ai_provider_called",
      payloadJson: { provider, model },
    });

    const ai = await callAiProviderGenerate({ cfg: { ...cfg, model, provider }, context });

    aiLog("automation_ai_provider_response_preview", {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      provider,
      model,
      rawPreview: String(ai.rawText || "").slice(0, 180),
      action: ai.decision.action,
      reason: ai.decision.reason,
    });

    const normalizedDecision: WhatsAppAiDecision = {
      ...ai.decision,
      provider,
      model,
      action: ai.decision.action,
      reason: ai.decision.reason || "ai_decision",
    };

    await appendConversationEvent({
      tenantId: input.tenantId,
      context,
      eventType: "whatsapp.automation.ai_response_parsed",
      payloadJson: {
        provider,
        model,
        action: normalizedDecision.action,
        reason: normalizedDecision.reason,
        hasReplyText: Boolean(normalizedDecision.replyText),
      },
    });

    const summaryEnabled = cfg.summaryEnabled !== false;
    if (summaryEnabled) {
      const maxChars = Math.max(300, Math.min(4000, Number(cfg.summaryMaxChars || 1200)));
      const mergedSummary = [context.memConversation?.summary || "", `Última decisión: ${normalizedDecision.action}/${normalizedDecision.reason}`].filter(Boolean).join("\n").slice(0, maxChars);
      await db
        .update(whatsappConversationAiMemory)
        .set({ summary: mergedSummary, lastMessagesJson: context.messages.slice(-10), updatedAt: new Date() })
        .where(and(eq(whatsappConversationAiMemory.tenantId, input.tenantId), eq(whatsappConversationAiMemory.conversationId, input.conversationId)));
    }

    await appendConversationEvent({
      tenantId: input.tenantId,
      context,
      eventType: normalizedDecision.action === "handoff" ? "whatsapp.automation.ai_handoff_requested" : "whatsapp.automation.ai_replied",
      payloadJson: {
        action: normalizedDecision.action,
        reason: normalizedDecision.reason,
        model,
        provider,
        usage: normalizedDecision.usage,
      },
    });

    aiLog("automation_ai_decision_normalized", { tenantId: input.tenantId, conversationId: input.conversationId, provider, model, action: normalizedDecision.action, reason: normalizedDecision.reason });
    return { decision: normalizedDecision, context, meta: { provider, model } };
  } catch (error: any) {
    const classification = classifyAiError(error);
    const fallback = getAiErrorFallbackPolicy(cfg);

    aiLog("automation_ai_error_classified", {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      provider,
      model,
      code: classification.code,
      message: classification.message,
      fallbackAction: fallback.action,
    });

    await appendConversationEvent({
      tenantId: input.tenantId,
      context,
      eventType: "whatsapp.automation.ai_error",
      payloadJson: { message: classification.message, code: classification.code, provider, model },
    });

    let decision: WhatsAppAiDecision;
    if (fallback.action === "handoff") {
      decision = { action: "handoff", reason: "ai_error_fallback_handoff", provider, model };
    } else if (fallback.action === "fallback_reply") {
      decision = { action: "reply", reason: "ai_error_fallback_reply", replyText: fallback.replyText, provider, model };
    } else {
      decision = { action: "no_action", reason: "ai_error_fallback_no_action", provider, model };
    }

    await appendConversationEvent({
      tenantId: input.tenantId,
      context,
      eventType: "whatsapp.automation.ai_fallback_used",
      payloadJson: {
        fallbackAction: fallback.action,
        decisionAction: decision.action,
        reason: decision.reason,
        provider,
        model,
      },
    });

    return { decision, context, meta: { provider, model, fallbackAction: fallback.action, errorCode: classification.code } };
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
