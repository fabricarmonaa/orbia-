import type { Express } from "express";
import { z } from "zod";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../db";
import { tenantAuth, requireRoleAny } from "../auth";
import { customers, sales } from "@shared/schema";
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
const listQuery = z.object({ q: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).default(0) });

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
    const tenantId = req.auth!.tenantId!;
    const payload = req.body as z.infer<typeof customerSchema>;
    const dup = await checkDuplicate(tenantId, payload);
    if (dup) return res.status(409).json({ error: "Cliente duplicado por doc/email/teléfono", code: "CUSTOMER_DUPLICATE" });
    const [created] = await db.insert(customers).values({ tenantId, ...payload }).returning();
    return res.status(201).json({ data: created });
  });

  app.get("/api/customers", tenantAuth, requireRoleAny(["admin", "staff"]), validateQuery(listQuery), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const q = req.query as any;
      const pageSize = Number(q.limit || 50);
      const page = Math.floor(Number(q.offset || 0) / pageSize) + 1;
      const where = [eq(customers.tenantId, tenantId)] as any[];
      const queryText = typeof q.q === "string" ? sanitizeShortText(q.q, 80).trim() : "";
      if (queryText) {
        const like = `%${escapeLikePattern(queryText)}%`;
        where.push(or(
          ilike(customers.name, like),
          ilike(customers.email, like),
          ilike(customers.doc, like),
          ilike(customers.phone, like)
        )!);
      }
      const [items, totalRows] = await Promise.all([
        db.select().from(customers).where(and(...where)).orderBy(desc(customers.createdAt)).limit(pageSize).offset(Number(q.offset || 0)),
        db.select({ total: sql<number>`count(*)::int` }).from(customers).where(and(...where)),
      ]);
      return res.json({ items, total: Number(totalRows[0]?.total || 0), page, pageSize });
    } catch {
      return res.status(500).json({ error: "No se pudo listar clientes", code: "CUSTOMER_LIST_ERROR" });
    }
  });

  app.get("/api/customers/:id", tenantAuth, requireRoleAny(["admin", "staff"]), validateParams(z.object({ id: z.coerce.number().int().positive() })), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const [row] = await db.select().from(customers).where(and(eq(customers.id, Number(req.params.id)), eq(customers.tenantId, tenantId))).limit(1);
    if (!row) return res.status(404).json({ error: "Cliente no encontrado", code: "CUSTOMER_NOT_FOUND" });
    return res.json({ data: row });
  });

  app.patch("/api/customers/:id", tenantAuth, requireRoleAny(["admin", "staff"]), validateParams(z.object({ id: z.coerce.number().int().positive() })), validateBody(customerSchema.partial()), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const id = Number(req.params.id);
    const payload = req.body as Partial<z.infer<typeof customerSchema>>;
    const [existing] = await db.select().from(customers).where(and(eq(customers.id, id), eq(customers.tenantId, tenantId))).limit(1);
    if (!existing) return res.status(404).json({ error: "Cliente no encontrado", code: "CUSTOMER_NOT_FOUND" });
    const merged = { ...existing, ...payload } as any;
    const dup = await checkDuplicate(tenantId, merged, id);
    if (dup) return res.status(409).json({ error: "Cliente duplicado por doc/email/teléfono", code: "CUSTOMER_DUPLICATE" });
    const [updated] = await db.update(customers).set({ ...payload, updatedAt: new Date() }).where(eq(customers.id, id)).returning();
    return res.json({ data: updated });
  });


  app.get("/api/customers/:id/history", tenantAuth, requireRoleAny(["admin", "staff"]), validateParams(z.object({ id: z.coerce.number().int().positive() })), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const id = Number(req.params.id);
      const limit = Math.min(50, Math.max(1, Number(req.query.limit || 10)));
      const rows = await db.select({ id: sales.id, saleNumber: sales.saleNumber, saleDatetime: sales.saleDatetime, totalAmount: sales.totalAmount, paymentMethod: sales.paymentMethod }).from(sales).where(and(eq(sales.tenantId, tenantId), eq(sales.customerId, id))).orderBy(desc(sales.saleDatetime)).limit(limit);
      return res.json({ items: rows });
    } catch {
      return res.status(500).json({ error: "No se pudo obtener historial", code: "CUSTOMER_HISTORY_ERROR" });
    }
  });

}
