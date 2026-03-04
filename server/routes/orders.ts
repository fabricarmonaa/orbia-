import type { Express } from "express";
import { storage } from "../storage";
import { tenantAuth } from "../auth";
import { resolveBranchScope, requireBranchAccess } from "../middleware/branch-scope";
import { z } from "zod";
import { buildThermalTicketPdf } from "../services/pdf/thermal-ticket";
import { refreshMetricsForDate } from "../services/metrics-refresh";
import { getIdempotencyKey, hashPayload, getIdempotentResponse, saveIdempotentResponse } from "../services/idempotency";
import { sanitizeLongText, sanitizeShortText } from "../security/sanitize";
import { validateBody, validateParams, validateQuery } from "../middleware/validate";
import { logAuditEventFromRequest } from "../services/audit";
import { refreshAnalyticsViews } from "../services/analytics";
import { getDefaultStatus, resolveOrderStatusIdByCode, resolveCanonicalOrderStatusId, normalizeDeliveryStatus } from "../services/statuses";
import { db } from "../db";
import { and, count, eq, sql } from "drizzle-orm";
import { orderFieldDefinitions, orderFieldValues, orderTypeDefinitions, orderTypePresets, orders, orderStatusHistory } from "@shared/schema";
import { HttpError } from "../lib/http-errors";
import { getOrderCustomFields, saveCustomFieldValues, validateAndNormalizeCustomFields } from "../services/order-custom-fields";
import { getTenantEffectiveTrackingHours } from "../services/tracking-ttl";
import { changeOrderStatusWithHistory, validateOrderScope } from "../services/orders-service";
import { generatePublicToken } from "../utils/public-token";

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
const ordersListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  page: z.coerce.number().int().min(1).optional(),
  cursor: z.string().min(1).optional(),
});

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
  valueBool: z.boolean().optional().nullable(),
  valueDate: z.string().optional().nullable(),
  valueJson: z.any().optional().nullable(),
  valueMoneyAmount: z.union([z.string(), z.number()]).optional().nullable(),
  valueMoneyDirection: z.coerce.number().int().optional().nullable(),
  currency: z.string().max(3).optional().nullable(),
  fileId: z.union([z.string(), z.number()]).optional().nullable(),
  fileStorageKey: z.string().optional().nullable(),
  visibleOverride: z.boolean().optional().nullable(),
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
  orderPresetId: z.coerce.number().int().positive().optional().nullable(),
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
  orderPresetId: z.coerce.number().int().positive().optional().nullable(),
});



async function applyDeliveredMoneyImpact(params: { tenantId: number; orderId: number; branchId: number | null; userId: number; orderPresetId?: number | null }) {
  const [order] = await db.select({ id: orders.id, deliveredCashMovementId: orders.deliveredCashMovementId }).from(orders).where(and(eq(orders.id, params.orderId), eq(orders.tenantId, params.tenantId)));
  if (!order || order.deliveredCashMovementId) return null;

  const rows = await db.select({
    valueMoneyAmount: orderFieldValues.valueMoneyAmount,
    valueMoneyDirection: orderFieldValues.valueMoneyDirection,
    currency: orderFieldValues.currency,
    label: orderFieldDefinitions.label,
    fieldType: orderFieldDefinitions.fieldType,
  }).from(orderFieldValues)
    .innerJoin(orderFieldDefinitions, eq(orderFieldDefinitions.id, orderFieldValues.fieldDefinitionId))
    .where(and(eq(orderFieldValues.tenantId, params.tenantId), eq(orderFieldValues.orderId, params.orderId), eq(orderFieldDefinitions.fieldType, "MONEY")));

  const breakdown = rows
    .filter((r) => r.valueMoneyAmount != null)
    .map((r) => ({
      label: r.label,
      amount: Number(r.valueMoneyAmount || 0),
      direction: Number(r.valueMoneyDirection || 1) >= 0 ? 1 : -1,
      currency: (r.currency || "ARS").toUpperCase(),
    }));

  if (breakdown.length === 0) return null;
  const net = breakdown.reduce((acc, row) => acc + row.amount * row.direction, 0);
  if (!Number.isFinite(net) || net === 0) return null;

  const openSession = await storage.getOpenSession(params.tenantId, params.branchId || null);
  const movement = await storage.createCashMovement({
    tenantId: params.tenantId,
    sessionId: openSession?.id || null,
    branchId: params.branchId || null,
    type: net > 0 ? "ingreso" : "egreso",
    amount: Math.abs(net).toFixed(2),
    method: "efectivo",
    category: "pedido_money_fields",
    description: `Impacto económico pedido #${params.orderId}`,
    orderId: params.orderId,
    createdById: params.userId,
  });

  await db.update(orders)
    .set({ deliveredCashMovementId: movement.id, updatedAt: new Date() })
    .where(and(eq(orders.id, params.orderId), eq(orders.tenantId, params.tenantId), sql`${orders.deliveredCashMovementId} IS NULL`));

  return { movement, breakdown, net };
}

export function registerOrderRoutes(app: Express) {
  app.get("/api/orders", tenantAuth, resolveBranchScope(false), requireBranchAccess, validateQuery(ordersListQuerySchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const query = ordersListQuerySchema.parse(req.query || {});
      const pagination = { limit: query.limit, page: query.page, cursor: query.cursor };
      const result = (req.auth!.scope === "BRANCH" && req.auth!.branchId)
        ? await storage.getOrdersByBranch(tenantId, req.auth!.branchId, pagination)
        : await storage.getOrders(tenantId, pagination);
      res.json({ data: result.data, items: result.data, meta: result.meta });
    } catch (err: any) {
      if (err instanceof HttpError) {
        return res.status(err.status).json({ error: { code: err.code, message: err.message } });
      }
      res.status(500).json({ error: "No se pudo procesar la orden", code: "ORDER_ERROR" });
    }
  });

  app.post("/api/orders", tenantAuth, resolveBranchScope(true), requireBranchAccess, validateBody(createOrderSchema), async (req, res) => {
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
      const resolvedCreateStatusId = (await resolveCanonicalOrderStatusId({ tenantId, statusId: payload.statusId || null, statusCode: payload.statusCode || null }))
        || (defaultOrderStatus ? await resolveOrderStatusIdByCode(tenantId, defaultOrderStatus.code) : null)
        || null;
      const orderTypeCode = (payload.orderTypeCode || payload.type || "PEDIDO").toUpperCase();

      const [typeRow] = await db
        .select({ id: orderTypeDefinitions.id })
        .from(orderTypeDefinitions)
        .where(and(eq(orderTypeDefinitions.tenantId, tenantId), eq(orderTypeDefinitions.code, orderTypeCode)));

      let resolvedPresetId = payload.orderPresetId || null;
      if (!resolvedPresetId && typeRow) {
        const [defaultPreset] = await db
          .select({ id: orderTypePresets.id })
          .from(orderTypePresets)
          .where(and(eq(orderTypePresets.tenantId, tenantId), eq(orderTypePresets.orderTypeId, typeRow.id), eq(orderTypePresets.isActive, true), eq(orderTypePresets.isDefault, true)));
        const [fallbackPreset] = !defaultPreset ? await db
          .select({ id: orderTypePresets.id })
          .from(orderTypePresets)
          .where(and(eq(orderTypePresets.tenantId, tenantId), eq(orderTypePresets.orderTypeId, typeRow.id), eq(orderTypePresets.isActive, true)))
          .orderBy(orderTypePresets.sortOrder)
          .limit(1) : [];
        resolvedPresetId = defaultPreset?.id || fallbackPreset?.id || null;
      }

      const customPayload = payload.customFields || [];
      const validatedCustom = customPayload.length > 0
        ? await validateAndNormalizeCustomFields(tenantId, orderTypeCode, customPayload, resolvedPresetId)
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
          deliveryStatus: payload.requiresDelivery ? normalizeDeliveryStatus("PENDING").toLowerCase() : null,
          orderPresetId: resolvedPresetId || null,
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
          const fieldKeyById = new Map(validatedCustom.defs.map((def) => [def.id, def.fieldKey]));
          for (const row of validatedCustom.normalized) {
            await tx.insert(orderFieldValues).values({
              tenantId,
              orderId: created.id,
              fieldDefinitionId: row.fieldDefinitionId,
              fieldKey: fieldKeyById.get(row.fieldDefinitionId) || null,
              valueText: row.valueText,
              valueNumber: row.valueNumber,
              valueBool: row.valueBool,
              valueDate: row.valueDate,
              valueJson: row.valueJson,
              valueMoneyAmount: row.valueMoneyAmount,
              valueMoneyDirection: row.valueMoneyDirection,
              currency: row.currency,
              fileStorageKey: row.fileStorageKey,
              visibleOverride: row.visibleOverride ?? null,
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

  app.get("/api/orders/:id/custom-fields", tenantAuth, validateParams(idParamSchema), async (req, res) => {
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

  app.patch("/api/orders/:id", tenantAuth, validateParams(idParamSchema), validateBody(updateOrderSchema), async (req, res) => {
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
        orderPresetId: payload.orderPresetId !== undefined ? (payload.orderPresetId || null) : current.orderPresetId,
        updatedAt: new Date(),
      }).where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)));

      const targetPresetId = payload.orderPresetId !== undefined ? payload.orderPresetId : current.orderPresetId;
      if (payload.customFields) {
        const normalized = await validateAndNormalizeCustomFields(tenantId, nextType, payload.customFields, targetPresetId);
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

  app.patch("/api/orders/:id/status", tenantAuth, resolveBranchScope(true), requireBranchAccess, validateParams(idParamSchema), validateBody(orderStatusSchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const orderId = req.params.id as unknown as number;
      const { statusId, statusCode, note } = req.body as z.infer<typeof orderStatusSchema>;
      const resolvedStatusId = await resolveCanonicalOrderStatusId({ tenantId, statusId: statusId || null, statusCode: statusCode || null });
      if (!resolvedStatusId) return res.status(400).json({ error: "statusId o statusCode requerido" });
      const scopeCheck = await validateOrderScope(tenantId, orderId, req.auth!.scope as any, req.auth!.branchId);
      if (!scopeCheck.ok) return res.status(scopeCheck.status).json({ error: scopeCheck.message });
      const order = scopeCheck.order;

      await changeOrderStatusWithHistory({
        tenantId,
        orderId,
        statusId: resolvedStatusId,
        changedById: req.auth!.userId,
        note: note || null,
      });
      const status = await storage.getOrderStatusById(resolvedStatusId, tenantId);
      if (status?.isFinal) {
        const hours = await getTenantEffectiveTrackingHours(tenantId);
        const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
        if (order.publicTrackingId) {
          await storage.updateOrderTracking(orderId, tenantId, order.publicTrackingId, expiresAt);
        }
      }
      let moneyImpact: any = null;
      if (status?.isFinal) {
        moneyImpact = await applyDeliveredMoneyImpact({
          tenantId,
          orderId,
          branchId: order.branchId || null,
          userId: req.auth!.userId,
          orderPresetId: order.orderPresetId || null,
        });
      }
      await refreshMetricsForDate(tenantId, new Date());
      logAuditEventFromRequest(req, {
        action: status?.isFinal ? "pedido.entregado" : "pedido.estado.actualizado",
        entityType: "order",
        entityId: orderId,
        metadata: { previousStatusId: order.statusId || null, newStatusId: resolvedStatusId, note: note || null, isFinal: Boolean(status?.isFinal), moneyImpactNet: moneyImpact?.net || null, moneyImpactMovementId: moneyImpact?.movement?.id || null },
      });
      refreshAnalyticsViews();
      if (moneyImpact?.movement?.id) {
        logAuditEventFromRequest(req, {
          action: "ORDER_DELIVERED_CASH_IMPACT",
          entityType: "cash_movement",
          entityId: moneyImpact.movement.id,
          metadata: { orderId, net: moneyImpact.net, breakdown: moneyImpact.breakdown },
        });
      }
      res.json({ ok: true });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", code: "ORDER_INVALID", details: err.errors });
      }
      res.status(500).json({ error: "No se pudo procesar la orden", code: "ORDER_ERROR" });
    }
  });


  app.patch("/api/orders/:id/link-sale", tenantAuth, validateParams(idParamSchema), validateBody(linkSaleSchema), async (req, res) => {
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

  app.get("/api/orders/:id/comments", tenantAuth, async (req, res) => {
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

  app.post("/api/orders/:id/comments", tenantAuth, validateParams(idParamSchema), validateBody(orderCommentSchema), async (req, res) => {
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
        isPublic: payload.isPublic ?? true,
      });
      res.status(201).json({ data });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", code: "ORDER_INVALID", details: err.errors });
      }
      res.status(500).json({ error: "No se pudo procesar la orden", code: "ORDER_ERROR" });
    }
  });

  app.get("/api/orders/:id/history", tenantAuth, async (req, res) => {
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


  app.get("/api/orders/:id/print-data", tenantAuth, validateParams(idParamSchema), async (req, res) => {
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
        const hours = await getTenantEffectiveTrackingHours(tenantId);
        const trackingId = generatePublicToken();
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

  app.get("/api/orders/:id/ticket-pdf", tenantAuth, validateParams(idParamSchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const orderId = req.params.id as unknown as number;
      const width = String(req.query.width || "80") === "58" ? 58 : 80;
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
        const hours = await getTenantEffectiveTrackingHours(tenantId);
        const trackingId = generatePublicToken();
        const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
        await storage.updateOrderTracking(orderId, tenantId, trackingId, expiresAt);
        order.publicTrackingId = trackingId as any;
      }

      const base = (process.env.PUBLIC_APP_URL || "").trim().replace(/\/$/, "") || "";
      const trackUrl = `${base || ""}/tracking/${order.publicTrackingId}`;

      const pdf = await buildThermalTicketPdf({
        widthMm: width,
        companyName: branding.displayName || tenant?.name || "ORBIA",
        ticketLabel: "Pedido",
        ticketNumber: String(order.orderNumber),
        datetime: String(order.createdAt),
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        items: [{ qty: 1, name: String(order.type || "Pedido"), price: String(order.totalAmount || "") }],
        total: String(order.totalAmount || "0"),
        qrUrl: trackUrl,
        notes: order.description,
        footerText: status?.name ? `Estado: ${status.name}` : undefined,
      });

      res.setHeader("X-Frame-Options", "SAMEORIGIN");
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'"
      );
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename=\"pedido-${order.orderNumber}-${width}mm.pdf\"`);
      return res.send(pdf);
    } catch {
      return res.status(500).json({ error: "No se pudo generar ticket PDF", code: "ORDER_TICKET_PDF_ERROR", requestId: req.requestId || null });
    }
  });

  app.post("/api/orders/:id/tracking-link", tenantAuth, async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const orderId = parseInt(req.params.id as string);
      const order = await storage.getOrderById(orderId, tenantId);
      if (!order) return res.status(404).json({ error: "Pedido no encontrado" });
      const hours = await getTenantEffectiveTrackingHours(tenantId);
      const trackingId = generatePublicToken();
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
