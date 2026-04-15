import fs from "fs";
import path from "path";
import { STORAGE_ROOT } from "./storage-provider";

function normalizeSafePath(input: string | null | undefined) {
  return path.normalize(String(input || "")).replace(/^(\.\.(\/|\\|$))+/, "");
}

function firstExistingPath(candidates: string[]) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function resolveAttachmentAbsolutePath(input: {
  storagePath?: string | null;
  storedName?: string | null;
  tenantCode?: string | null;
  orderId?: number | null;
}) {
  const safeStoragePath = normalizeSafePath(input.storagePath);
  const safeStoredName = path.basename(String(input.storedName || ""));
  const safeTenantCode = String(input.tenantCode || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const orderId = Number(input.orderId || 0);

  const direct = safeStoragePath ? path.join(STORAGE_ROOT, safeStoragePath) : "";

  const candidates = [
    direct,
    safeStoragePath ? path.join(process.cwd(), safeStoragePath) : "", // legado absoluto relativo al repo
    safeStoredName && safeTenantCode && orderId
      ? path.join(STORAGE_ROOT, "tenants", safeTenantCode, "orders", String(orderId), safeStoredName)
      : "",
    safeStoredName && safeTenantCode
      ? path.join(STORAGE_ROOT, "tenants", safeTenantCode, "orders", safeStoredName)
      : "",
  ];

  return firstExistingPath(candidates);
}
