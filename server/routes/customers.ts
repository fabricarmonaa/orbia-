import type { Express } from "express";
import { z } from "zod";
import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../db";
import { tenantAuth, requireRoleAny } from "../auth";
import { customers, orderStatuses, orders, sales } from "@shared/schema";
import { validateBody, validateQuery, validateParams } from "../middleware/validate";
import { escapeLikePattern, sanitizeLongText, sanitizeShortText } from "../security/sanitize";

const customerSchema = z.object({
  name: z.string().min(1).max(200).transform((v) => sanitizeShortText(v, 200)),
  doc: z.string().max(50).optional().nullable().transform((v) => (v ? sanitizeShortText(v, 50) : null)),
  email: z.string().email().max(255).optional().nullable().transform((v) => (v ? sanitizeShortText(v.toLowerCase(), 255) : null)),
  phone: z.string().max(50).optional().nullable().transform((v) => (v ? sanitizeShortText(v, 50) : null)),
  address: z.string().max(500).optional().nullable().transform((v) => (v ? sanitizeLongText(v, 500) : null)),
  notes: z.string().max(1000).optional().nullable().transform((v) => (v ? sanitizeLongText(v, 1000) : null)),
});

const listQuery = z.object({
  q: z.string().optional(),
  includeInactive: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const byDniQuery = z.object({ dni: z.string().min(1).max(50) });
const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
const activeSchema = z.object({ active: z.boolean() });

async function checkDuplicate(tenantId: number, data: z.infer<typeof customerSchema>, exceptId?: number) {
  const ors = [] as any[];
  if (data.doc) ors.push(eq(customers.doc, data.doc));
  if (data.email) ors.push(eq(customers.email, data.email));
  if (data.phone) ors.push(eq(customers.phone, data.phone));
  if (!ors.length) return null;
  const rows = await db.select().from(customers).where(and(eq(customers.tenantId, tenantId), or(...ors)!)).limit(20);
  return rows.find((r) => r.id !== exceptId) || null;
}

export function registerCustomerRoutes(app: Express) {
  app.post("/api/customers", tenantAuth, requireRoleAny(["admin", "staff"]), validateBody(customerSchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const payload = req.body as z.infer<typeof customerSchema>;
      if (payload.doc && !/^\d{6,15}$/.test(payload.doc)) {
        return res.status(400).json({ error: "DNI inválido", code: "CUSTOMER_DOC_INVALID" });
      }
      const dup = await checkDuplicate(tenantId, payload);
      if (dup) return res.status(409).json({ error: "Cliente duplicado por doc/email/teléfono", code: "CUSTOMER_DUPLICATE" });
      const [created] = await db.insert(customers).values({ tenantId, ...payload, isActive: true }).returning();
      return res.status(201).json({ data: created });
    } catch (err) {
      console.error("[customers] CUSTOMER_CREATE_ERROR", err);
      return res.status(500).json({ error: "No se pudo crear cliente", code: "CUSTOMER_CREATE_ERROR" });
    }
  });

  app.get("/api/customers", tenantAuth, requireRoleAny(["admin", "staff"]), validateQuery(listQuery), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const q = req.query as any;
      const rawLimit = Number(q.limit ?? 50);
      const rawOffset = Number(q.offset ?? 0);
      const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, Math.trunc(rawLimit))) : 50;
      const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.trunc(rawOffset)) : 0;
      const includeInactive = String(req.query.includeInactive ?? "false") === "true";
      const where = [eq(customers.tenantId, tenantId)] as any[];
      if (!includeInactive) where.push(eq(customers.isActive, true));

      const qSearch = String(req.query.q ?? "").trim();
      const queryText = sanitizeShortText(qSearch, 80).trim();
      if (queryText.length > 0) {
        const like = `%${escapeLikePattern(queryText)}%`;
        where.push(or(ilike(customers.name, like), ilike(customers.email, like), ilike(customers.doc, like), ilike(customers.phone, like))!);
      }

      const [items, totalRows] = await Promise.all([
        db.select().from(customers).where(and(...where)).orderBy(desc(customers.createdAt)).limit(limit).offset(offset),
        db.select({ total: sql<number>`count(*)::int` }).from(customers).where(and(...where)),
      ]);
      const total = Number(totalRows[0]?.total || 0);
      return res.json({ data: items, meta: { limit, offset, total } });
    } catch (err) {
      console.error("[customers] CUSTOMER_LIST_ERROR", err);
      return res.status(500).json({ error: "No se pudo listar clientes", code: "CUSTOMER_LIST_ERROR" });
    }
  });

  app.get("/api/customers/by-dni", tenantAuth, requireRoleAny(["admin", "staff"]), validateQuery(byDniQuery), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const dni = sanitizeShortText(String(req.query.dni || ""), 50).trim();
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
    try {
      const tenantId = req.auth!.tenantId!;
      const id = Number(req.params.id);
      const payload = req.body as Partial<z.infer<typeof customerSchema>>;
      if (payload.doc && !/^\d{6,15}$/.test(payload.doc)) {
        return res.status(400).json({ error: "DNI inválido", code: "CUSTOMER_DOC_INVALID" });
      }
      const [existing] = await db.select().from(customers).where(and(eq(customers.id, id), eq(customers.tenantId, tenantId))).limit(1);
      if (!existing) return res.status(404).json({ error: "Cliente no encontrado", code: "CUSTOMER_NOT_FOUND" });
      const merged = { ...existing, ...payload } as any;
      const dup = await checkDuplicate(tenantId, merged, id);
      if (dup) return res.status(409).json({ error: "Cliente duplicado por doc/email/teléfono", code: "CUSTOMER_DUPLICATE" });
      const [updated] = await db.update(customers).set({ ...payload, updatedAt: new Date() }).where(eq(customers.id, id)).returning();
      return res.json({ data: updated });
    } catch (err) {
      console.error("[customers] CUSTOMER_UPDATE_ERROR", err);
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
              )!
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
