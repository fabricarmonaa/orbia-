import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execFileSync } from "child_process";
import { pool } from "../db";

const EXPORT_DIR = path.join(process.cwd(), "uploads", "exports");
const EXPORT_HMAC_SECRET = process.env.EXPORT_TOKEN_SECRET || process.env.SESSION_SECRET || "orbia-export-secret";
const EXPORT_TTL_SECONDS = 15 * 60;

function ensureExportDir() {
  if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

function csvEscape(value: unknown) {
  const raw = String(value ?? "");
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  if (safe.includes(",") || safe.includes('"') || safe.includes("\n")) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  return lines.join("\n");
}

async function queryRows(client: any, sql: string, params: any[] = []) {
  const res = await client.query(sql, params);
  return res.rows as Record<string, unknown>[];
}

export async function generateTenantExportZip(tenantId: number, userId: number) {
  ensureExportDir();
  const client = await pool.connect();
  const ts = Date.now();
  const workDir = path.join(EXPORT_DIR, `tmp-${tenantId}-${userId}-${ts}`);
  fs.mkdirSync(workDir, { recursive: true });

  try {
    const tenant = (await queryRows(client, "select id, code, name, slug, tos_content, tos_updated_at, plan_id, is_active, is_blocked, created_at from tenants where id = $1", [tenantId]))[0];
    if (!tenant) throw new Error("TENANT_NOT_FOUND");

    const branches = await queryRows(client, "select * from branches where tenant_id = $1", [tenantId]);
    const users = await queryRows(client, "select id, tenant_id, email, full_name, role, scope, branch_id, is_active, is_super_admin, created_at from users where tenant_id = $1", [tenantId]);
    const cashiers = await queryRows(client, "select id, tenant_id, branch_id, name, active, created_at, updated_at from cashiers where tenant_id = $1", [tenantId]);
    const products = await queryRows(client, "select * from products where tenant_id = $1", [tenantId]);
    const stockByBranch = await queryRows(client, "select * from product_stock_by_branch where tenant_id = $1", [tenantId]);
    const customers = await queryRows(client, "select * from customers where tenant_id = $1", [tenantId]);
    const sales = await queryRows(client, "select * from sales where tenant_id = $1", [tenantId]);
    const saleItems = await queryRows(client, "select * from sale_items where tenant_id = $1", [tenantId]);
    const cashSessions = await queryRows(client, "select * from cash_sessions where tenant_id = $1", [tenantId]);
    const cashMovements = await queryRows(client, "select * from cash_movements where tenant_id = $1", [tenantId]);
    const purchases = await queryRows(client, "select * from purchases where tenant_id = $1", [tenantId]);
    const purchaseItems = await queryRows(client, "select * from purchase_items where tenant_id = $1", [tenantId]);
    const importJobs = await queryRows(client, "select * from import_jobs where tenant_id = $1", [tenantId]);
    const branding = await queryRows(client, "select * from tenant_branding where tenant_id = $1", [tenantId]);
    const tenantConfig = await queryRows(client, "select * from tenant_config where tenant_id = $1", [tenantId]);

    fs.writeFileSync(path.join(workDir, "tenant.json"), JSON.stringify(tenant, null, 2));
    fs.writeFileSync(path.join(workDir, "branches.csv"), toCsv(branches));
    fs.writeFileSync(path.join(workDir, "users.csv"), toCsv(users));
    fs.writeFileSync(path.join(workDir, "cashiers.csv"), toCsv(cashiers));
    fs.writeFileSync(path.join(workDir, "products.csv"), toCsv(products));
    fs.writeFileSync(path.join(workDir, "stock_by_branch.csv"), toCsv(stockByBranch));
    fs.writeFileSync(path.join(workDir, "customers.csv"), toCsv(customers));
    fs.writeFileSync(path.join(workDir, "sales.csv"), toCsv(sales));
    fs.writeFileSync(path.join(workDir, "sale_items.csv"), toCsv(saleItems));
    fs.writeFileSync(path.join(workDir, "cash_sessions.csv"), toCsv(cashSessions));
    fs.writeFileSync(path.join(workDir, "cash_movements.csv"), toCsv(cashMovements));
    fs.writeFileSync(path.join(workDir, "purchases.csv"), toCsv(purchases));
    fs.writeFileSync(path.join(workDir, "purchase_items.csv"), toCsv(purchaseItems));
    fs.writeFileSync(path.join(workDir, "import_jobs.csv"), toCsv(importJobs));
    fs.writeFileSync(path.join(workDir, "branding.json"), JSON.stringify(branding[0] || {}, null, 2));
    fs.writeFileSync(path.join(workDir, "tenant_config.json"), JSON.stringify(tenantConfig[0] || {}, null, 2));
    fs.writeFileSync(path.join(workDir, "tos.html"), String(tenant.tos_content || ""));

    const zipName = `tenant-export-${tenantId}-${ts}.zip`;
    const zipPath = path.join(EXPORT_DIR, zipName);
    execFileSync("zip", ["-r", zipPath, "."], { cwd: workDir });

    const exp = Math.floor(Date.now() / 1000) + EXPORT_TTL_SECONDS;
    const payload = `${tenantId}.${userId}.${exp}.${zipName}`;
    const sig = crypto.createHmac("sha256", EXPORT_HMAC_SECRET).update(payload).digest("hex");
    const token = Buffer.from(`${payload}.${sig}`).toString("base64url");
    return { token, zipPath, expiresAt: exp };
  } finally {
    client.release();
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

export function validateExportToken(token: string, tenantId: number, userId: number) {
  const decoded = Buffer.from(token, "base64url").toString("utf8");
  const parts = decoded.split(".");
  if (parts.length < 5) throw new Error("EXPORT_TOKEN_INVALID");
  const [tid, uid, exp, ...rest] = parts;
  const sig = rest.pop() as string;
  const zipName = rest.join(".");
  const payload = `${tid}.${uid}.${exp}.${zipName}`;
  const expected = crypto.createHmac("sha256", EXPORT_HMAC_SECRET).update(payload).digest("hex");
  if (sig !== expected) throw new Error("EXPORT_TOKEN_INVALID");
  if (Number(tid) !== tenantId || Number(uid) !== userId) throw new Error("EXPORT_TOKEN_FORBIDDEN");
  if (Math.floor(Date.now() / 1000) > Number(exp)) throw new Error("EXPORT_TOKEN_EXPIRED");
  const zipPath = path.join(EXPORT_DIR, zipName);
  if (!fs.existsSync(zipPath)) throw new Error("EXPORT_FILE_NOT_FOUND");
  return { zipPath, zipName };
}

async function deleteCount(client: any, table: string, where: string, params: any[]) {
  const countRes = await client.query(`select count(*)::int as c from ${table} ${where}`, params);
  const count = Number(countRes.rows[0]?.c || 0);
  await client.query(`delete from ${table} ${where}`, params);
  return count;
}

export async function deleteTenantAtomic(tenantId: number) {
  const client = await pool.connect();
  const counts: Record<string, number> = {};
  try {
    await client.query("BEGIN");

    // FK-first deletions
    counts.sale_items = await deleteCount(client, "sale_items", "where tenant_id = $1", [tenantId]);
    counts.sales = await deleteCount(client, "sales", "where tenant_id = $1", [tenantId]);
    counts.tenant_counters = await deleteCount(client, "tenant_counters", "where tenant_id = $1", [tenantId]);

    counts.purchase_items = await deleteCount(client, "purchase_items", "where tenant_id = $1", [tenantId]);
    counts.purchases = await deleteCount(client, "purchases", "where tenant_id = $1", [tenantId]);

    counts.cash_movements = await deleteCount(client, "cash_movements", "where tenant_id = $1", [tenantId]);
    counts.cash_sessions = await deleteCount(client, "cash_sessions", "where tenant_id = $1", [tenantId]);

    counts.stock_movements = await deleteCount(client, "stock_movements", "where tenant_id = $1", [tenantId]);
    counts.product_stock_by_branch = await deleteCount(client, "product_stock_by_branch", "where tenant_id = $1", [tenantId]);

    counts.import_jobs = await deleteCount(client, "import_jobs", "where tenant_id = $1", [tenantId]);
    counts.customers = await deleteCount(client, "customers", "where tenant_id = $1", [tenantId]);

    counts.order_comments = await deleteCount(client, "order_comments", "where tenant_id = $1", [tenantId]);
    counts.order_status_history = await deleteCount(client, "order_status_history", "where tenant_id = $1", [tenantId]);
    counts.orders = await deleteCount(client, "orders", "where tenant_id = $1", [tenantId]);
    counts.order_statuses = await deleteCount(client, "order_statuses", "where tenant_id = $1", [tenantId]);

    counts.expense_definitions = await deleteCount(client, "expense_definitions", "where tenant_id = $1", [tenantId]);
    counts.expense_categories = await deleteCount(client, "expense_categories", "where tenant_id = $1", [tenantId]);
    counts.fixed_expenses = await deleteCount(client, "fixed_expenses", "where tenant_id = $1", [tenantId]);

    counts.cashiers = await deleteCount(client, "cashiers", "where tenant_id = $1", [tenantId]);
    counts.product_categories = await deleteCount(client, "product_categories", "where tenant_id = $1", [tenantId]);
    counts.products = await deleteCount(client, "products", "where tenant_id = $1", [tenantId]);

    counts.delivery_routes_stops = await deleteCount(client, "delivery_route_stops", "where tenant_id = $1", [tenantId]).catch(() => 0);
    counts.delivery_routes = await deleteCount(client, "delivery_routes", "where tenant_id = $1", [tenantId]).catch(() => 0);
    counts.delivery_agents = await deleteCount(client, "delivery_agents", "where tenant_id = $1", [tenantId]).catch(() => 0);

    counts.message_templates = await deleteCount(client, "message_templates", "where tenant_id = $1", [tenantId]).catch(() => 0);
    counts.stt_logs = await deleteCount(client, "stt_logs", "where tenant_id = $1", [tenantId]).catch(() => 0);
    counts.audit_logs = await deleteCount(client, "audit_logs", "where tenant_id = $1", [tenantId]).catch(() => 0);

    counts.tenant_branding = await deleteCount(client, "tenant_branding", "where tenant_id = $1", [tenantId]).catch(() => 0);
    counts.tenant_pdf_settings = await deleteCount(client, "tenant_pdf_settings", "where tenant_id = $1", [tenantId]).catch(() => 0);
    counts.tenant_config = await deleteCount(client, "tenant_config", "where tenant_id = $1", [tenantId]).catch(() => 0);
    counts.tenant_monthly_summary = await deleteCount(client, "tenant_monthly_summary", "where tenant_id = $1", [tenantId]).catch(() => 0);
    counts.tenant_addons = await deleteCount(client, "tenant_addons", "where tenant_id = $1", [tenantId]).catch(() => 0);
    counts.tenant_subscriptions = await deleteCount(client, "tenant_subscriptions", "where tenant_id = $1", [tenantId]).catch(() => 0);

    counts.branch_users = await deleteCount(client, "users", "where tenant_id = $1", [tenantId]);
    counts.branches = await deleteCount(client, "branches", "where tenant_id = $1", [tenantId]);

    const tcount = await deleteCount(client, "tenants", "where id = $1", [tenantId]);
    counts.tenants = tcount;

    await client.query("COMMIT");
    return counts;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export function exportsDirectory() {
  ensureExportDir();
  return EXPORT_DIR;
}
