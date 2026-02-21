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

export function appendTenantEvent(data: { tenantId: number; userId?: number | null; action: string; entityType: string; entityId?: number | null; metadata?: any; ts?: string; }) {
  try {
    const ts = data.ts || new Date().toISOString();
    const tenantDir = path.join(LOG_ROOT, `tenant_${data.tenantId}`);
    ensureDir(tenantDir);
    const file = path.join(tenantDir, `events_${ym(new Date(ts))}.log`);
    fs.appendFileSync(file, JSON.stringify({ ts, tenantId: data.tenantId, userId: data.userId ?? null, action: data.action, entityType: data.entityType, entityId: data.entityId ?? null, metadata: data.metadata ?? null }) + "\n", "utf8");
    cleanupTenantOldLogs(tenantDir);
  } catch {
    // non-blocking
  }
}

function cleanupTenantOldLogs(tenantDir: string) {
  if (!RETENTION_MONTHS || RETENTION_MONTHS <= 0) return;
  const files = fs.readdirSync(tenantDir).filter((f) => /^events_\d{4}-\d{2}\.log$/.test(f)).sort();
  const keep = Math.max(1, RETENTION_MONTHS);
  const remove = files.slice(0, Math.max(0, files.length - keep));
  for (const f of remove) {
    try { fs.unlinkSync(path.join(tenantDir, f)); } catch {}
  }
}
