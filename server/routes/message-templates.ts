import type { Express } from "express";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireAddon, requireTenantAdmin, tenantAuth, blockBranchScope } from "../auth";
import { db } from "../db";
import { messageTemplates } from "@shared/schema";
import { storage } from "../storage";
import { normalizePhoneE164, renderTemplate } from "../lib/messaging";

const createTemplateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  body: z.string().trim().min(2).max(4000),
  isActive: z.boolean().optional().default(true),
  key: z.string().trim().max(60).optional(),
});

const updateTemplateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  body: z.string().trim().min(2).max(4000).optional(),
  isActive: z.boolean().optional(),
  key: z.string().trim().max(60).optional(),
});

const renderSchema = z.object({
  templateBody: z.string().trim().min(1).max(4000),
  orderId: z.coerce.number().int().positive().optional(),
});

const countrySchema = z.object({
  defaultCountry: z.string().trim().min(2).max(4),
});

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
      const data = await db.select().from(messageTemplates).where(where).orderBy(desc(messageTemplates.updatedAt));
      const config = await storage.getConfig(tenantId);
      const defaultCountry = String((config?.configJson as any)?.defaultCountry || "AR");
      res.json({ data, defaultCountry });
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
          key: payload.key || null,
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
      const [updated] = await db
        .update(messageTemplates)
        .set({ ...payload, updatedAt: new Date() })
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
      const defaultCountry = String((config?.configJson as any)?.defaultCountry || "AR");
      const normalizedPhone = normalizePhoneE164(order?.customerPhone || "", defaultCountry);
      res.json({ renderedText, normalizedPhone, context });
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
