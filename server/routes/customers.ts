import type { Express } from "express";
import { z } from "zod";
import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../db";
import { tenantAuth, requireRoleAny } from "../auth";
import { customers, orderStatuses, orders, sales } from "@shared/schema";
import { validateBody, validateQuery, validateParams } from "../middleware/validate";
import { escapeLikePattern, sanitizeLongText, sanitizeShortText } from "../security/sanitize";

const customerSchema = z.object({
  name: z.string().min(1).max(200).transform((v) => sanitizeShortText(v, 200).trim()),
  doc: z.string().max(50).optional().nullable(),
  email: z.string().email().max(255).optional().nullable().transform((v) => (v ? sanitizeShortText(v.toLowerCase(), 255).trim() : null)),
  phone: z.string().max(50).optional().nullable(),
  address: z.string().max(500).optional().nullable().transform((v) => (v ? sanitizeLongText(v, 500).trim() : null)),
  notes: z.string().max(1000).optional().nullable().transform((v) => (v ? sanitizeLongText(v, 1000).trim() : null)),
});

const listQuery = z.object({
  q: z.string().optional().default(""),
  includeInactive: z.coerce.boolean().optional().default(false),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const byDniQuery = z.object({ dni: z.string().min(1).max(50) });
const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
const activeSchema = z.object({ active: z.boolean() });

function normalizeDoc(raw: string | null | undefined) {
  const value = sanitizeShortText(raw || "", 50).trim();
  if (!value) return null;
  const normalized = value.replace(/[\s.-]+/g, "");
  return normalized || null;
}

function normalizePhone(raw: string | null | undefined) {
  const value = sanitizeShortText(raw || "", 50).trim();
  return value || null;
}

async function findByDoc(tenantId: number, doc: string | null) {
  if (!doc) return null;
  const [row] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.tenantId, tenantId), eq(customers.doc, doc)))
    .limit(1);
  return row || null;
}

export function registerCustomerRoutes(app: Express) {
  app.post("/api/customers", tenantAuth, requireRoleAny(["admin", "staff"]), validateBody(customerSchema), async (req, res) => {
    let tenantId = 0;
    try {
      tenantId = req.auth!.tenantId!;
      const body = req.body as z.infer<typeof customerSchema>;
      const payload = {
        ...body,
        name: sanitizeShortText(body.name, 200).trim(),
        doc: normalizeDoc(body.doc),
        phone: normalizePhone(body.phone),
      };

      if (!payload.name) {
        return res.status(400).json({ error: "Nombre requerido", code: "CUSTOMER_NAME_REQUIRED" });
      }
      if (payload.doc && !/^\d{6,15}$/.test(payload.doc)) {
        return res.status(400).json({ error: "DNI inválido", code: "CUSTOMER_DOC_INVALID" });
      }

      const existingByDoc = await findByDoc(tenantId, payload.doc);
      if (existingByDoc?.isActive) {
        return res.status(409).json({
          error: "CUSTOMER_ALREADY_EXISTS",
          message: "Ya existe un cliente con ese DNI.",
          code: "CUSTOMER_ALREADY_EXISTS",
        });
      }

      if (existingByDoc && !existingByDoc.isActive) {
        const [reactivated] = await db
          .update(customers)
          .set({
            name: payload.name,
            phone: payload.phone,
            email: payload.email || null,
            address: payload.address || null,
            notes: payload.notes || null,
            isActive: true,
            updatedAt: new Date(),
          })
          .where(and(eq(customers.id, existingByDoc.id), eq(customers.tenantId, tenantId)))
          .returning();
        return res.status(200).json({ data: reactivated, reactivated: true });
      }

      const [created] = await db.insert(customers).values({ tenantId, ...payload, isActive: true }).returning();
      return res.status(201).json({ data: created, reactivated: false });
    } catch (err: any) {
      console.error("[customers] CUSTOMER_CREATE_ERROR", {
        tenantId,
        body: { ...req.body, doc: String(req.body?.doc || "") },
        message: err?.message,
        code: err?.code,
        detail: err?.detail,
        stack: err?.stack,
      });
      return res.status(500).json({ error: "No se pudo crear cliente", code: "CUSTOMER_CREATE_ERROR" });
    }
  });

  app.get("/api/customers", tenantAuth, requireRoleAny(["admin", "staff"]), validateQuery(listQuery), async (req, res) => {
    let tenantId = 0;
    try {
      tenantId = req.auth!.tenantId!;
      const query = listQuery.parse(req.query || {});
      const limit = Math.min(200, Math.max(1, Number(query.limit || 50)));
      const offset = Math.max(0, Number(query.offset || 0));
      const includeInactive = Boolean(query.includeInactive);
      const queryText = sanitizeShortText(String(query.q || ""), 80).trim();

      let whereClause: any = and(eq(customers.tenantId, tenantId), includeInactive ? sql`true` : eq(customers.isActive, true));
      if (queryText) {
        const like = `%${escapeLikePattern(queryText)}%`;
        whereClause = and(
          whereClause,
          or(
            ilike(customers.name, like),
            ilike(customers.doc, like),
            ilike(customers.phone, like),
            ilike(customers.email, like)
          )
        );
      }

      const [items, totalRows] = await Promise.all([
        db.select().from(customers).where(whereClause).orderBy(desc(customers.createdAt)).limit(limit).offset(offset),
        db.select({ total: sql<number>`count(*)::int` }).from(customers).where(whereClause),
      ]);

      return res.status(200).json({
        data: items || [],
        meta: { limit, offset, total: Number(totalRows[0]?.total || 0) },
      });
    } catch (err: any) {
      console.error("[customers] CUSTOMER_LIST_ERROR", {
        tenantId,
        query: req.query,
        message: err?.message,
        code: err?.code,
        detail: err?.detail,
        stack: err?.stack,
      });
      return res.status(500).json({ error: "No se pudo listar clientes", code: "CUSTOMER_LIST_ERROR" });
    }
  });

  app.get("/api/customers/by-dni", tenantAuth, requireRoleAny(["admin", "staff"]), validateQuery(byDniQuery), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const dni = normalizeDoc(String(req.query.dni || ""));
      if (!dni) return res.json({ data: null });
      const [row] = await db.select().from(customers).where(and(eq(customers.tenantId, tenantId), eq(customers.doc, dni))).limit(1);
      return res.json({ data: row || null });
    } catch (err) {
      console.error("[customers] CUSTOMER_BY_DNI_ERROR", err);
      return res.status(500).json({ error: "No se pudo buscar cliente", code: "CUSTOMER_BY_DNI_ERROR" });
    }
  });

  app.get("/api/customers/:id", tenantAuth, requireRoleAny(["admin", "staff"]), validateParams(idParamSchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const [row] = await db.select().from(customers).where(and(eq(customers.id, Number(req.params.id)), eq(customers.tenantId, tenantId))).limit(1);
      if (!row) return res.status(404).json({ error: "Cliente no encontrado", code: "CUSTOMER_NOT_FOUND" });
      return res.json({ data: row });
    } catch (err) {
      console.error("[customers] CUSTOMER_DETAIL_ERROR", err);
      return res.status(500).json({ error: "No se pudo obtener cliente", code: "CUSTOMER_DETAIL_ERROR" });
    }
  });

  app.patch("/api/customers/:id", tenantAuth, requireRoleAny(["admin", "staff"]), validateParams(idParamSchema), validateBody(customerSchema.partial()), async (req, res) => {
    let tenantId = 0;
    try {
      tenantId = req.auth!.tenantId!;
      const id = Number(req.params.id);
      const body = req.body as Partial<z.infer<typeof customerSchema>>;
      const payload = {
        ...body,
        ...(body.name !== undefined ? { name: sanitizeShortText(String(body.name || ""), 200).trim() } : {}),
        ...(body.doc !== undefined ? { doc: normalizeDoc(body.doc) } : {}),
        ...(body.phone !== undefined ? { phone: normalizePhone(body.phone) } : {}),
      };

      if (payload.doc && !/^\d{6,15}$/.test(payload.doc)) {
        return res.status(400).json({ error: "DNI inválido", code: "CUSTOMER_DOC_INVALID" });
      }

      const [existing] = await db.select().from(customers).where(and(eq(customers.id, id), eq(customers.tenantId, tenantId))).limit(1);
      if (!existing) return res.status(404).json({ error: "Cliente no encontrado", code: "CUSTOMER_NOT_FOUND" });

      const nextDoc = payload.doc !== undefined ? payload.doc : existing.doc;
      if (nextDoc) {
        const [dup] = await db
          .select()
          .from(customers)
          .where(and(eq(customers.tenantId, tenantId), eq(customers.doc, nextDoc), sql`${customers.id} <> ${id}`))
          .limit(1);
        if (dup) {
          return res.status(409).json({
            error: "CUSTOMER_ALREADY_EXISTS",
            message: "Ya existe un cliente con ese DNI.",
            code: "CUSTOMER_ALREADY_EXISTS",
          });
        }
      }

      const [updated] = await db
        .update(customers)
        .set({ ...payload, updatedAt: new Date() })
        .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)))
        .returning();
      return res.json({ data: updated });
    } catch (err: any) {
      console.error("[customers] CUSTOMER_UPDATE_ERROR", {
        tenantId,
        customerId: req.params.id,
        body: req.body,
        message: err?.message,
        code: err?.code,
        detail: err?.detail,
        stack: err?.stack,
      });
      return res.status(500).json({ error: "No se pudo actualizar cliente", code: "CUSTOMER_UPDATE_ERROR" });
    }
  });

  app.patch("/api/customers/:id/active", tenantAuth, requireRoleAny(["admin", "staff"]), validateParams(idParamSchema), validateBody(activeSchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const id = Number(req.params.id);
      const { active } = req.body as z.infer<typeof activeSchema>;
      const [existing] = await db.select().from(customers).where(and(eq(customers.id, id), eq(customers.tenantId, tenantId))).limit(1);
      if (!existing) return res.status(404).json({ error: "Cliente no encontrado", code: "CUSTOMER_NOT_FOUND" });
      const [updated] = await db.update(customers).set({ isActive: active, updatedAt: new Date() }).where(eq(customers.id, id)).returning();
      return res.json({ data: updated });
    } catch (err) {
      console.error("[customers] CUSTOMER_TOGGLE_ACTIVE_ERROR", err);
      return res.status(500).json({ error: "No se pudo actualizar estado", code: "CUSTOMER_TOGGLE_ACTIVE_ERROR" });
    }
  });

  app.delete("/api/customers/:id", tenantAuth, requireRoleAny(["admin", "staff"]), validateParams(idParamSchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const id = Number(req.params.id);
      const [existing] = await db.select().from(customers).where(and(eq(customers.id, id), eq(customers.tenantId, tenantId))).limit(1);
      if (!existing) return res.status(404).json({ error: "Cliente no encontrado", code: "CUSTOMER_NOT_FOUND" });

      const [salesCount] = await db.select({ c: count() }).from(sales).where(and(eq(sales.tenantId, tenantId), eq(sales.customerId, id)));
      if (Number(salesCount?.c || 0) > 0) {
        return res.status(409).json({ error: "No se puede eliminar: cliente con ventas asociadas", code: "CUSTOMER_HAS_SALES" });
      }

      await db.delete(customers).where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)));
      return res.json({ ok: true });
    } catch (err) {
      console.error("[customers] CUSTOMER_DELETE_ERROR", err);
      return res.status(500).json({ error: "No se pudo eliminar cliente", code: "CUSTOMER_DELETE_ERROR" });
    }
  });

  app.get("/api/customers/:id/history", tenantAuth, requireRoleAny(["admin", "staff"]), validateParams(idParamSchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const id = Number(req.params.id);
      const [customer] = await db.select().from(customers).where(and(eq(customers.id, id), eq(customers.tenantId, tenantId))).limit(1);
      if (!customer) return res.status(404).json({ error: "Cliente no encontrado", code: "CUSTOMER_NOT_FOUND" });

      const salesRows = await db
        .select({ id: sales.id, number: sales.saleNumber, date: sales.saleDatetime, total: sales.totalAmount })
        .from(sales)
        .where(and(eq(sales.tenantId, tenantId), eq(sales.customerId, id)))
        .orderBy(desc(sales.saleDatetime))
        .limit(10);

      let ordersRows: any[] = [];
      try {
        const orderWithStatus = await db
          .select({ id: orders.id, number: orders.orderNumber, date: orders.createdAt, statusLabel: orderStatuses.name })
          .from(orders)
          .leftJoin(orderStatuses, and(eq(orderStatuses.id, orders.statusId), eq(orderStatuses.tenantId, orders.tenantId)))
          .where(
            and(
              eq(orders.tenantId, tenantId),
              or(
                customer.phone ? eq(orders.customerPhone, customer.phone) : sql`false`,
                eq(orders.customerName, customer.name)
              )
            )
          )
          .orderBy(desc(orders.createdAt))
          .limit(10);
        ordersRows = orderWithStatus || [];
      } catch (err) {
        console.warn("[customers] CUSTOMER_HISTORY_ORDERS_FALLBACK", (err as any)?.message || err);
        ordersRows = [];
      }

      return res.json({
        customer,
        sales: salesRows,
        orders: ordersRows,
      });
    } catch (err) {
      console.error("[customers] CUSTOMER_HISTORY_ERROR", err);
      return res.status(500).json({ error: "No se pudo obtener historial", code: "CUSTOMER_HISTORY_ERROR" });
    }
  });
}
