import { apiRequest } from "@/lib/auth";

export type TenantAddons = {
  barcode_scanner: boolean;
  messaging_whatsapp: boolean;
  whatsapp_inbox: boolean;
};

export const defaultAddons: TenantAddons = {
  barcode_scanner: false,
  messaging_whatsapp: false,
  whatsapp_inbox: false,
};

export async function fetchAddons(): Promise<TenantAddons> {
  const res = await apiRequest("GET", "/api/tenant/addons");
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return defaultAddons;
  return {
    barcode_scanner: Boolean(json?.addons?.barcode_scanner),
    messaging_whatsapp: Boolean(json?.addons?.messaging_whatsapp),
    whatsapp_inbox: Boolean(json?.addons?.whatsapp_inbox),
  };
}
