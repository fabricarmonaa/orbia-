import type { Express } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { tenantAuth, requireTenantAdmin, requireNotPlanCodes } from "../auth";
import { createRateLimiter } from "../middleware/rate-limit";
import { db, pool } from "../db";
import { cashMovements, expenseDefinitions, tenants } from "@shared/schema";
import { storage } from "../storage";
import { getTenantMonthlyMetricsSummary, refreshTenantMetrics } from "../services/metrics-refresh";

const EXPORT_DIR = path.join(process.cwd(), "uploads", "exports", "reports");
const EXPORT_HMAC_SECRET = process.env.EXPORT_TOKEN_SECRET || process.env.SESSION_SECRET || "orbia-export-secret";
const EXPORT_TTL_SECONDS = 15 * 60;

const monthlySummarySchema = z.object({ year: z.number().int().min(2000).max(2100), month: z.number().int().min(1).max(12), force: z.boolean().optional() });
const refreshMetricsSchema = z.object({ from: z.string().date().optional(), to: z.string().date().optional() });
const reportFiltersSchema = z.object({
  from: z.string().date(),
  to: z.string().date(),
  branchId: z.coerce.number().int().positive().optional(),
  cashierId: z.coerce.number().int().positive().optional(),
  paymentMethod: z.string().max(30).optional(),
  status: z.string().max(30).optional(),
});

const salesQuerySchema = reportFiltersSchema.extend({
  groupBy: z.enum(["day", "week", "month", "product", "cashier", "branch", "paymentMethod"]).default("day"),
});

const exportSchema = z.object({
  type: z.enum(["sales", "products", "customers", "cash", "kpis"]),
  params: z.record(z.any()).default({}),
  format: z.enum(["csv", "pdf"]),
});

const summaryLimiter = createRateLimiter({ windowMs: 60_000, max: parseInt(process.env.REPORTS_LIMIT_PER_MIN || "4", 10), keyGenerator: (req) => `monthly-summary:${req.auth?.tenantId || req.ip}`, errorMessage: "Demasiadas solicitudes.", code: "REPORT_RATE_LIMIT" });
const metricsRefreshLimiter = createRateLimiter({ windowMs: 60_000, max: parseInt(process.env.METRICS_REFRESH_LIMIT_PER_MIN || "2", 10), keyGenerator: (req) => `metrics-refresh:${req.auth?.tenantId || req.ip}`, errorMessage: "Demasiados refresh.", code: "METRICS_REFRESH_RATE_LIMIT" });
const materializedRefreshByTenant = new Map<number, number>();
const materializedRefreshInFlightByTenant = new Set<number>();

function ensureExportDir() { if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true }); }
function csvEscape(value: unknown) { const raw = String(value ?? ""); const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw; return (safe.includes(",") || safe.includes('"') || safe.includes("\n")) ? `"${safe.replace(/"/g, '""')}"` : safe; }
function toCsv(rows: Record<string, unknown>[]) { if (!rows.length) return ""; const h = Object.keys(rows[0]); return [h.join(","), ...rows.map((r) => h.map((k) => csvEscape(r[k])).join(","))].join("\n"); }
function buildWhere(filters: z.infer<typeof reportFiltersSchema>, tenantId: number) {
  const clauses = ["s.tenant_id = $1", "s.sale_datetime >= $2", "s.sale_datetime < $3"]; const params: any[] = [tenantId, new Date(`${filters.from}T00:00:00.000Z`), new Date(`${filters.to}T23:59:59.999Z`)];
  if (filters.branchId) { params.push(filters.branchId); clauses.push(`s.branch_id = $${params.length}`); }
  if (filters.cashierId) { params.push(filters.cashierId); clauses.push(`s.cashier_user_id = $${params.length}`); }
  if (filters.paymentMethod) { params.push(filters.paymentMethod); clauses.push(`s.payment_method = $${params.length}`); }
  return { where: clauses.join(" AND "), params };
}
function signExportToken(tenantId: number, fileName: string) {
  const exp = Math.floor(Date.now() / 1000) + EXPORT_TTL_SECONDS;
  const payload = `${tenantId}.${exp}.${fileName}`;
  const sig = crypto.createHmac("sha256", EXPORT_HMAC_SECRET).update(payload).digest("hex");
  return { token: Buffer.from(`${payload}.${sig}`).toString("base64url"), expiresAt: exp };
}
function validateExportToken(token: string) {
  const decoded = Buffer.from(token, "base64url").toString("utf8");
  const [tid, exp, ...rest] = decoded.split(".");
  const sig = rest.pop();
  const fileName = rest.join(".");
  const payload = `${tid}.${exp}.${fileName}`;
  const expected = crypto.createHmac("sha256", EXPORT_HMAC_SECRET).update(payload).digest("hex");
  if (!sig || sig !== expected) throw new Error("EXPORT_TOKEN_INVALID");
  if (Math.floor(Date.now() / 1000) > Number(exp)) throw new Error("EXPORT_TOKEN_EXPIRED");
  return { tenantId: Number(tid), fileName };
}
async function kpiData(tenantId: number, filters: z.infer<typeof reportFiltersSchema>) {
  const { where, params } = buildWhere(filters, tenantId);
  const previousFrom = new Date(`${filters.from}T00:00:00.000Z`);
  const previousTo = new Date(`${filters.to}T23:59:59.999Z`);
  const days = Math.max(1, Math.ceil((previousTo.getTime() - previousFrom.getTime()) / 86_400_000));
  const prevEnd = new Date(previousFrom.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - days * 86_400_000);

  const current = await pool.query(`
    SELECT COALESCE(SUM(s.subtotal_amount::numeric),0) gross_sales,
           COALESCE(SUM(s.total_amount::numeric),0) net_sales,
           COUNT(*)::int sales_count,
           COALESCE(AVG(s.total_amount::numeric),0) avg_ticket
    FROM sales s WHERE ${where}`,
    params
  );
  const prev = await pool.query(`
    SELECT COALESCE(SUM(s.total_amount::numeric),0) net_sales, COUNT(*)::int sales_count
    FROM sales s
    WHERE s.tenant_id = $1 AND s.sale_datetime >= $2 AND s.sale_datetime < $3`,
    [tenantId, prevStart, prevEnd]
  );
  const cash = await pool.query(`
    SELECT COALESCE(SUM(CASE WHEN type='ingreso' THEN amount::numeric ELSE 0 END),0) cash_in,
           COALESCE(SUM(CASE WHEN type='egreso' THEN amount::numeric ELSE 0 END),0) cash_out
    FROM cash_movements
    WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3${filters.branchId ? " AND branch_id = $4" : ""}`,
    filters.branchId ? [tenantId, new Date(`${filters.from}T00:00:00.000Z`), new Date(`${filters.to}T23:59:59.999Z`), filters.branchId] : [tenantId, new Date(`${filters.from}T00:00:00.000Z`), new Date(`${filters.to}T23:59:59.999Z`)]
  );
  const top = await pool.query(`
    SELECT si.product_name_snapshot name, SUM(si.quantity)::int qty
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE ${where}
    GROUP BY si.product_name_snapshot
    ORDER BY qty DESC
    LIMIT 1`,
    params
  );
  const lowStock = await pool.query(`SELECT COUNT(*)::int c FROM stock_levels sl JOIN products p ON p.id=sl.product_id WHERE sl.tenant_id=$1 AND sl.quantity <= p.min_stock::numeric`, [tenantId]);
  let series;
  try {
    series = await pool.query(`SELECT date, total_sales as net_sales, sales_count, CASE WHEN sales_count > 0 THEN total_sales / sales_count ELSE 0 END as avg_ticket FROM mv_reports_daily_sales WHERE tenant_id = $1 AND date >= $2::date AND date <= $3::date ORDER BY date`, [tenantId, filters.from, filters.to]);
  } catch {
    series = await pool.query(`
      SELECT DATE(s.sale_datetime) as date,
        COALESCE(SUM(s.total_amount::numeric),0) net_sales,
        COUNT(*)::int sales_count,
        COALESCE(AVG(s.total_amount::numeric),0) avg_ticket
      FROM sales s WHERE ${where}
      GROUP BY DATE(s.sale_datetime)
      ORDER BY DATE(s.sale_datetime)`, params);
  }

  const netCurrent = Number(current.rows[0]?.net_sales || 0);
  const netPrev = Number(prev.rows[0]?.net_sales || 0);
  const deltaPct = netPrev === 0 ? (netCurrent > 0 ? 100 : 0) : ((netCurrent - netPrev) / netPrev) * 100;
  return {
    kpis: {
      grossSales: Number(current.rows[0]?.gross_sales || 0),
      netSales: netCurrent,
      salesCount: Number(current.rows[0]?.sales_count || 0),
      ordersCount: Number(current.rows[0]?.sales_count || 0),
      avgTicket: Number(current.rows[0]?.avg_ticket || 0),
      cashIn: Number(cash.rows[0]?.cash_in || 0),
      cashOut: Number(cash.rows[0]?.cash_out || 0),
      topProduct: top.rows[0] ? { name: top.rows[0].name, quantity: Number(top.rows[0].qty || 0) } : null,
      lowStockCount: Number(lowStock.rows[0]?.c || 0),
    },
    compare: { netSalesPrev: netPrev, netSalesDeltaPct: deltaPct, periodDays: days },
    series: { daily: series.rows.map((r) => ({ date: r.date, netSales: Number(r.net_sales || 0), salesCount: Number(r.sales_count || 0), avgTicket: Number(r.avg_ticket || 0) })) },
  };
}

export function registerReportRoutes(app: Express) {
  app.post("/api/reports/monthly-summary", tenantAuth, requireTenantAdmin, requireNotPlanCodes(["ECONOMICO"]), summaryLimiter, async (req, res) => {
    try {
      const { year, month, force } = monthlySummarySchema.parse(req.body);
      const tenantId = req.auth!.tenantId!;
      const existing = await storage.getTenantMonthlySummary(tenantId, year, month);
      if (existing && !force) return res.json({ data: existing, cached: true });
      const rangeStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
      const rangeEnd = new Date(Date.UTC(year, month, 1, 0, 0, 0));
      const [incomeRow] = await db.select({ total: sql<string>`COALESCE(SUM(${cashMovements.amount}), 0)` }).from(cashMovements).where(and(eq(cashMovements.tenantId, tenantId), eq(cashMovements.type, "ingreso"), sql`${cashMovements.createdAt} >= ${rangeStart}`, sql`${cashMovements.createdAt} < ${rangeEnd}`));
      const [expenseRow] = await db.select({ total: sql<string>`COALESCE(SUM(${cashMovements.amount}), 0)` }).from(cashMovements).where(and(eq(cashMovements.tenantId, tenantId), eq(cashMovements.type, "egreso"), sql`${cashMovements.createdAt} >= ${rangeStart}`, sql`${cashMovements.createdAt} < ${rangeEnd}`));
      const [fixedRow] = await db.select({ total: sql<string>`COALESCE(SUM(${expenseDefinitions.defaultAmount}), 0)` }).from(expenseDefinitions).where(and(eq(expenseDefinitions.tenantId, tenantId), eq(expenseDefinitions.type, "FIXED"), eq(expenseDefinitions.isActive, true)));
      const summary = await storage.upsertTenantMonthlySummary({ tenantId, year, month, totalsJson: { income: parseFloat(incomeRow?.total || "0"), expenses: parseFloat(expenseRow?.total || "0"), fixedImpact: parseFloat(fixedRow?.total || "0"), net: parseFloat(incomeRow?.total || "0") - parseFloat(expenseRow?.total || "0") - parseFloat(fixedRow?.total || "0") } });
      res.json({ data: summary, cached: false });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Datos inválidos", code: "REPORT_INVALID" });
      res.status(500).json({ error: "No se pudo generar el resumen mensual", code: "REPORT_ERROR" });
    }
  });

  app.post("/api/reports/metrics/refresh", tenantAuth, requireTenantAdmin, requireNotPlanCodes(["ECONOMICO"]), metricsRefreshLimiter, async (req, res) => {
    try {
      const { from, to } = refreshMetricsSchema.parse(req.body || {});
      await refreshTenantMetrics(req.auth!.tenantId!, { from, to });
      return res.json({ ok: true, code: "METRICS_REFRESHED" });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Rango inválido", code: "METRICS_RANGE_INVALID" });
      return res.status(500).json({ error: "No se pudieron refrescar las métricas", code: "METRICS_REFRESH_ERROR" });
    }
  });

  app.get("/api/reports/metrics/monthly", tenantAuth, requireNotPlanCodes(["ECONOMICO"]), async (req, res) => {
    try {
      const monthParam = typeof req.query.month === "string" ? req.query.month : undefined;
      const monthDate = monthParam ? new Date(monthParam) : new Date();
      const data = await getTenantMonthlyMetricsSummary(req.auth!.tenantId!, monthDate);
      return res.json({ data });
    } catch {
      return res.status(500).json({ error: "No se pudieron obtener métricas", code: "METRICS_READ_ERROR" });
    }
  });

  app.get("/api/reports/kpis", tenantAuth, requireTenantAdmin, async (req, res) => {
    try {
      const filters = reportFiltersSchema.parse(req.query);
      return res.json(await kpiData(req.auth!.tenantId!, filters));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Filtros inválidos", code: "REPORT_FILTERS_INVALID" });
      return res.status(500).json({ error: "No se pudieron obtener KPIs", code: "REPORT_KPIS_ERROR" });
    }
  });

  app.get("/api/reports/sales", tenantAuth, requireTenantAdmin, async (req, res) => {
    try {
      const query = salesQuerySchema.parse(req.query);
      const { where, params } = buildWhere(query, req.auth!.tenantId!);
      const map: Record<string, string> = {
        day: "DATE(s.sale_datetime)", week: "DATE_TRUNC('week', s.sale_datetime)", month: "DATE_TRUNC('month', s.sale_datetime)",
        product: "COALESCE(si.product_name_snapshot, 'Sin producto')", cashier: "COALESCE(u.full_name, 'Sin cajero')", branch: "COALESCE(b.name, 'Central')", paymentMethod: "s.payment_method"
      };
      const joins = query.groupBy === "product" ? "LEFT JOIN sale_items si ON si.sale_id = s.id" : query.groupBy === "cashier" ? "LEFT JOIN users u ON u.id = s.cashier_user_id" : query.groupBy === "branch" ? "LEFT JOIN branches b ON b.id = s.branch_id" : "";
      const groupExpr = map[query.groupBy];
      const rows = await pool.query(`SELECT ${groupExpr} AS label, COALESCE(SUM(s.subtotal_amount::numeric),0) gross, COALESCE(SUM(s.total_amount::numeric),0) net, COALESCE(SUM(s.discount_amount::numeric),0) discounts, COALESCE(SUM(s.surcharge_amount::numeric),0) surcharges, COUNT(DISTINCT s.id)::int count, COALESCE(AVG(s.total_amount::numeric),0) avg_ticket FROM sales s ${joins} WHERE ${where} GROUP BY ${groupExpr} ORDER BY net DESC LIMIT 200`, params);
      return res.json({ groupBy: query.groupBy, rows: rows.rows });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Filtros inválidos", code: "REPORT_FILTERS_INVALID" });
      return res.status(500).json({ error: "No se pudo obtener reporte de ventas", code: "REPORT_SALES_ERROR" });
    }
  });

  app.get("/api/reports/products", tenantAuth, requireTenantAdmin, async (req, res) => {
    try {
      const filters = reportFiltersSchema.parse(req.query);
      const { where, params } = buildWhere(filters, req.auth!.tenantId!);
      const rows = await pool.query(`
        SELECT si.product_id "productId", si.product_name_snapshot name, SUM(si.quantity)::int "qtySold",
          SUM(si.line_total::numeric) revenue,
          AVG(si.unit_price::numeric) "avgPrice",
          COALESCE(SUM((si.unit_price::numeric - COALESCE(sl.average_cost::numeric,0)) * si.quantity),0) "estProfit"
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        LEFT JOIN stock_levels sl ON sl.tenant_id = s.tenant_id AND sl.product_id = si.product_id AND (sl.branch_id = s.branch_id OR (sl.branch_id IS NULL AND s.branch_id IS NULL))
        WHERE ${where}
        GROUP BY si.product_id, si.product_name_snapshot
        ORDER BY revenue DESC
        LIMIT 200`, params);
      const data = rows.rows.map((r: any) => ({ ...r, revenue: Number(r.revenue || 0), avgPrice: Number(r.avgPrice || 0), estProfit: Number(r.estProfit || 0), estMarginPct: Number(r.revenue || 0) > 0 ? (Number(r.estProfit || 0) / Number(r.revenue || 0)) * 100 : 0 }));
      return res.json({ rows: data });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Filtros inválidos", code: "REPORT_FILTERS_INVALID" });
      return res.status(500).json({ error: "No se pudo obtener reporte de productos", code: "REPORT_PRODUCTS_ERROR" });
    }
  });

  app.get("/api/reports/customers", tenantAuth, requireTenantAdmin, async (req, res) => {
    try {
      const filters = reportFiltersSchema.parse(req.query);
      const { where, params } = buildWhere(filters, req.auth!.tenantId!);
      const rows = await pool.query(`
        SELECT c.id "customerId", c.name, COALESCE(SUM(s.total_amount::numeric),0) revenue, COUNT(s.id)::int "purchasesCount",
          COALESCE(AVG(s.total_amount::numeric),0) "avgTicket", MAX(s.sale_datetime) "lastPurchase", c.created_at "customerSince"
        FROM customers c
        LEFT JOIN sales s ON s.customer_id = c.id AND ${where}
        WHERE c.tenant_id = $1
        GROUP BY c.id, c.name, c.created_at
        ORDER BY revenue DESC
        LIMIT 200`, params);
      return res.json({ rows: rows.rows });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Filtros inválidos", code: "REPORT_FILTERS_INVALID" });
      return res.status(500).json({ error: "No se pudo obtener reporte de clientes", code: "REPORT_CUSTOMERS_ERROR" });
    }
  });

  app.get("/api/reports/cash", tenantAuth, requireTenantAdmin, async (req, res) => {
    try {
      const filters = reportFiltersSchema.parse(req.query);
      const params: any[] = [req.auth!.tenantId!, new Date(`${filters.from}T00:00:00.000Z`), new Date(`${filters.to}T23:59:59.999Z`)];
      let where = "tenant_id = $1 AND created_at >= $2 AND created_at < $3";
      if (filters.branchId) { params.push(filters.branchId); where += ` AND branch_id = $${params.length}`; }
      const byType = await pool.query(`SELECT type, COALESCE(SUM(amount::numeric),0) amount FROM cash_movements WHERE ${where} GROUP BY type`, params);
      const daily = await pool.query(`SELECT DATE(created_at) date, COALESCE(SUM(CASE WHEN type='ingreso' THEN amount::numeric ELSE 0 END),0) cash_in, COALESCE(SUM(CASE WHEN type='egreso' THEN amount::numeric ELSE 0 END),0) cash_out FROM cash_movements WHERE ${where} GROUP BY DATE(created_at) ORDER BY DATE(created_at)`, params);
      const cashIn = Number((byType.rows.find((r: any) => r.type === "ingreso")?.amount) || 0);
      const cashOut = Number((byType.rows.find((r: any) => r.type === "egreso")?.amount) || 0);
      return res.json({ cashIn, cashOut, netCash: cashIn - cashOut, byType: byType.rows, daily: daily.rows });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Filtros inválidos", code: "REPORT_FILTERS_INVALID" });
      return res.status(500).json({ error: "No se pudo obtener reporte de caja", code: "REPORT_CASH_ERROR" });
    }
  });

  app.post("/api/reports/export", tenantAuth, requireTenantAdmin, async (req, res) => {
    try {
      ensureExportDir();
      const body = exportSchema.parse(req.body);
      const tenantId = req.auth!.tenantId!;
      const fileName = `report-${body.type}-${Date.now()}.${body.format === "csv" ? "csv" : "pdf"}`;
      const filePath = path.join(EXPORT_DIR, fileName);
      const tenant = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);

      let rows: Record<string, unknown>[] = [];
      if (body.type === "kpis") {
        const data = await kpiData(tenantId, reportFiltersSchema.parse(body.params));
        rows = [data.kpis as any];
      } else {
        const queryPath = body.type === "sales" ? "/api/reports/sales" : body.type === "products" ? "/api/reports/products" : body.type === "customers" ? "/api/reports/customers" : "/api/reports/cash";
        // internal fetch-less path: rerun query logic
        if (body.type === "sales") rows = (await pool.query(`SELECT * FROM sales WHERE tenant_id=$1 ORDER BY sale_datetime DESC LIMIT 300`, [tenantId])).rows;
        if (body.type === "products") rows = (await pool.query(`SELECT * FROM products WHERE tenant_id=$1 ORDER BY id DESC LIMIT 300`, [tenantId])).rows;
        if (body.type === "customers") rows = (await pool.query(`SELECT * FROM customers WHERE tenant_id=$1 ORDER BY id DESC LIMIT 300`, [tenantId])).rows;
        if (body.type === "cash") rows = (await pool.query(`SELECT * FROM cash_movements WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 300`, [tenantId])).rows;
        void queryPath;
      }

      if (body.format === "csv") {
        fs.writeFileSync(filePath, toCsv(rows));
      } else {
        const doc = new PDFDocument({ margin: 40, size: "A4" });
        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);
        doc.fontSize(16).text(`Reporte ${body.type.toUpperCase()}`);
        doc.fontSize(10).text(`Tenant: ${tenant[0]?.name || tenantId}`);
        doc.moveDown();
        rows.slice(0, 80).forEach((row, idx) => doc.fontSize(9).text(`${idx + 1}. ${JSON.stringify(row)}`));
        doc.end();
        await new Promise<void>((resolve) => stream.on("finish", () => resolve()));
      }

      const { token, expiresAt } = signExportToken(tenantId, fileName);
      return res.json({ url: `/api/reports/export/${token}`, expiresAt: new Date(expiresAt * 1000).toISOString() });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Export inválido", code: "REPORT_EXPORT_INVALID" });
      return res.status(500).json({ error: "No se pudo exportar", code: "REPORT_EXPORT_ERROR" });
    }
  });

  app.get("/api/reports/export/:token", async (req, res) => {
    try {
      const { token } = z.object({ token: z.string().min(16) }).parse(req.params);
      const { fileName } = validateExportToken(token);
      const filePath = path.join(EXPORT_DIR, fileName);
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Archivo no encontrado", code: "REPORT_EXPORT_NOT_FOUND" });
      return res.download(filePath, fileName);
    } catch (err: any) {
      if (String(err?.message).includes("EXPIRED")) return res.status(410).json({ error: "Export expirado", code: "REPORT_EXPORT_EXPIRED" });
      return res.status(404).json({ error: "Token inválido", code: "REPORT_EXPORT_INVALID" });
    }
  });


  app.post("/api/reports/materialized/refresh", tenantAuth, requireTenantAdmin, async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const scope = String(req.query.scope || "all").toLowerCase();
      const now = Date.now();
      const throttleMs = Number(process.env.MATERIALIZED_REFRESH_THROTTLE_MS || 300000);
      const last = materializedRefreshByTenant.get(tenantId) || 0;
      if (materializedRefreshInFlightByTenant.has(tenantId)) {
        return res.status(409).json({ error: "Ya hay un refresh en progreso para este tenant", code: "MV_REFRESH_IN_PROGRESS" });
      }
      if (now - last < throttleMs) {
        const retryInSec = Math.ceil((throttleMs - (now - last)) / 1000);
        return res.status(429).json({ error: "Refresh reciente, intentá en unos segundos", code: "MV_REFRESH_THROTTLED", retryInSec });
      }
      materializedRefreshInFlightByTenant.add(tenantId);
      try {
        if (scope === "dashboard") {
          await pool.query("REFRESH MATERIALIZED VIEW mv_orders_by_status");
        } else {
          await pool.query("REFRESH MATERIALIZED VIEW mv_orders_by_status");
          await pool.query("REFRESH MATERIALIZED VIEW mv_sales_history");
          await pool.query("REFRESH MATERIALIZED VIEW mv_cash_daily");
          await pool.query("REFRESH MATERIALIZED VIEW mv_reports_daily_sales");
        }
        materializedRefreshByTenant.set(tenantId, now);
      } finally {
        materializedRefreshInFlightByTenant.delete(tenantId);
      }
      return res.json({ ok: true, code: "MATERIALIZED_REFRESHED", scope });
    } catch {
      return res.status(500).json({ error: "No se pudieron refrescar vistas materializadas", code: "MATERIALIZED_REFRESH_ERROR" });
    }
  });

  app.post("/api/admin/refresh-views", tenantAuth, requireTenantAdmin, async (req, res) => {
    try {
      await pool.query("REFRESH MATERIALIZED VIEW mv_orders_by_status");
      await pool.query("REFRESH MATERIALIZED VIEW mv_sales_history");
      await pool.query("REFRESH MATERIALIZED VIEW mv_cash_daily");
      await pool.query("REFRESH MATERIALIZED VIEW mv_reports_daily_sales");
      return res.json({ ok: true, code: "VIEWS_REFRESHED" });
    } catch {
      return res.status(500).json({ error: "No se pudieron refrescar vistas", code: "VIEWS_REFRESH_ERROR" });
    }
  });
}
