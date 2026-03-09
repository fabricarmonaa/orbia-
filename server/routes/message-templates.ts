import type { Express } from "express";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireAddon, requireTenantAdmin, tenantAuth, blockBranchScope } from "../auth";
import { db } from "../db";
import { messageTemplates } from "@shared/schema";
import { storage } from "../storage";
import { normalizePhoneE164, renderTemplate } from "../lib/messaging";
import { getTenantChannel } from "../services/whatsapp-service";

const createTemplateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  body: z.string().trim().min(2).max(4000),
  isActive: z.boolean().optional().default(true),
  key: z.string().trim().max(60).optional(),
  usageType: z.enum(["greeting","follow_up","reengagement","confirmation","reminder","quote_or_budget","handoff_human","error_fallback","closing","custom","GENERAL","GREETING","REENGAGEMENT","FALLBACK","HUMAN_HANDOFF","CONFIRMATION","ORDER_FOLLOWUP"]).optional(),
});

const updateTemplateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  body: z.string().trim().min(2).max(4000).optional(),
  isActive: z.boolean().optional(),
  key: z.string().trim().max(60).optional(),
  usageType: z.enum(["greeting","follow_up","reengagement","confirmation","reminder","quote_or_budget","handoff_human","error_fallback","closing","custom","GENERAL","GREETING","REENGAGEMENT","FALLBACK","HUMAN_HANDOFF","CONFIRMATION","ORDER_FOLLOWUP"]).optional(),
});

const renderSchema = z.object({
  templateBody: z.string().trim().min(1).max(4000),
  orderId: z.coerce.number().int().positive().optional(),
});

const countrySchema = z.object({
  defaultCountry: z.string().trim().min(2).max(4),
});

function normalizeUsageType(raw?: string | null) {
  const value = String(raw || "").trim().toLowerCase();
  const mapping: Record<string, string> = {
    general: "custom",
    greeting: "greeting",
    reengagement: "reengagement",
    fallback: "error_fallback",
    human_handoff: "handoff_human",
    confirmation: "confirmation",
    order_followup: "follow_up",
  };
  return mapping[value] || (value || "custom");
}



function inferUsageType(key?: string | null, body?: string | null) {
  const source = `${key || ""} ${body || ""}`.toLowerCase();
  if (source.includes("reengagement") || source.includes("reenganche")) return "reengagement";
  if (source.includes("saludo") || source.includes("greeting")) return "greeting";
  if (source.includes("fallback") || source.includes("error")) return "error_fallback";
  if (source.includes("humano") || source.includes("derivacion")) return "handoff_human";
  if (source.includes("confirm")) return "confirmation";
  if (source.includes("pedido") || source.includes("seguimiento")) return "follow_up";
  return "custom";
}

function buildKeyWithUsage(key: string | null | undefined, usageType: string | undefined, name: string) {
  if (key) return key;
  const slug = name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  return usageType ? `${usageType.toLowerCase()}__${slug}` : null;
}

async function buildContext(tenantId: number, orderId?: number) {
  const config = await storage.getConfig(tenantId);
  const ctx: Record<string, string | number> = {
    negocio_nombre: config?.businessName || "Mi negocio",
    cliente_nombre: "",
    cliente_telefono: "",
    pedido_numero: "",
    pedido_estado: "",
    pedido_total: "",
    pedido_fecha: "",
    direccion_entrega: "",
  };

  if (!orderId) return { context: ctx, order: null, config };

  const order = await storage.getOrderById(orderId, tenantId);
  if (!order) return { context: ctx, order: null, config };

  const status = order.statusId ? await storage.getOrderStatusById(order.statusId, tenantId) : null;
  ctx.cliente_nombre = order.customerName || "";
  ctx.cliente_telefono = order.customerPhone || "";
  ctx.pedido_numero = String(order.orderNumber || "");
  ctx.pedido_estado = status?.name || "";
  ctx.pedido_total = order.totalAmount ? String(order.totalAmount) : "";
  ctx.pedido_fecha = order.createdAt ? new Date(order.createdAt).toLocaleString("es-AR") : "";
  ctx.direccion_entrega = order.deliveryAddress || "";

  return { context: ctx, order, config };
}

export function registerMessageTemplateRoutes(app: Express) {
  app.get("/api/message-templates", tenantAuth, requireAddon("messaging_whatsapp"), async (req, res) => {
    try {
      const includeInactive = req.query.includeInactive === "1";
      const tenantId = req.auth!.tenantId!;
      const where = includeInactive
        ? and(eq(messageTemplates.tenantId, tenantId), isNull(messageTemplates.deletedAt))
        : and(eq(messageTemplates.tenantId, tenantId), isNull(messageTemplates.deletedAt), eq(messageTemplates.isActive, true));
      const dataRaw = await db.select().from(messageTemplates).where(where).orderBy(desc(messageTemplates.updatedAt));
      const data = dataRaw.map((tpl) => ({ ...tpl, usageType: normalizeUsageType((tpl as any).usageType || inferUsageType(tpl.key, tpl.body)) }));
      const config = await storage.getConfig(tenantId);
      const channel = await getTenantChannel(tenantId);
      const defaultCountry = String((config?.configJson as any)?.defaultCountry || "AR");
      const sendMode = channel?.isActive ? "official_api_ready" : "wa_me_fallback";
      res.json({ data, defaultCountry, sendMode });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/message-templates", tenantAuth, requireAddon("messaging_whatsapp"), requireTenantAdmin, blockBranchScope, async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const payload = createTemplateSchema.parse(req.body || {});

      const existing = await db
        .select({ id: messageTemplates.id })
        .from(messageTemplates)
        .where(and(eq(messageTemplates.tenantId, tenantId), isNull(messageTemplates.deletedAt)));
      if (existing.length >= 20) {
        return res.status(400).json({ error: "Solo podés crear hasta 20 plantillas." });
      }

      const [created] = await db
        .insert(messageTemplates)
        .values({
          tenantId,
          name: payload.name,
          body: payload.body,
          isActive: payload.isActive,
          key: buildKeyWithUsage(payload.key || null, normalizeUsageType(payload.usageType), payload.name),
          channel: "whatsapp_link",
          updatedAt: new Date(),
        })
        .returning();

      res.status(201).json({ data: created });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", details: err.errors });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/message-templates/:id", tenantAuth, requireAddon("messaging_whatsapp"), requireTenantAdmin, blockBranchScope, async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const id = parseInt(String(req.params.id), 10);
      const payload = updateTemplateSchema.parse(req.body || {});
      const patch: Record<string, unknown> = { ...payload, updatedAt: new Date() };
      if (payload.usageType && !payload.key) {
        const [current] = await db.select().from(messageTemplates).where(and(eq(messageTemplates.id, id), eq(messageTemplates.tenantId, tenantId), isNull(messageTemplates.deletedAt))).limit(1);
        if (current) {
          patch.key = buildKeyWithUsage(current.key || null, normalizeUsageType(payload.usageType), payload.name || current.name);
        }
      }
      delete (patch as any).usageType;
      const [updated] = await db
        .update(messageTemplates)
        .set(patch as any)
        .where(and(eq(messageTemplates.id, id), eq(messageTemplates.tenantId, tenantId), isNull(messageTemplates.deletedAt)))
        .returning();
      if (!updated) return res.status(404).json({ error: "Plantilla no encontrada" });
      res.json({ data: updated });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", details: err.errors });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/message-templates/:id", tenantAuth, requireAddon("messaging_whatsapp"), requireTenantAdmin, blockBranchScope, async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const id = parseInt(String(req.params.id), 10);
      await db
        .update(messageTemplates)
        .set({ deletedAt: new Date(), updatedAt: new Date(), isActive: false })
        .where(and(eq(messageTemplates.id, id), eq(messageTemplates.tenantId, tenantId), isNull(messageTemplates.deletedAt)));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/message-templates/render", tenantAuth, requireAddon("messaging_whatsapp"), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const { templateBody, orderId } = renderSchema.parse(req.body || {});
      const { context, order, config } = await buildContext(tenantId, orderId);
      const renderedText = renderTemplate(templateBody, context);
      const channel = await getTenantChannel(tenantId);
      const defaultCountry = String((config?.configJson as any)?.defaultCountry || "AR");
      const normalizedPhone = normalizePhoneE164(order?.customerPhone || "", defaultCountry);
      const sendMode = channel?.isActive ? "official_api_ready" : "wa_me_fallback";
      res.json({ renderedText, normalizedPhone, context, sendMode });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", details: err.errors });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/message-templates/default-country", tenantAuth, requireAddon("messaging_whatsapp"), requireTenantAdmin, blockBranchScope, async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const { defaultCountry } = countrySchema.parse(req.body || {});
      const config = await storage.getConfig(tenantId);
      const configJson = { ...((config?.configJson as Record<string, any>) || {}), defaultCountry: defaultCountry.toUpperCase() };
      const saved = await storage.upsertConfig({ tenantId, configJson });
      res.json({ data: { defaultCountry: (saved.configJson as any)?.defaultCountry || "AR" } });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", details: err.errors });
      }
      res.status(500).json({ error: err.message });
    }
  });
}
