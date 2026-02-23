import fs from "fs";
import path from "path";

const LOG_ROOT = path.join(process.cwd(), "logs");
const RETENTION_MONTHS = Number(process.env.TENANT_LOG_RETENTION_MONTHS || 12);

function ym(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function sanitizeTenantKey(value: string | number) {
  return String(value).trim().replace(/[^a-zA-Z0-9_-]/g, "_") || "tenant";
}

function tenantLogKey(input: { tenantId: number; tenantSlug?: string | null }) {
  return sanitizeTenantKey(input.tenantSlug || input.tenantId);
}

export function appendTenantEvent(data: { tenantId: number; tenantSlug?: string | null; userId?: number | null; action: string; entityType: string; entityId?: number | null; metadata?: any; ts?: string; }) {
  try {
    const ts = data.ts || new Date().toISOString();
    ensureDir(LOG_ROOT);
    const key = tenantLogKey(data);
    const file = path.join(LOG_ROOT, `${key}_events_${ym(new Date(ts))}.log`);
    fs.appendFileSync(file, JSON.stringify({ ts, tenantId: data.tenantId, tenantSlug: data.tenantSlug || null, userId: data.userId ?? null, action: data.action, entityType: data.entityType, entityId: data.entityId ?? null, metadata: data.metadata ?? null }) + "\n", "utf8");
    cleanupTenantOldLogs(key);
  } catch {
    // non-blocking
  }
}

function cleanupTenantOldLogs(tenantKey: string) {
  if (!RETENTION_MONTHS || RETENTION_MONTHS <= 0) return;
  ensureDir(LOG_ROOT);
  const escapedKey = tenantKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escapedKey}_events_\\d{4}-\\d{2}\\.log$`);
  const files = fs.readdirSync(LOG_ROOT).filter((f) => pattern.test(f)).sort();
  const keep = Math.max(1, RETENTION_MONTHS);
  const remove = files.slice(0, Math.max(0, files.length - keep));
  for (const f of remove) {
    try { fs.unlinkSync(path.join(LOG_ROOT, f)); } catch {}
  }
}
