import type { Express } from "express";
import { z } from "zod";
import { and, count, desc, eq, or, sql } from "drizzle-orm";
import { db, pool } from "../db";
import { tenantAuth, requireRoleAny } from "../auth";
import { customers, orderStatuses, orders, sales } from "@shared/schema";
import { validateBody, validateQuery, validateParams } from "../middleware/validate";
import { escapeLikePattern, sanitizeLongText, sanitizeShortText } from "../security/sanitize";
import { getCustomersSchemaInfo } from "../services/schema-introspection";
import { isValidEmail, isValidPhone, normalizePhone as normalizePhoneGlobal, shouldUseStrictEmailValidation } from "@shared/validation/contact";

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
  includeInactive: z.union([z.string(), z.number(), z.boolean()]).optional().default(false),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const byDniQuery = z.object({ dni: z.string().min(1).max(50) });
const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
const activeSchema = z.object({ active: z.boolean() });

function normalizeDoc(raw: string | null | undefined) {
  const value = sanitizeShortText(raw || "", 50).trim();
  if (!value) return null;
  const normalized = value.replace(/[^\d]/g, "");
  return normalized || null;
}

function normalizePhone(raw: string | null | undefined) {
  return normalizePhoneGlobal(sanitizeShortText(raw || "", 50));
}

function parseIncludeInactive(raw: unknown) {
  const value = String(raw ?? "false").trim().toLowerCase();
  return ["true", "1", "yes", "si"].includes(value);
}

function mapCustomerRow(row: any) {
  const computedActive = row?.is_active !== undefined
    ? Boolean(row.is_active)
    : row?.deleted_at !== undefined
      ? row.deleted_at === null
      : true;

  return {
    id: Number(row.id),
    name: row.name || "",
    dni: row.doc || null,
    doc: row.doc || null,
    phone: row.phone || null,
    email: row.email || null,
    address: row.address || null,
    notes: row.notes || null,
    createdAt: row.created_at || row.createdAt,
    isActive: computedActive,
  };
}

function isApiDebugEnabled() {
  return process.env.DEBUG_API === "1";
}

export function registerCustomerRoutes(app: Express) {
  app.post("/api/customers", tenantAuth, requireRoleAny(["admin", "staff"]), validateBody(customerSchema), async (req, res) => {
    let tenantId = 0;
    try {
      tenantId = req.auth!.tenantId!;
      const info = await getCustomersSchemaInfo();
      const body = req.body as z.infer<typeof customerSchema>;
      const payload = {
        name: sanitizeShortText(body.name, 200).trim(),
        doc: normalizeDoc(body.doc),
        email: body.email ? sanitizeShortText(body.email.toLowerCase(), 255).trim() : null,
        phone: normalizePhone(body.phone),
        address: body.address ? sanitizeLongText(body.address, 500).trim() : null,
        notes: body.notes ? sanitizeLongText(body.notes, 1000).trim() : null,
      };

      if (!payload.name) {
        return res.status(400).json({ error: "Nombre requerido", code: "CUSTOMER_NAME_REQUIRED" });
      }
      if (payload.doc && !/^\d{6,15}$/.test(payload.doc)) {
        return res.status(400).json({ error: "DNI inválido", code: "CUSTOMER_DOC_INVALID" });
      }
      if (!isValidPhone(body.phone)) {
        return res.status(400).json({ error: "Ingresá un teléfono válido", code: "CUSTOMER_PHONE_INVALID" });
      }
      if (!isValidEmail(body.email, shouldUseStrictEmailValidation())) {
        return res.status(400).json({ error: "Ingresá un email válido (ej: nombre@dominio.com)", code: "CUSTOMER_EMAIL_INVALID" });
      }

      let existing: any = null;
      let duplicateField: "dni" | "email" | null = null;

      if (payload.doc) {
        const r = await pool.query(`SELECT * FROM customers WHERE tenant_id = $1 AND doc = $2 LIMIT 1`, [tenantId, payload.doc]);
        existing = r.rows?.[0] || null;
        duplicateField = existing ? "dni" : null;
      } else if (payload.email) {
        const r = await pool.query(`SELECT * FROM customers WHERE tenant_id = $1 AND lower(email) = lower($2) LIMIT 1`, [tenantId, payload.email]);
        existing = r.rows?.[0] || null;
        duplicateField = existing ? "email" : null;
      }

      const isExistingActive = existing
        ? (info.hasIsActive ? Boolean(existing.is_active) : info.hasDeletedAt ? existing.deleted_at === null : true)
        : false;

      if (existing && isExistingActive) {
        return res.status(409).json({ error: "CUSTOMER_ALREADY_EXISTS", field: duplicateField || "dni", code: "CUSTOMER_ALREADY_EXISTS" });
      }

      if (existing && !isExistingActive) {
        const setParts = ["name = $1", "phone = $2", "email = $3", "address = $4", "notes = $5", "updated_at = NOW()"];
        const params: any[] = [payload.name, payload.phone, payload.email, payload.address, payload.notes];
        if (info.hasIsActive) setParts.push(`is_active = true`);
        if (info.hasDeletedAt) setParts.push(`deleted_at = NULL`);
        params.push(existing.id, tenantId);

        const q = `
          UPDATE customers
          SET ${setParts.join(", ")}
          WHERE id = $${params.length - 1} AND tenant_id = $${params.length}
          RETURNING *
        `;
        const upd = await pool.query(q, params);
        return res.status(200).json({ data: mapCustomerRow(upd.rows[0]), reactivated: true });
      }

      const cols = ["tenant_id", "name", "doc", "email", "phone", "address", "notes"];
      const vals: any[] = [tenantId, payload.name, payload.doc, payload.email, payload.phone, payload.address, payload.notes];
      if (info.hasIsActive) {
        cols.push("is_active");
        vals.push(true);
      }
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
      const insertQ = `INSERT INTO customers (${cols.join(", ")}) VALUES (${placeholders}) RETURNING *`;
      const created = await pool.query(insertQ, vals);
      return res.status(201).json({ data: mapCustomerRow(created.rows[0]), reactivated: false });
    } catch (err: any) {
      console.error("[customers] CUSTOMER_CREATE_ERROR", {
        tenantId,
        message: err?.message,
        code: err?.code,
        detail: err?.detail,
        stack: err?.stack,
      });
      return res.status(500).json({ error: "CUSTOMER_CREATE_FAILED", code: "CUSTOMER_CREATE_FAILED" });
    }
  });

  app.get("/api/customers", tenantAuth, requireRoleAny(["admin", "staff"]), validateQuery(listQuery), async (req, res) => {
    let tenantId = 0;
    try {
      tenantId = req.auth!.tenantId!;
      const info = await getCustomersSchemaInfo();
      const query = listQuery.parse(req.query || {});
      const limit = Math.min(200, Math.max(1, Number(query.limit || 100)));
      const offset = Math.max(0, Number(query.offset || 0));
      const includeInactive = parseIncludeInactive(query.includeInactive);
      const queryText = sanitizeShortText(String(query.q || ""), 80).trim();

      const whereParts = ["c.tenant_id = $1"];
      const params: any[] = [tenantId];

      if (!includeInactive) {
        if (info.hasIsActive) whereParts.push("c.is_active = true");
        else if (info.hasDeletedAt) whereParts.push("c.deleted_at IS NULL");
      }

      if (queryText.length > 0) {
        const like = `%${escapeLikePattern(queryText)}%`;
        params.push(like);
        whereParts.push(`(
          COALESCE(c.name, '') ILIKE $${params.length}
          OR COALESCE(c.doc, '') ILIKE $${params.length}
          OR COALESCE(c.phone, '') ILIKE $${params.length}
          OR COALESCE(c.email, '') ILIKE $${params.length}
        )`);
      }

      const baseWhere = whereParts.join(" AND ");

      const listParams = [...params, limit, offset];
      const activeExpr = info.hasIsActive
        ? "c.is_active"
        : info.hasDeletedAt
          ? "(c.deleted_at IS NULL)"
          : "true";

      const listQ = `
        SELECT
          c.id,
          c.name,
          c.doc,
          c.phone,
          c.email,
          c.address,
          c.notes,
          c.created_at,
          ${activeExpr} AS is_active
        FROM customers c
        WHERE ${baseWhere}
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT $${listParams.length - 1}
        OFFSET $${listParams.length}
      `;
      const totalQ = `SELECT COUNT(*)::int AS total FROM customers c WHERE ${baseWhere}`;

      const [listRows, totalRows] = await Promise.all([
        pool.query(listQ, listParams),
        pool.query(totalQ, params),
      ]);

      const items = (listRows.rows || []).map(mapCustomerRow);
      const total = Number(totalRows.rows?.[0]?.total || 0);
      return res.status(200).json({
        items,
        total,
        data: items,
        meta: { limit, offset, total },
      });
    } catch (err: any) {
      console.error("[customers] CUSTOMER_LIST_ERROR", {
        tenantId,
        parsed: {
          q: req.query?.q,
          limit: req.query?.limit,
          offset: req.query?.offset,
          includeInactive: req.query?.includeInactive,
        },
        message: err?.message,
        code: err?.code,
        detail: err?.detail,
        stack: err?.stack,
      });
      return res.status(500).json({ error: "CUSTOMERS_LIST_FAILED", code: "CUSTOMERS_LIST_FAILED" });
    }
  });

  app.get("/api/customers/by-dni", tenantAuth, requireRoleAny(["admin", "staff"]), validateQuery(byDniQuery), async (req, res) => {
    let tenantId = 0;
    try {
      tenantId = req.auth!.tenantId!;
      const branchId = req.auth?.branchId ?? null;
      const rawDni = String(req.query.dni ?? "");
      const dni = normalizeDoc(rawDni);

      if (isApiDebugEnabled()) {
        console.info("[debug-api] customers.by-dni request", {
          tenantId,
          branchId,
          rawDni,
          normalizedDni: dni,
          repositoryMethod: "pool.query(customers by tenant+doc)",
        });
      }

      if (!dni || dni.length < 6 || dni.length > 12) {
        return res.status(400).json({
          error: {
            code: "CUSTOMER_DNI_INVALID",
            message: "DNI inválido",
          },
        });
      }

      const info = await getCustomersSchemaInfo();
      const activeExpr = info.hasIsActive
        ? "c.is_active"
        : info.hasDeletedAt
          ? "(c.deleted_at IS NULL)"
          : "true";

      const query = `
        SELECT
          c.id,
          c.name,
          c.doc,
          c.phone,
          c.email,
          c.address,
          c.notes,
          c.created_at,
          ${activeExpr} AS is_active
        FROM customers c
        WHERE c.tenant_id = $1
          AND c.doc = $2
          AND ${activeExpr} = true
        ORDER BY c.id DESC
        LIMIT 1
      `;
      const result = await pool.query(query, [tenantId, dni]);
      const row = result.rows?.[0] || null;

      if (!row) {
        return res.status(404).json({
          error: {
            code: "CUSTOMER_NOT_FOUND",
            message: "Cliente no encontrado",
          },
        });
      }

      if (isApiDebugEnabled()) {
        console.info("[debug-api] customers.by-dni response", {
          tenantId,
          branchId,
          found: true,
          customerId: row.id,
        });
      }

      return res.status(200).json({ data: mapCustomerRow(row) });
    } catch (err: any) {
      if (isApiDebugEnabled()) {
        console.error("[customers] CUSTOMER_BY_DNI_ERROR", {
          tenantId,
          message: err?.message,
          code: err?.code,
          detail: err?.detail,
          stack: err?.stack,
        });
      } else {
        console.error("[customers] CUSTOMER_BY_DNI_ERROR", {
          tenantId,
          message: err?.message,
          code: err?.code,
        });
      }
      return res.status(500).json({
        error: {
          code: "CUSTOMER_BY_DNI_ERROR",
          message: "No se pudo buscar cliente",
        },
      });
    }
  });

  app.get("/api/customers/:id", tenantAuth, requireRoleAny(["admin", "staff"]), validateParams(idParamSchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const [row] = await db.select().from(customers).where(and(eq(customers.id, Number(req.params.id)), eq(customers.tenantId, tenantId))).limit(1);
      if (!row) return res.status(404).json({ error: "Cliente no encontrado", code: "CUSTOMER_NOT_FOUND" });
      return res.json({ data: mapCustomerRow(row) });
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
      if (!isValidPhone(body.phone)) {
        return res.status(400).json({ error: "Ingresá un teléfono válido", code: "CUSTOMER_PHONE_INVALID" });
      }
      if (!isValidEmail(body.email, shouldUseStrictEmailValidation())) {
        return res.status(400).json({ error: "Ingresá un email válido (ej: nombre@dominio.com)", code: "CUSTOMER_EMAIL_INVALID" });
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
            field: "dni",
            code: "CUSTOMER_ALREADY_EXISTS",
          });
        }
      }

      const [updated] = await db
        .update(customers)
        .set({ ...payload, updatedAt: new Date() })
        .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)))
        .returning();
      return res.json({ data: mapCustomerRow(updated) });
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
      const info = await getCustomersSchemaInfo();
      const [existing] = await db.select().from(customers).where(and(eq(customers.id, id), eq(customers.tenantId, tenantId))).limit(1);
      if (!existing) return res.status(404).json({ error: "Cliente no encontrado", code: "CUSTOMER_NOT_FOUND" });

      const setParts = ["updated_at = NOW()"];
      if (info.hasIsActive) setParts.push(`is_active = ${active ? "true" : "false"}`);
      if (info.hasDeletedAt) setParts.push(`deleted_at = ${active ? "NULL" : "NOW()"}`);
      if (!info.hasIsActive && !info.hasDeletedAt) {
        return res.status(400).json({ error: "No hay columna de estado activo en customers", code: "CUSTOMER_ACTIVE_COLUMN_MISSING" });
      }

      const q = `
        UPDATE customers
        SET ${setParts.join(", ")}
        WHERE id = $1 AND tenant_id = $2
        RETURNING *
      `;
      const result = await pool.query(q, [id, tenantId]);
      return res.json({ data: mapCustomerRow(result.rows[0]) });
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
        customer: mapCustomerRow(customer),
        sales: salesRows,
        orders: ordersRows,
      });
    } catch (err) {
      console.error("[customers] CUSTOMER_HISTORY_ERROR", err);
      return res.status(500).json({ error: "No se pudo obtener historial", code: "CUSTOMER_HISTORY_ERROR" });
    }
  });
}
