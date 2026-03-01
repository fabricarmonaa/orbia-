import type { Express } from "express";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { enforceBranchScope, getTenantPlan, requireRoleAny, tenantAuth } from "../auth";
import { storage } from "../storage";
import { validateBody, validateParams, validateQuery } from "../middleware/validate";
import { sanitizeLongText, sanitizeShortText } from "../security/sanitize";
import { db } from "../db";
import { customers, sales } from "@shared/schema";
import { bumpMetrics } from "../services/metrics";
import { buildThermalTicketPdf } from "../services/pdf/thermal-ticket";
import { resolvePagination } from "../utils/pagination";
import { generatePublicToken } from "../utils/public-token";
import { submitSale } from "../services/sale.service";

const optionalLong = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().transform((value) => sanitizeLongText(value, max)).optional()
  );

const itemSchema = z.object({
  product_id: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().positive(),
  unit_price: z.coerce.number().min(0).optional(),
});

const adjustmentSchema = z
  .object({
    type: z.enum(["PERCENT", "FIXED"]),
    value: z.coerce.number().min(0),
  })
  .nullable()
  .optional();

const createSaleSchema = z.object({
  branch_id: z.coerce.number().int().positive().nullable().optional(),
  items: z.array(itemSchema).min(1),
  discount: adjustmentSchema,
  surcharge: adjustmentSchema,
  payment_method: z.enum(["EFECTIVO", "TRANSFERENCIA", "TARJETA", "OTRO"]),
  notes: optionalLong(2000).nullable(),
  customer_id: z.coerce.number().int().positive().nullable().optional(),
});

const saleQuerySchema = z.object({
  branch_id: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  number: z.string().optional(),
  customerId: z.string().optional(),
  customerQuery: z.string().optional(),
  limit: z.string().optional(),
  offset: z.string().optional(),
  sort: z.enum(["date_desc", "date_asc", "number_desc", "number_asc"]).optional(),
});

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
const tokenParamSchema = z.object({ token: z.string().min(16).max(120) });

function toDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

function parseDateOnly(value?: string, endExclusive = false) {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (endExclusive) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function tokenExpiresAt() {
  const days = Number(process.env.SALE_PUBLIC_TOKEN_DAYS || 30);
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function ensureSalePublicToken(saleId: number, tenantId: number) {
  const [existing] = await db
    .select({ token: sales.publicToken, expiresAt: sales.publicTokenExpiresAt })
    .from(sales)
    .where(and(eq(sales.id, saleId), eq(sales.tenantId, tenantId)));
  const now = new Date();
  if (existing?.token && (!existing.expiresAt || new Date(existing.expiresAt) > now)) return existing.token;
  const token = generatePublicToken();
  await db
    .update(sales)
    .set({ publicToken: token, publicTokenCreatedAt: now, publicTokenExpiresAt: tokenExpiresAt(), updatedAt: now })
    .where(and(eq(sales.id, saleId), eq(sales.tenantId, tenantId)));
  return token;
}

function buildPublicBaseUrl(slug?: string | null) {
  const base = (process.env.PUBLIC_APP_URL || "").trim();
  if (base && slug) return `${base.replace(/\/$/, "")}/t/${slug}`;
  if (base) return `${base.replace(/\/$/, "")}/public`;
  if (slug) return `${process.env.APP_ORIGIN || ""}/t/${slug}`;
  return `${process.env.APP_ORIGIN || ""}/public`;
}

function isApiDebugEnabled() {
  return process.env.DEBUG_API === "1";
}

export function registerSaleRoutes(app: Express) {
  app.post("/api/sales", tenantAuth, requireRoleAny(["admin", "staff", "CASHIER"]), enforceBranchScope, validateBody(createSaleSchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const payload = req.body as z.infer<typeof createSaleSchema>;

      const plan = await getTenantPlan(tenantId);
      const hasBranchesFeature = Boolean((plan?.features as any)?.branches || (plan?.features as any)?.BRANCHES);
      const branchId = hasBranchesFeature ? (req.auth!.scope === "BRANCH" ? req.auth!.branchId! : (payload.branch_id ?? null)) : null;
      if (branchId) {
        const branch = await storage.getBranchById(branchId, tenantId);
        if (!branch) return res.status(403).json({ error: "Sucursal inválida", code: "BRANCH_FORBIDDEN" });
      }

      const created = await submitSale({
        tenantId,
        branchId,
        cashierUserId: req.auth!.cashierId || req.auth!.userId,
        currency: "ARS",
        paymentMethod: payload.payment_method,
        notes: payload.notes || null,
        customerId: payload.customer_id ?? null,
        discountType: payload.discount?.type || "NONE",
        discountValue: payload.discount?.value || 0,
        surchargeType: payload.surcharge?.type || "NONE",
        surchargeValue: payload.surcharge?.value || 0,
        items: payload.items.map((item) => ({
          productId: item.product_id,
          quantity: item.quantity,
          unitPrice: item.unit_price,
        })),
      });

      await ensureSalePublicToken(created.sale.id, tenantId);

      // Fire-and-forget: never blocks the response
      bumpMetrics(tenantId, {
        revenueTotal: Number(created.sale.totalAmount || 0),
      });

      return res.status(201).json({
        sale_id: created.sale.id,
        sale_number: created.sale.saleNumber,
        total_amount: created.sale.totalAmount,
      });
    } catch (err: any) {
      if (err?.code === "INSUFFICIENT_STOCK") {
        return res.status(409).json({
          error: "Stock insuficiente",
          code: "INSUFFICIENT_STOCK",
          product_id: err.productId,
          requested: err.requested,
          available: err.available,
        });
      }
      if (err?.code === "PRODUCT_NOT_FOUND") {
        return res.status(404).json({ error: "Producto no encontrado", code: "PRODUCT_NOT_FOUND" });
      }
      if (err?.code === "MARGIN_PRICE_OVERRIDE_NOT_ALLOWED") {
        return res.status(400).json({ error: "No se puede enviar unit_price para productos por margen", code: "MARGIN_PRICE_OVERRIDE_NOT_ALLOWED", product_id: err.productId });
      }
      if (String(err?.message || "").startsWith("EXCHANGE_RATE_NOT_FOUND")) {
        return res.status(400).json({ error: "No hay cotización configurada para la moneda del costo", code: "EXCHANGE_RATE_NOT_FOUND" });
      }
      if (err?.code === "BRANCH_REQUIRED") {
        return res.status(400).json({ error: "Sucursal requerida", code: "BRANCH_REQUIRED" });
      }
      console.error("[sales] SALE_CREATE_ERROR", err);
      return res.status(500).json({ error: "No se pudo registrar la venta", code: "SALE_CREATE_ERROR" });
    }
  });

  app.get("/api/sales", tenantAuth, requireRoleAny(["admin", "staff", "CASHIER"]), enforceBranchScope, validateQuery(saleQuerySchema), async (req, res) => {
    let tenantId = 0;
    try {
      tenantId = req.auth!.tenantId!;
      const raw = req.query as Record<string, string | undefined>;
      const branchId = req.auth!.scope === "BRANCH" ? req.auth!.branchId! : (raw.branch_id ? Number(raw.branch_id) : undefined);

      const from = parseDateOnly(raw.from);
      const to = parseDateOnly(raw.to, true);
      if (raw.from && from === null) return res.status(400).json({ error: "INVALID_DATE", code: "INVALID_DATE" });
      if (raw.to && to === null) return res.status(400).json({ error: "INVALID_DATE", code: "INVALID_DATE" });

      const { limit, offset } = resolvePagination({ limit: raw.limit ?? "50", offset: raw.offset, page: raw.page });

      const customerIdParsed = Number(raw.customerId ?? "");
      const customerId = Number.isFinite(customerIdParsed) && customerIdParsed > 0 ? customerIdParsed : undefined;
      const sort = ["date_desc", "date_asc", "number_desc", "number_asc"].includes(String(raw.sort || ""))
        ? (raw.sort as "date_desc" | "date_asc" | "number_desc" | "number_asc")
        : "date_desc";

      if (isApiDebugEnabled()) {
        console.info("[debug-api] sales.history request", {
          tenantId,
          tokenScope: req.auth?.scope || null,
          tokenBranchId: req.auth?.branchId ?? null,
          effectiveBranchId: branchId ?? null,
          from: raw.from || null,
          to: raw.to || null,
          number: String(raw.number ?? "").trim() || null,
          customerId: customerId ?? null,
          customerQuery: String(raw.customerQuery ?? raw.q ?? "").trim() || null,
          repositoryMethod: "storage.listSales",
        });
      }

      const result = await storage.listSales(tenantId, {
        branchId,
        from: from || undefined,
        to: to || undefined,
        number: String(raw.number ?? "").trim() || undefined,
        customerId,
        customerQuery: String(raw.customerQuery ?? raw.q ?? "").trim() || undefined,
        limit,
        offset,
        sort,
      });

      const items = (result.data || []).map((row: any) => ({
        id: Number(row.id),
        number: row.number,
        date: row.createdAt,
        createdAt: row.createdAt,
        total: Number(row.total || 0),
        totalAmount: Number(row.total || 0),
        currency: row.currency || "ARS",
        paymentMethod: row.paymentMethod,
        customerName: row.customer?.name || null,
        branchName: row.branch?.name || null,
        publicToken: row.publicToken || null,
      }));

      const payload: any = {
        items,
        total: Number(result.meta?.total || 0),
        data: result.data,
        meta: result.meta,
      };
      if (isApiDebugEnabled()) {
        console.info("[debug-api] sales.history response", {
          tenantId,
          effectiveBranchId: branchId ?? null,
          total: Number(result.meta?.total || 0),
          returnedItems: items.length,
          usedMaterializedView: result.usedMaterializedView,
        });
      }
      if (process.env.NODE_ENV !== "production") payload.debug = { usedMaterializedView: result.usedMaterializedView };
      return res.json(payload);
    } catch (err: any) {
      console.error("[sales] SALES_LIST_ERROR", {
        tenantId,
        from: req.query?.from,
        to: req.query?.to,
        limit: req.query?.limit,
        offset: req.query?.offset,
        sort: req.query?.sort,
        q: req.query?.q,
        number: req.query?.number,
        customerQuery: req.query?.customerQuery,
        message: err?.message,
        code: err?.code,
        stack: err?.stack,
      });
      if (err?.code === "MIGRATION_MISSING") {
        return res.status(500).json({ error: "Faltan migraciones de ventas, ejecutar migrations/*.sql", code: "MIGRATION_MISSING" });
      }
      return res.status(500).json({ error: "SALES_LIST_FAILED", code: "SALES_LIST_FAILED" });
    }
  });

  app.get("/api/sales/:id", tenantAuth, requireRoleAny(["admin", "staff", "CASHIER"]), enforceBranchScope, validateParams(idParamSchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const saleId = req.params.id as unknown as number;
      const sale = await storage.getSaleById(saleId, tenantId);
      if (!sale) return res.status(404).json({ error: "Venta no encontrada", code: "SALE_NOT_FOUND" });
      if (req.auth!.scope === "BRANCH" && sale.branchId !== req.auth!.branchId) {
        return res.status(403).json({ error: "Sin acceso a esta venta", code: "BRANCH_FORBIDDEN" });
      }
      const [items, customer] = await Promise.all([
        storage.getSaleItems(saleId, tenantId),
        sale.customerId
          ? db.select({ id: customers.id, name: customers.name, doc: customers.doc, phone: customers.phone }).from(customers).where(and(eq(customers.id, sale.customerId), eq(customers.tenantId, tenantId))).limit(1)
          : Promise.resolve([] as any[]),
      ]);
      res.json({ data: { sale, items, customer: customer[0] || null } });
    } catch (err) {
      console.error("[sales] SALE_DETAIL_ERROR", err);
      res.status(500).json({ error: "No se pudo obtener detalle", code: "SALE_DETAIL_ERROR" });
    }
  });

  const getSalePrintData = async (req: any, res: any) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const saleId = req.params.id as unknown as number;
      const sale = await storage.getSaleById(saleId, tenantId);
      if (!sale) return res.status(404).json({ error: "Venta no encontrada", code: "SALE_NOT_FOUND" });
      if (req.auth!.scope === "BRANCH" && sale.branchId !== req.auth!.branchId) {
        return res.status(403).json({ error: "Sin acceso a esta venta", code: "BRANCH_FORBIDDEN" });
      }

      const [items, branding, allBranches, tenant, customer] = await Promise.all([
        storage.getSaleItems(saleId, tenantId),
        storage.getTenantBranding(tenantId),
        storage.getBranches(tenantId),
        storage.getTenantById(tenantId),
        sale.customerId
          ? db.select({ id: customers.id, name: customers.name, doc: customers.doc, phone: customers.phone }).from(customers).where(and(eq(customers.id, sale.customerId), eq(customers.tenantId, tenantId))).limit(1)
          : Promise.resolve([] as any[]),
      ]);
      const branch = sale.branchId ? allBranches.find((b) => b.id === sale.branchId) : null;
      const token = await ensureSalePublicToken(sale.id, tenantId);
      const publicUrl = `${process.env.PUBLIC_APP_URL || process.env.APP_ORIGIN || ""}/tracking/${token}`;
      const customerData = customer[0] || null;

      return res.json({
        data: {
          business: {
            name: branding.displayName,
            logoUrl: branding.logoUrl,
            address: null,
            phone: null,
          },
          sale: {
            id: sale.id,
            number: sale.saleNumber,
            createdAt: sale.saleDatetime,
            customerName: customerData?.name || null,
            customerDni: customerData?.doc || null,
            customerPhone: customerData?.phone || null,
            paymentMethod: sale.paymentMethod,
            notes: sale.notes,
            subtotal: sale.subtotalAmount,
            discount: sale.discountAmount,
            surcharge: sale.surchargeAmount,
            total: sale.totalAmount,
            currency: sale.currency,
          },
          items: items.map((item) => ({
            name: item.productNameSnapshot,
            qty: item.quantity,
            unitPrice: item.unitPrice,
            total: item.lineTotal,
            code: item.skuSnapshot,
          })),
          qr: { publicUrl },

          // backward compatibility
          tenant: {
            name: branding.displayName,
            slug: (tenant as any)?.slug || null,
            logoUrl: branding.logoUrl,
            slogan: String(branding.texts?.trackingFooter || ""),
          },
          branch: branch ? { name: branch.name } : null,
          cashier: { name: "Sistema" },
          totals: {
            subtotal: sale.subtotalAmount,
            discount: sale.discountAmount,
            surcharge: sale.surchargeAmount,
            total: sale.totalAmount,
            currency: sale.currency,
          },
          items_legacy: items.map((item) => ({ qty: item.quantity, name: item.productNameSnapshot, sku: item.skuSnapshot, unit_price: item.unitPrice, line_total: item.lineTotal })),
          venta: {
            id: sale.id,
            number: sale.saleNumber,
            datetime: sale.saleDatetime,
            payment: sale.paymentMethod,
            subtotal: sale.subtotalAmount,
            discount: sale.discountAmount,
            surcharge: sale.surchargeAmount,
            total: sale.totalAmount,
            notes: sale.notes,
            currency: sale.currency,
            customerName: customerData?.name || null,
            customerDni: customerData?.doc || null,
            customerPhone: customerData?.phone || null,
          },
        },
      });
    } catch (err) {
      console.error("[sales] SALE_PRINT_ERROR", err);
      return res.status(500).json({ error: "No se pudo preparar ticket", code: "SALE_PRINT_ERROR" });
    }
  };

  app.get("/api/sales/:id/print-data", tenantAuth, requireRoleAny(["admin", "staff", "CASHIER"]), enforceBranchScope, validateParams(idParamSchema), getSalePrintData);
  app.post("/api/sales/:id/print-data", tenantAuth, requireRoleAny(["admin", "staff", "CASHIER"]), enforceBranchScope, validateParams(idParamSchema), getSalePrintData);

  app.get("/api/sales/:id/ticket-pdf", tenantAuth, requireRoleAny(["admin", "staff", "CASHIER"]), enforceBranchScope, validateParams(idParamSchema), async (req, res) => {
    try {
      const width = String(req.query.width || "80") === "58" ? 58 : 80;
      const saleId = Number(req.params.id);
      const tenantId = req.auth!.tenantId!;
      const sale = await storage.getSaleById(saleId, tenantId);
      if (!sale) return res.status(404).json({ error: "Venta no encontrada", code: "SALE_NOT_FOUND" });

      const [items, branding, tenant, customerData] = await Promise.all([
        storage.getSaleItems(sale.id, sale.tenantId),
        storage.getTenantBranding(sale.tenantId),
        storage.getTenantById(sale.tenantId),
        sale.customerId
          ? db
              .select({ name: customers.name, doc: customers.doc, phone: customers.phone })
              .from(customers)
              .where(and(eq(customers.id, sale.customerId), eq(customers.tenantId, sale.tenantId)))
              .limit(1)
              .then((rows) => rows[0] ?? null)
          : Promise.resolve(null),
      ]);

      const slug = (tenant as any)?.slug || null;
      const base = (process.env.PUBLIC_APP_URL || "").trim().replace(/\/$/, "") || "";
      const trackUrl = `${base || ""}/tracking/${sale.publicToken || sale.id}${slug ? "" : ""}`;

      const pdf = await buildThermalTicketPdf({
        widthMm: width,
        companyName: branding.displayName || "ORBIA",
        ticketLabel: "Ticket",
        ticketNumber: sale.saleNumber,
        datetime: String(sale.saleDatetime),
        paymentMethod: sale.paymentMethod,
        customerName: customerData?.name || null,
        customerDni: customerData?.doc || null,
        customerPhone: customerData?.phone || null,
        items: items.map((item: any) => ({ qty: Number(item.quantity), name: item.productNameSnapshot || "Producto", price: String(item.lineTotal || "") })),
        subtotal: String(sale.subtotalAmount || "0"),
        discount: String(sale.discountAmount || "0"),
        surcharge: String(sale.surchargeAmount || "0"),
        total: String(sale.totalAmount || "0"),
        qrUrl: trackUrl,
        notes: sale.notes,
      });

      res.setHeader("X-Frame-Options", "SAMEORIGIN");
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'"
      );
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename=\"ticket-${sale.saleNumber}-${width}mm.pdf\"`);
      return res.send(pdf);
    } catch {
      return res.status(500).json({ error: "No se pudo generar ticket PDF", code: "SALE_TICKET_PDF_ERROR", requestId: req.requestId || null });
    }
  });

  app.get("/api/public/sale/:token", validateParams(tokenParamSchema), async (req, res) => {
    try {
      const token = req.params.token as string;
      const [sale] = await db.select().from(sales).where(and(eq(sales.publicToken, token), isNull(sales.publicTokenExpiresAt))).limit(1);
      const target = sale
        ? sale
        : (await db.select().from(sales).where(and(eq(sales.publicToken, token))).limit(1))[0];
      if (!target) return res.status(404).json({ error: "Comprobante no encontrado" });
      if (target.publicTokenExpiresAt && new Date(target.publicTokenExpiresAt) < new Date()) return res.status(404).json({ error: "Comprobante no disponible" });

      const [items, branding] = await Promise.all([
        storage.getSaleItems(target.id, target.tenantId),
        storage.getTenantBranding(target.tenantId),
      ]);
      return res.json({
        data: {
          saleNumber: target.saleNumber,
          datetime: target.saleDatetime,
          paymentMethod: target.paymentMethod,
          total: target.totalAmount,
          currency: target.currency,
          items: items.map((i) => ({ qty: i.quantity, name: i.productNameSnapshot, unitPrice: i.unitPrice, subtotal: i.lineTotal })),
          tenant: { name: branding.displayName, logoUrl: branding.logoUrl },
        },
      });
    } catch (err) {
      console.error("[sales] SALE_PUBLIC_TICKET_ERROR", err);
      return res.status(500).json({ error: "No se pudo obtener comprobante", code: "SALE_PUBLIC_TICKET_ERROR" });
    }
  });
}
