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

async function tableExists(client: any, table: string) {
  const res = await client.query(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    ) AS ok`,
    [table]
  );
  return Boolean(res.rows[0]?.ok);
}

async function deleteByTenantIfExists(client: any, counts: Record<string, number>, table: string, tenantId: number) {
  if (!(await tableExists(client, table))) {
    counts[table] = 0;
    return 0;
  }
  const c = await deleteCount(client, table, "where tenant_id = $1", [tenantId]);
  counts[table] = c;
  return c;
}

export async function deleteTenantAtomic(tenantId: number) {
  const client = await pool.connect();
  const counts: Record<string, number> = {};
  try {
    await client.query("BEGIN");

    const tenantRow = await client.query("SELECT code FROM tenants WHERE id = $1", [tenantId]);
    const tenantCode = String(tenantRow.rows[0]?.code || "").trim();

    // FK-first deletions (safe if optional tables/migrations are missing)
    await deleteByTenantIfExists(client, counts, "sale_items", tenantId);
    await deleteByTenantIfExists(client, counts, "sales", tenantId);
    await deleteByTenantIfExists(client, counts, "tenant_counters", tenantId);

    await deleteByTenantIfExists(client, counts, "purchase_items", tenantId);
    await deleteByTenantIfExists(client, counts, "purchases", tenantId);

    await deleteByTenantIfExists(client, counts, "cash_movements", tenantId);
    await deleteByTenantIfExists(client, counts, "cash_sessions", tenantId);

    await deleteByTenantIfExists(client, counts, "stock_movements", tenantId);
    await deleteByTenantIfExists(client, counts, "product_stock_by_branch", tenantId);

    await deleteByTenantIfExists(client, counts, "order_attachments", tenantId);
    await deleteByTenantIfExists(client, counts, "order_field_values", tenantId);
    await deleteByTenantIfExists(client, counts, "order_field_definitions", tenantId);
    await deleteByTenantIfExists(client, counts, "order_type_presets", tenantId);
    await deleteByTenantIfExists(client, counts, "order_type_definitions", tenantId);

    await deleteByTenantIfExists(client, counts, "import_jobs", tenantId);
    await deleteByTenantIfExists(client, counts, "customers", tenantId);

    await deleteByTenantIfExists(client, counts, "order_comments", tenantId);
    await deleteByTenantIfExists(client, counts, "order_status_history", tenantId);
    await deleteByTenantIfExists(client, counts, "orders", tenantId);
    await deleteByTenantIfExists(client, counts, "order_statuses", tenantId);
    await deleteByTenantIfExists(client, counts, "status_definitions", tenantId);

    await deleteByTenantIfExists(client, counts, "expense_definitions", tenantId);
    await deleteByTenantIfExists(client, counts, "expense_categories", tenantId);
    await deleteByTenantIfExists(client, counts, "fixed_expenses", tenantId);

    await deleteByTenantIfExists(client, counts, "cashiers", tenantId);
    await deleteByTenantIfExists(client, counts, "product_categories", tenantId);
    await deleteByTenantIfExists(client, counts, "products", tenantId);

    await deleteByTenantIfExists(client, counts, "delivery_route_stops", tenantId);
    await deleteByTenantIfExists(client, counts, "delivery_routes", tenantId);
    await deleteByTenantIfExists(client, counts, "delivery_agents", tenantId);

    await deleteByTenantIfExists(client, counts, "message_templates", tenantId);
    await deleteByTenantIfExists(client, counts, "stt_logs", tenantId);
    await deleteByTenantIfExists(client, counts, "stt_interactions", tenantId);
    await deleteByTenantIfExists(client, counts, "audit_logs", tenantId);

    await deleteByTenantIfExists(client, counts, "tenant_branding", tenantId);
    await deleteByTenantIfExists(client, counts, "tenant_pdf_settings", tenantId);
    await deleteByTenantIfExists(client, counts, "tenant_config", tenantId);
    await deleteByTenantIfExists(client, counts, "tenant_monthly_summary", tenantId);
    await deleteByTenantIfExists(client, counts, "tenant_dashboard_settings", tenantId);
    await deleteByTenantIfExists(client, counts, "tenant_addons", tenantId);
    await deleteByTenantIfExists(client, counts, "tenant_subscriptions", tenantId);

    if (await tableExists(client, "users")) {
      const userCountRes = await client.query("SELECT COUNT(*)::int as c FROM users WHERE tenant_id = $1 AND deleted_at IS NULL", [tenantId]);
      counts.branch_users = Number(userCountRes.rows[0]?.c || 0);
      await client.query("UPDATE users SET is_active = false, deleted_at = NOW() WHERE tenant_id = $1", [tenantId]);
    } else {
      counts.branch_users = 0;
    }
    counts.branches = await deleteByTenantIfExists(client, counts, "branches", tenantId);

    if (await tableExists(client, "tenants")) {
      await client.query("UPDATE tenants SET is_active = false, is_blocked = true, deleted_at = NOW() WHERE id = $1", [tenantId]);
      counts.tenants = 1;
    } else {
      counts.tenants = 0;
    }

    await client.query("COMMIT");

    if (tenantCode) {
      const storageDir = path.join(process.cwd(), "storage", "tenants", tenantCode);
      const uploadsDir = path.join(process.cwd(), "uploads", "tenants", tenantCode);
      fs.rmSync(storageDir, { recursive: true, force: true });
      fs.rmSync(uploadsDir, { recursive: true, force: true });
    }

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
