import type { Express } from "express";
import { storage } from "../storage";
import { tenantAuth, enforceBranchScope } from "../auth";
import { z } from "zod";
import { buildThermalTicketPdf } from "../services/pdf/thermal-ticket";
import { refreshMetricsForDate } from "../services/metrics-refresh";
import { getIdempotencyKey, hashPayload, getIdempotentResponse, saveIdempotentResponse } from "../services/idempotency";
import { sanitizeLongText, sanitizeShortText } from "../security/sanitize";
import { validateBody, validateParams, validateQuery } from "../middleware/validate";
import { getDefaultStatus, resolveOrderStatusIdByCode, resolveCanonicalOrderStatusCode, normalizeDeliveryStatus, resolveOrderStatusDefinitionByCode, getStatuses } from "../services/statuses";
import { db } from "../db";
import { and, count, eq } from "drizzle-orm";
import { orderFieldValues, orders, orderStatusHistory, cashMovements } from "@shared/schema";
import { HttpError } from "../lib/http-errors";
import { getOrderCustomFields, saveCustomFieldValues, validateAndNormalizeCustomFields } from "../services/order-custom-fields";
import { changeOrderStatusWithHistory, validateOrderScope } from "../services/orders-service";
import { generatePublicToken } from "../utils/public-token";
import { syncOrderAgendaEvents } from "../services/agenda";

/** Decimal-safe payment status calculation (tolerates floating-point rounding) */
function calcPaymentStatus(paid: number, total: number): "UNPAID" | "PARTIAL" | "PAID" {
  if (paid <= 0) return "UNPAID";
  if (paid >= total - 0.01) return "PAID";
  return "PARTIAL";
}

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
  paidAmount: z.coerce.number().min(0).optional().nullable(),
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
  statusCode: z.string().trim().min(1).max(40).optional(),
  note: z.string().transform((value) => sanitizeLongText(value, 200)).optional().nullable(),
});

const orderCommentSchema = z.object({
  content: z.string().transform((value) => sanitizeLongText(value, 500)).refine((value) => value.length > 0, "Comentario requerido"),
  isPublic: z.boolean().optional(),
});

const linkSaleSchema = z.object({
  saleId: z.coerce.number().int().positive(),
});


async function ensureOrderStatusResolved(tenantId: number, order: any) {
  if (!order) return order;
  const currentCode = String(order.statusCode || "").trim();
  if (currentCode) {
    const valid = await resolveOrderStatusDefinitionByCode(tenantId, currentCode, false);
    if (valid) return order;
  }

  const fallback = await getDefaultStatus(tenantId, "ORDER");
  if (!fallback) return order;
  const fallbackStatusId = await resolveOrderStatusIdByCode(tenantId, fallback.code);
  await db.update(orders)
    .set({ statusCode: fallback.code, ...(fallbackStatusId ? { statusId: fallbackStatusId } : {}), updatedAt: new Date() })
    .where(and(eq(orders.id, order.id), eq(orders.tenantId, tenantId)));
  return await storage.getOrderById(order.id, tenantId);
}

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
  paidAmount: z.coerce.number().min(0).optional().nullable(),
  customFields: z.array(customFieldSchema).optional(),
  orderPresetId: z.coerce.number().int().positive().optional().nullable(),
});


export function registerOrderRoutes(app: Express) {
  app.get("/api/orders", tenantAuth, enforceBranchScope, validateQuery(ordersListQuerySchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const query = ordersListQuerySchema.parse(req.query || {});
      const pagination = { limit: query.limit, page: query.page, cursor: query.cursor };
      const result = (req.auth!.scope === "BRANCH" && req.auth!.branchId)
        ? await storage.getOrdersByBranch(tenantId, req.auth!.branchId, pagination)
        : await storage.getOrders(tenantId, pagination);
      const normalizedOrders = await Promise.all((result.data || []).map((row) => ensureOrderStatusResolved(tenantId, row)));
      res.json({ data: normalizedOrders, items: normalizedOrders, meta: result.meta });
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
      const resolvedCreateStatusCode = (await resolveCanonicalOrderStatusCode({ tenantId, statusId: payload.statusId || null, statusCode: payload.statusCode || null, activeOnly: true }))
        || (defaultOrderStatus?.code ?? null);
      if (!resolvedCreateStatusCode) {
        return res.status(400).json({ error: "No hay estado default configurado para pedidos", code: "MISSING_DEFAULT_STATUS" });
      }
      const resolvedCreateStatusId = await resolveOrderStatusIdByCode(tenantId, resolvedCreateStatusCode);
      const orderTypeCode = (payload.orderTypeCode || payload.type || "PEDIDO").toUpperCase();
      const customPayload = payload.customFields || [];
      const validatedCustom = customPayload.length > 0
        ? await validateAndNormalizeCustomFields(tenantId, orderTypeCode, customPayload, payload.orderPresetId)
        : null;

      // Validate paid vs total (cross-field)
      const totalNum = payload.totalAmount !== undefined && payload.totalAmount !== null ? Number(payload.totalAmount) : 0;
      const paidNum = payload.paidAmount !== undefined && payload.paidAmount !== null ? Number(payload.paidAmount) : 0;
      if (paidNum < 0) return res.status(400).json({ error: "El monto pagado no puede ser negativo", code: "PAID_NEGATIVE" });
      if (paidNum > totalNum + 0.01) return res.status(400).json({ error: "El monto pagado no puede superar el total", code: "PAID_EXCEEDS_TOTAL" });

      const data = await db.transaction(async (tx) => {
        // Look up open cash session inside transaction scope
        const openSession = paidNum > 0 ? await storage.getOpenSession(tenantId, branchId ?? null) : null;

        const [created] = await tx.insert(orders).values({
          tenantId,
          orderNumber,
          type: orderTypeCode,
          customerName: payload.customerName || null,
          customerPhone: payload.customerPhone || null,
          customerEmail: payload.customerEmail || null,
          description: payload.description || null,
          statusCode: resolvedCreateStatusCode,
          statusId: resolvedCreateStatusId,
          totalAmount: payload.totalAmount !== undefined && payload.totalAmount !== null ? String(payload.totalAmount) : null,
          paidAmount: String(paidNum.toFixed(2)),
          paymentStatus: calcPaymentStatus(paidNum, totalNum || paidNum),
          branchId,
          createdById: req.auth!.userId,
          createdByScope: req.auth!.scope || "TENANT",
          createdByBranchId: req.auth!.branchId || null,
          requiresDelivery: payload.requiresDelivery || false,
          deliveryAddress: payload.deliveryAddress || null,
          deliveryCity: payload.deliveryCity || null,
          deliveryAddressNotes: payload.deliveryAddressNotes || null,
          deliveryStatus: payload.requiresDelivery ? normalizeDeliveryStatus("PENDING").toLowerCase() : null,
          orderPresetId: payload.orderPresetId || null,
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
              visibleOverride: row.visibleOverride ?? null,
            });
          }
        }

        // Objective B: register cash INGRESO atomically inside the same tx
        let hasCashMovement = false;
        if (paidNum > 0 && openSession) {
          const desc = calcPaymentStatus(paidNum, totalNum || paidNum) === "PARTIAL"
            ? `Pago pedido #${orderNumber}: ${paidNum.toFixed(2)}/${totalNum.toFixed(2)}`
            : `Pago pedido #${orderNumber}: ${paidNum.toFixed(2)}`;
          await tx.insert(cashMovements).values({
            tenantId,
            branchId: branchId ?? null,
            sessionId: openSession.id,
            type: "ingreso",
            amount: String(paidNum.toFixed(2)),
            method: "efectivo",
            category: "Pedidos",
            description: desc,
            orderId: created.id,
            entityType: "ORDER",
            entityId: created.id,
            createdById: req.auth!.userId ?? null,
          });
          hasCashMovement = true;
        }

        return { order: created, hasCashMovement };
      });
      await syncOrderAgendaEvents(tenantId, data.order.id, req.auth!.userId);
      await refreshMetricsForDate(tenantId, new Date());
      const responseBody: Record<string, unknown> = { data: data.order };
      if (!data.hasCashMovement && paidNum > 0) responseBody.cashWarning = "Sin sesi\u00f3n de caja abierta: el ingreso no fue registrado";
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
      console.error("[POST /api/orders] Unhandled error:", err?.message || err, err?.stack);
      res.status(500).json({ error: "No se pudo procesar la orden", code: "ORDER_ERROR", _debug: err?.message });
    }
  });

  app.get("/api/orders/:id/custom-fields", tenantAuth, enforceBranchScope, validateParams(idParamSchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const id = Number(req.params.id);
      const order = await storage.getOrderById(id, tenantId);
      if (!order) return res.status(404).json({ error: "Pedido no encontrado" });
      await syncOrderAgendaEvents(tenantId, id, req.auth!.userId);
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

      // Validate paidAmount if provided
      const newTotal = payload.totalAmount !== undefined && payload.totalAmount !== null
        ? Number(payload.totalAmount)
        : Number(current.totalAmount || 0);
      const newPaid = payload.paidAmount !== undefined && payload.paidAmount !== null
        ? Number(payload.paidAmount)
        : Number(current.paidAmount || 0);
      if (newPaid < 0) return res.status(400).json({ error: "El monto pagado no puede ser negativo", code: "PAID_NEGATIVE" });
      if (newPaid > newTotal + 0.01) return res.status(400).json({ error: "El monto pagado no puede superar el total", code: "PAID_EXCEEDS_TOTAL" });
      const currentPaid = Number(current.paidAmount || 0);
      const diff = parseFloat((newPaid - currentPaid).toFixed(2));

      const updateResult = await db.transaction(async (tx) => {
        await tx.update(orders).set({
          type: nextType,
          customerName: payload.customerName !== undefined ? (payload.customerName || null) : current.customerName,
          customerPhone: payload.customerPhone !== undefined ? (payload.customerPhone || null) : current.customerPhone,
          customerEmail: payload.customerEmail !== undefined ? (payload.customerEmail || null) : current.customerEmail,
          description: payload.description !== undefined ? (payload.description || null) : current.description,
          totalAmount: payload.totalAmount !== undefined ? (payload.totalAmount !== null ? String(payload.totalAmount) : null) : current.totalAmount,
          paidAmount: String(newPaid.toFixed(2)),
          paymentStatus: calcPaymentStatus(newPaid, newTotal),
          orderPresetId: payload.orderPresetId !== undefined ? (payload.orderPresetId || null) : current.orderPresetId,
          updatedAt: new Date(),
        }).where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)));

        // Objective B: register adjustment INGRESO atomically when paidAmount increases
        let hasCashMovement = false;
        if (diff > 0.001) {
          const branchId = req.auth!.scope === "BRANCH" ? req.auth!.branchId : (current.branchId || null);
          const openSession = await storage.getOpenSession(tenantId, branchId ?? null);
          if (openSession) {
            const orderNum = current.orderNumber;
            await tx.insert(cashMovements).values({
              tenantId,
              branchId: branchId ?? null,
              sessionId: openSession.id,
              type: "ingreso",
              amount: String(diff.toFixed(2)),
              method: "efectivo",
              category: "Pedidos",
              description: `Ajuste pago pedido #${orderNum}: +${diff.toFixed(2)}`,
              orderId: id,
              entityType: "ORDER",
              entityId: id,
              createdById: req.auth!.userId ?? null,
            });
            hasCashMovement = true;
          }
        }
        return { hasCashMovement };
      });

      const targetPresetId = payload.orderPresetId !== undefined ? payload.orderPresetId : current.orderPresetId;
      if (payload.customFields) {
        const normalized = await validateAndNormalizeCustomFields(tenantId, nextType, payload.customFields, targetPresetId);
        await saveCustomFieldValues(id, tenantId, normalized.normalized);
      }

      await syncOrderAgendaEvents(tenantId, id, req.auth!.userId);
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
      if (!statusCode && !statusId) {
        return res.status(400).json({ error: "statusCode es requerido", code: "MISSING_STATUS_CODE" });
      }
      const resolvedStatusCode = await resolveCanonicalOrderStatusCode({ tenantId, statusId: statusId || null, statusCode: statusCode || null, activeOnly: true });
      if (!resolvedStatusCode) {
        return res.status(400).json({ error: "statusCode inválido para ORDER", code: "INVALID_STATUS_CODE" });
      }
      const resolvedStatusId = await resolveOrderStatusIdByCode(tenantId, resolvedStatusCode);
      if (process.env.NODE_ENV !== "production") {
        console.info("[orders:status]", { tenantId, branchId: req.auth!.branchId || null, orderId, incomingStatusCode: statusCode || null, incomingStatusId: statusId || null, resolvedStatusCode, resolvedStatusId });
      }
      const scopeCheck = await validateOrderScope(tenantId, orderId, req.auth!.scope as any, req.auth!.branchId);
      if (!scopeCheck.ok) return res.status(scopeCheck.status).json({ error: scopeCheck.message });
      const order = scopeCheck.order;
      const targetDefinition = await resolveOrderStatusDefinitionByCode(tenantId, resolvedStatusCode, false);
      if (!targetDefinition || !targetDefinition.isActive) {
        return res.status(400).json({ error: "statusCode inválido para ORDER", code: "INVALID_STATUS_CODE" });
      }
      if (targetDefinition.isLocked || targetDefinition.isFinal) {
        return res.status(400).json({ error: "El estado seleccionado no permite cambios manuales", code: "STATUS_LOCKED" });
      }

      await changeOrderStatusWithHistory({
        tenantId,
        orderId,
        statusCode: resolvedStatusCode,
        statusId: resolvedStatusId,
        changedById: req.auth!.userId,
        note: note || null,
      });
      if (targetDefinition.isFinal) {
        const config = await storage.getConfig(tenantId);
        const hours = config?.trackingExpirationHours || 24;
        const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
        if (order.publicTrackingId) {
          await storage.updateOrderTracking(orderId, tenantId, order.publicTrackingId, expiresAt);
        }
      }
      await syncOrderAgendaEvents(tenantId, orderId, req.auth!.userId);
      await refreshMetricsForDate(tenantId, new Date());
      const updatedOrder = await storage.getOrderById(orderId, tenantId);
      res.json({ ok: true, data: updatedOrder });
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
      const [definitions, legacyStatuses] = await Promise.all([
        getStatuses(tenantId, "ORDER", true),
        storage.getOrderStatuses(tenantId),
      ]);
      const legacyById = new Map<number, string>();
      for (const legacy of legacyStatuses) legacyById.set(legacy.id, String(legacy.name || ""));
      const definitionsByCode = new Map(definitions.map((d) => [d.code, d]));
      const normalized = data.map((row: any) => {
        const fallbackCode = legacyById.get(Number(row.statusId || 0)) || "";
        const normalizedCode = fallbackCode ? fallbackCode.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) : null;
        const statusCode = normalizedCode && definitionsByCode.has(normalizedCode) ? normalizedCode : null;
        const def = statusCode ? definitionsByCode.get(statusCode) : null;
        return { ...row, statusCode, statusLabel: def?.label || null };
      });
      res.json({ data: normalized });
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
        getStatuses(tenantId, "ORDER", true),
      ]);
      const status = statuses.find((s) => s.code === order.statusCode);

      if (!order.publicTrackingId) {
        const config = await storage.getConfig(tenantId);
        const hours = config?.trackingExpirationHours || 24;
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
            status: status?.label || "Sin estado",
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

  app.get("/api/orders/:id/ticket-pdf", tenantAuth, enforceBranchScope, validateParams(idParamSchema), async (req, res) => {
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
        getStatuses(tenantId, "ORDER", true),
      ]);
      const status = statuses.find((s) => s.code === order.statusCode);

      if (!order.publicTrackingId) {
        const config = await storage.getConfig(tenantId);
        const hours = config?.trackingExpirationHours || 24;
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
        footerText: status?.label ? `Estado: ${status.label}` : undefined,
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
      const config = await storage.getConfig(tenantId);
      const hours = config?.trackingExpirationHours || 24;
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
