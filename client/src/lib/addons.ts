import { apiRequest } from "@/lib/auth";

export type TenantAddons = {
  barcode_scanner: boolean;
};

export const defaultAddons: TenantAddons = {
  barcode_scanner: false,
};

export async function fetchAddons(): Promise<TenantAddons> {
  const res = await apiRequest("GET", "/api/tenant/addons");
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return defaultAddons;
  return {
    barcode_scanner: Boolean(json?.addons?.barcode_scanner),
  };
}
