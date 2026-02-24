import type { Express } from "express";
import { storage } from "../storage";
import { tenantAuth, enforceBranchScope } from "../auth";
import { z } from "zod";
import { randomUUID } from "crypto";
import { refreshMetricsForDate } from "../services/metrics-refresh";
import { getIdempotencyKey, hashPayload, getIdempotentResponse, saveIdempotentResponse } from "../services/idempotency";
import { sanitizeLongText, sanitizeShortText } from "../security/sanitize";
import { validateBody, validateParams } from "../middleware/validate";
import { getDefaultStatus, resolveOrderStatusIdByCode, ensureStatusExists, normalizeStatusCode } from "../services/statuses";
import { db } from "../db";
import { and, count, eq } from "drizzle-orm";
import { orderFieldValues, orders, orderStatusHistory } from "@shared/schema";
import { HttpError } from "../lib/http-errors";
import { getOrderCustomFields, saveCustomFieldValues, validateAndNormalizeCustomFields } from "../services/order-custom-fields";

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

const sanitizeOptionalShort = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().transform((value) => sanitizeShortText(value, max)).optional()
  );

const sanitizeOptionalLong = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().transform((value) => sanitizeLongText(value, max)).optional()
  );

const customFieldSchema = z.object({
  fieldId: z.coerce.number().int().positive().optional(),
  fieldKey: z.string().trim().min(1).max(80).optional(),
  valueText: z.string().optional().nullable(),
  valueNumber: z.union([z.string(), z.number()]).optional().nullable(),
  fileId: z.union([z.string(), z.number()]).optional().nullable(),
  fileStorageKey: z.string().optional().nullable(),
});

const createOrderSchema = z.object({
  type: sanitizeOptionalShort(30),
  orderTypeCode: sanitizeOptionalShort(30),
  customerName: sanitizeOptionalShort(120).nullable(),
  customerPhone: sanitizeOptionalShort(40).nullable(),
  customerEmail: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().email().max(120).optional()
  ).nullable(),
  description: sanitizeOptionalLong(500).nullable(),
  statusId: z.coerce.number().int().positive().optional().nullable(),
  statusCode: z.string().max(40).optional().nullable(),
  totalAmount: z.union([z.number(), z.string()]).optional().nullable(),
  branchId: z.coerce.number().int().positive().optional().nullable(),
  requiresDelivery: z.boolean().optional(),
  deliveryAddress: sanitizeOptionalLong(200).nullable(),
  deliveryCity: sanitizeOptionalShort(80).nullable(),
  deliveryAddressNotes: sanitizeOptionalLong(200).nullable(),
  customFields: z.array(customFieldSchema).optional(),
});

const orderStatusSchema = z.object({
  statusId: z.coerce.number().int().positive().optional(),
  statusCode: z.string().max(40).optional(),
  note: z.string().transform((value) => sanitizeLongText(value, 200)).optional().nullable(),
});

const orderCommentSchema = z.object({
  content: z.string().transform((value) => sanitizeLongText(value, 500)).refine((value) => value.length > 0, "Comentario requerido"),
  isPublic: z.boolean().optional(),
});

const linkSaleSchema = z.object({
  saleId: z.coerce.number().int().positive(),
});

const updateOrderSchema = z.object({
  type: sanitizeOptionalShort(30).optional(),
  orderTypeCode: sanitizeOptionalShort(30).optional(),
  customerName: sanitizeOptionalShort(120).nullable().optional(),
  customerPhone: sanitizeOptionalShort(40).nullable().optional(),
  customerEmail: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().email().max(120).optional()
  ).nullable().optional(),
  description: sanitizeOptionalLong(500).nullable().optional(),
  totalAmount: z.union([z.number(), z.string()]).optional().nullable(),
  customFields: z.array(customFieldSchema).optional(),
});


export function registerOrderRoutes(app: Express) {
  app.get("/api/orders", tenantAuth, enforceBranchScope, async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      let data;
      if (req.auth!.scope === "BRANCH" && req.auth!.branchId) {
        data = await storage.getOrdersByBranch(tenantId, req.auth!.branchId);
      } else {
        data = await storage.getOrders(tenantId);
      }
      res.json({ data });
    } catch (err: any) {
      if (err instanceof HttpError) {
        return res.status(err.status).json({ error: { code: err.code, message: err.message } });
      }
      res.status(500).json({ error: "No se pudo procesar la orden", code: "ORDER_ERROR" });
    }
  });

  app.post("/api/orders", tenantAuth, enforceBranchScope, validateBody(createOrderSchema), async (req, res) => {
    try {
      const payload = req.body as z.infer<typeof createOrderSchema>;
      const tenantId = req.auth!.tenantId!;
      const userId = req.auth!.userId;
      const idemKey = getIdempotencyKey(req.headers["idempotency-key"] as string | undefined);
      const requestHash = hashPayload(payload);

      if (idemKey) {
        const cached = await getIdempotentResponse(tenantId, userId, idemKey, "POST:/api/orders", requestHash).catch((e) => {
          if (e.message === "IDEMPOTENCY_HASH_MISMATCH") {
            return { status: 409, body: { error: "La misma Idempotency-Key fue usada con otro payload", code: "IDEMPOTENCY_HASH_MISMATCH" } };
          }
          throw e;
        });
        if (cached) {
          return res.status(cached.status).json(cached.body as any);
        }
      }

      const orderNumber = await storage.getNextOrderNumber(tenantId);
      const branchId = req.auth!.scope === "BRANCH" ? req.auth!.branchId : (payload.branchId || null);
      const defaultOrderStatus = await getDefaultStatus(tenantId, "ORDER");
      const resolvedCreateStatusId = payload.statusId
        || (payload.statusCode ? await resolveOrderStatusIdByCode(tenantId, normalizeStatusCode(payload.statusCode)) : null)
        || (defaultOrderStatus ? await resolveOrderStatusIdByCode(tenantId, defaultOrderStatus.code) : null)
        || null;
      const orderTypeCode = (payload.orderTypeCode || payload.type || "PEDIDO").toUpperCase();
      const customPayload = payload.customFields || [];
      const validatedCustom = customPayload.length > 0
        ? await validateAndNormalizeCustomFields(tenantId, orderTypeCode, customPayload)
        : null;

      const data = await db.transaction(async (tx) => {
        const [created] = await tx.insert(orders).values({
          tenantId,
          orderNumber,
          type: orderTypeCode,
          customerName: payload.customerName || null,
          customerPhone: payload.customerPhone || null,
          customerEmail: payload.customerEmail || null,
          description: payload.description || null,
          statusId: resolvedCreateStatusId,
          totalAmount: payload.totalAmount !== undefined && payload.totalAmount !== null ? String(payload.totalAmount) : null,
          branchId,
          createdById: req.auth!.userId,
          createdByScope: req.auth!.scope || "TENANT",
          createdByBranchId: req.auth!.branchId || null,
          requiresDelivery: payload.requiresDelivery || false,
          deliveryAddress: payload.deliveryAddress || null,
          deliveryCity: payload.deliveryCity || null,
          deliveryAddressNotes: payload.deliveryAddressNotes || null,
          deliveryStatus: payload.requiresDelivery ? "pending" : null,
        }).returning();

        if (created.statusId) {
          await tx.insert(orderStatusHistory).values({
            tenantId,
            orderId: created.id,
            statusId: created.statusId,
            changedById: req.auth!.userId,
            note: "Pedido creado",
          });
        }

        if (validatedCustom && validatedCustom.normalized.length > 0) {
          for (const row of validatedCustom.normalized) {
            await tx.insert(orderFieldValues).values({
              tenantId,
              orderId: created.id,
              fieldDefinitionId: row.fieldDefinitionId,
              valueText: row.valueText,
              valueNumber: row.valueNumber,
              fileStorageKey: row.fileStorageKey,
            });
          }
        }

        return created;
      });
      await refreshMetricsForDate(tenantId, new Date());
      const responseBody = { data };
      if (idemKey) {
        await saveIdempotentResponse({
          tenantId,
          userId,
          key: idemKey,
          route: "POST:/api/orders",
          requestHash,
          status: 201,
          body: responseBody,
        });
      }
      res.status(201).json(responseBody);
    } catch (err: any) {
      if (err instanceof HttpError) {
        return res.status(err.status).json({ error: { code: err.code, message: err.message, ...(err.extra || {}) } });
      }
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", code: "ORDER_INVALID", details: err.errors });
      }
      res.status(500).json({ error: "No se pudo procesar la orden", code: "ORDER_ERROR" });
    }
  });

  app.get("/api/orders/:id/custom-fields", tenantAuth, enforceBranchScope, validateParams(idParamSchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const id = Number(req.params.id);
      const order = await storage.getOrderById(id, tenantId);
      if (!order) return res.status(404).json({ error: "Pedido no encontrado" });
      const customFields = await getOrderCustomFields(id, tenantId);
      return res.json({ data: { orderId: id, orderTypeCode: order.type, customFields } });
    } catch (err: any) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: { code: err.code, message: err.message, ...(err.extra || {}) } });
      return res.status(500).json({ error: "No se pudo procesar la orden", code: "ORDER_ERROR" });
    }
  });

  app.patch("/api/orders/:id", tenantAuth, enforceBranchScope, validateParams(idParamSchema), validateBody(updateOrderSchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const id = Number(req.params.id);
      const payload = req.body as z.infer<typeof updateOrderSchema>;
      const current = await storage.getOrderById(id, tenantId);
      if (!current) return res.status(404).json({ error: "Pedido no encontrado" });

      const nextType = (payload.orderTypeCode || payload.type || current.type || "PEDIDO").toUpperCase();
      if (nextType !== String(current.type || "").toUpperCase()) {
        const [row] = await db.select({ c: count() }).from(orderFieldValues).where(and(eq(orderFieldValues.orderId, id), eq(orderFieldValues.tenantId, tenantId)));
        if ((row?.c || 0) > 0) {
          return res.status(400).json({ error: { code: "ORDER_TYPE_CHANGE_BLOCKED", message: "No se puede cambiar el tipo con custom fields existentes" } });
        }
      }
      await db.update(orders).set({
        type: nextType,
        customerName: payload.customerName !== undefined ? (payload.customerName || null) : current.customerName,
        customerPhone: payload.customerPhone !== undefined ? (payload.customerPhone || null) : current.customerPhone,
        customerEmail: payload.customerEmail !== undefined ? (payload.customerEmail || null) : current.customerEmail,
        description: payload.description !== undefined ? (payload.description || null) : current.description,
        totalAmount: payload.totalAmount !== undefined ? (payload.totalAmount !== null ? String(payload.totalAmount) : null) : current.totalAmount,
        updatedAt: new Date(),
      }).where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)));

      if (payload.customFields) {
        const normalized = await validateAndNormalizeCustomFields(tenantId, nextType, payload.customFields);
        await saveCustomFieldValues(id, tenantId, normalized.normalized);
      }

      const saved = await storage.getOrderById(id, tenantId);
      const customFields = await getOrderCustomFields(id, tenantId);
      return res.json({ data: saved, customFields });
    } catch (err: any) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: { code: err.code, message: err.message, ...(err.extra || {}) } });
      return res.status(500).json({ error: "No se pudo procesar la orden", code: "ORDER_ERROR" });
    }
  });

  app.patch("/api/orders/:id/status", tenantAuth, enforceBranchScope, validateParams(idParamSchema), validateBody(orderStatusSchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const orderId = req.params.id as unknown as number;
      const { statusId, statusCode, note } = req.body as z.infer<typeof orderStatusSchema>;
      let resolvedStatusId = statusId || null;
      if (!resolvedStatusId && statusCode) {
        const normalizedCode = normalizeStatusCode(statusCode);
        await ensureStatusExists(tenantId, "ORDER", normalizedCode);
        resolvedStatusId = await resolveOrderStatusIdByCode(tenantId, normalizedCode);
      }
      if (!resolvedStatusId) return res.status(400).json({ error: "statusId o statusCode requerido" });
      const order = await storage.getOrderById(orderId, tenantId);
      if (!order) return res.status(404).json({ error: "Pedido no encontrado" });
      if (req.auth!.scope === "BRANCH" && order.branchId !== req.auth!.branchId) {
        return res.status(403).json({ error: "No tenés acceso a este pedido" });
      }
      await storage.updateOrderStatus(orderId, tenantId, resolvedStatusId);
      await storage.createOrderHistory({
        tenantId,
        orderId,
        statusId: resolvedStatusId,
        changedById: req.auth!.userId,
        note: note || null,
      });
      const status = await storage.getOrderStatusById(resolvedStatusId, tenantId);
      if (status?.isFinal) {
        const config = await storage.getConfig(tenantId);
        const hours = config?.trackingExpirationHours || 24;
        const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
        if (order.publicTrackingId) {
          await storage.updateOrderTracking(orderId, tenantId, order.publicTrackingId, expiresAt);
        }
      }
      await refreshMetricsForDate(tenantId, new Date());
      res.json({ ok: true });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", code: "ORDER_INVALID", details: err.errors });
      }
      res.status(500).json({ error: "No se pudo procesar la orden", code: "ORDER_ERROR" });
    }
  });


  app.patch("/api/orders/:id/link-sale", tenantAuth, enforceBranchScope, validateParams(idParamSchema), validateBody(linkSaleSchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const orderId = req.params.id as unknown as number;
      const { saleId } = req.body as z.infer<typeof linkSaleSchema>;
      const order = await storage.getOrderById(orderId, tenantId);
      if (!order) return res.status(404).json({ error: "Pedido no encontrado" });
      if (req.auth!.scope === "BRANCH" && order.branchId !== req.auth!.branchId) {
        return res.status(403).json({ error: "No tenés acceso a este pedido" });
      }
      const sale = await storage.getSaleById(saleId, tenantId);
      if (!sale) return res.status(404).json({ error: "Venta no encontrada" });
      if (req.auth!.scope === "BRANCH" && sale.branchId !== req.auth!.branchId) {
        return res.status(403).json({ error: "No tenés acceso a esta venta" });
      }
      await storage.linkOrderSale(orderId, tenantId, saleId, (sale as any).publicToken || null);
      return res.json({ ok: true, data: { orderId, saleId, salePublicToken: (sale as any).publicToken || null } });
    } catch {
      return res.status(500).json({ error: "No se pudo vincular venta", code: "ORDER_LINK_SALE_ERROR" });
    }
  });

  app.get("/api/orders/:id/comments", tenantAuth, enforceBranchScope, async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const orderId = parseInt(req.params.id as string);

      // Validate ownership
      const order = await storage.getOrderById(orderId, tenantId);
      if (!order) return res.status(404).json({ error: "Pedido no encontrado" });

      // Validate branch scope
      if (req.auth!.scope === "BRANCH" && order.branchId !== req.auth!.branchId) {
        return res.status(403).json({ error: "No tenés acceso a este pedido" });
      }

      const data = await storage.getOrderComments(orderId, tenantId);
      res.json({ data });
    } catch (err: any) {
      res.status(500).json({ error: "No se pudo procesar la orden", code: "ORDER_ERROR" });
    }
  });

  app.post("/api/orders/:id/comments", tenantAuth, enforceBranchScope, validateParams(idParamSchema), validateBody(orderCommentSchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const orderId = req.params.id as unknown as number;

      // Validate ownership
      const order = await storage.getOrderById(orderId, tenantId);
      if (!order) return res.status(404).json({ error: "Pedido no encontrado" });

      // Validate branch scope
      if (req.auth!.scope === "BRANCH" && order.branchId !== req.auth!.branchId) {
        return res.status(403).json({ error: "No tenés acceso a este pedido" });
      }

      const payload = req.body as z.infer<typeof orderCommentSchema>;
      const data = await storage.createOrderComment({
        tenantId,
        orderId,
        userId: req.auth!.userId,
        content: payload.content,
        isPublic: payload.isPublic || false,
      });
      res.status(201).json({ data });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", code: "ORDER_INVALID", details: err.errors });
      }
      res.status(500).json({ error: "No se pudo procesar la orden", code: "ORDER_ERROR" });
    }
  });

  app.get("/api/orders/:id/history", tenantAuth, enforceBranchScope, async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const orderId = parseInt(req.params.id as string);

      // Validate ownership
      const order = await storage.getOrderById(orderId, tenantId);
      if (!order) return res.status(404).json({ error: "Pedido no encontrado" });

      // Validate branch scope
      if (req.auth!.scope === "BRANCH" && order.branchId !== req.auth!.branchId) {
        return res.status(403).json({ error: "No tenés acceso a este pedido" });
      }

      const data = await storage.getOrderHistory(orderId, tenantId);
      res.json({ data });
    } catch (err: any) {
      res.status(500).json({ error: "No se pudo procesar la orden", code: "ORDER_ERROR" });
    }
  });


  app.get("/api/orders/:id/print-data", tenantAuth, enforceBranchScope, validateParams(idParamSchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const orderId = req.params.id as unknown as number;
      const order = await storage.getOrderById(orderId, tenantId);
      if (!order) return res.status(404).json({ error: "Pedido no encontrado" });
      if (req.auth!.scope === "BRANCH" && order.branchId !== req.auth!.branchId) {
        return res.status(403).json({ error: "No tenés acceso a este pedido" });
      }

      const [tenant, branding, statuses] = await Promise.all([
        storage.getTenantById(tenantId),
        storage.getTenantBranding(tenantId),
        storage.getOrderStatuses(tenantId),
      ]);
      const status = statuses.find((s) => s.id === order.statusId);

      if (!order.publicTrackingId) {
        const config = await storage.getConfig(tenantId);
        const hours = config?.trackingExpirationHours || 24;
        const trackingId = randomUUID();
        const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
        await storage.updateOrderTracking(orderId, tenantId, trackingId, expiresAt);
        order.publicTrackingId = trackingId as any;
      }

      const slug = (tenant as any)?.slug || null;
      const base = (process.env.PUBLIC_APP_URL || "").trim().replace(/\/$/, "") || "";
      const trackUrl = slug
        ? `${base || ""}/tracking/${order.publicTrackingId}`
        : `${base || ""}/tracking/${order.publicTrackingId}`;

      return res.json({
        data: {
          tenant: { name: branding.displayName, logoUrl: branding.logoUrl, slug },
          order: {
            id: order.id,
            number: order.orderNumber,
            type: order.type,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            createdAt: order.createdAt,
            status: status?.name || "Sin estado",
            statusColor: status?.color || "#6B7280",
            description: order.description,
            deliveryAddress: order.deliveryAddress,
            deliveryCity: order.deliveryCity,
            totalAmount: order.totalAmount,
          },
          qr: {
            publicUrl: trackUrl,
          },
        },
      });
    } catch {
      return res.status(500).json({ error: "No se pudo preparar ticket de pedido" });
    }
  });

  app.post("/api/orders/:id/tracking-link", tenantAuth, async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const orderId = parseInt(req.params.id as string);
      const order = await storage.getOrderById(orderId, tenantId);
      if (!order) return res.status(404).json({ error: "Pedido no encontrado" });
      const config = await storage.getConfig(tenantId);
      const hours = config?.trackingExpirationHours || 24;
      const trackingId = randomUUID();
      const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
      await storage.updateOrderTracking(orderId, tenantId, trackingId, expiresAt);
      res.json({ data: { publicTrackingId: trackingId, expiresAt } });
    } catch (err: any) {
      res.status(500).json({ error: "No se pudo procesar la orden", code: "ORDER_ERROR" });
    }
  });

  app.get("/api/orders/:orderId/delivery-proofs", tenantAuth, async (req, res) => {
    try {
      const orderId = parseInt(req.params.orderId as string);
      const proofs = await storage.getDeliveryProofsByOrder(orderId);
      res.json({ data: proofs });
    } catch (err: any) {
      res.status(500).json({ error: "No se pudo procesar la orden", code: "ORDER_ERROR" });
    }
  });
}
