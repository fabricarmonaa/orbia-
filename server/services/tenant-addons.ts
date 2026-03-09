import { storage } from "../storage";

export const BARCODE_SCANNER_ADDON = "barcode_scanner";
export const MESSAGING_WHATSAPP_ADDON = "messaging_whatsapp";
export const WHATSAPP_INBOX_ADDON = "whatsapp_inbox";

export async function getTenantAddons(tenantId: number) {
  const rows = await storage.getTenantAddons(tenantId);
  const map: Record<string, boolean> = {};
  for (const row of rows) {
    map[row.addonKey] = Boolean(row.enabled);
  }
  if (map[BARCODE_SCANNER_ADDON] === undefined) map[BARCODE_SCANNER_ADDON] = false;
  if (map[MESSAGING_WHATSAPP_ADDON] === undefined) map[MESSAGING_WHATSAPP_ADDON] = false;
  if (map[WHATSAPP_INBOX_ADDON] === undefined) map[WHATSAPP_INBOX_ADDON] = false;
  return map;
}

export async function setTenantAddon(tenantId: number, addonCode: string, enabled: boolean, userId?: number | null) {
  const addon = await storage.upsertTenantAddon({
    tenantId,
    addonKey: addonCode,
    enabled,
    enabledById: userId ?? null,
    enabledAt: enabled ? new Date() : null,
    updatedAt: new Date(),
  } as any);

  return addon;
}
