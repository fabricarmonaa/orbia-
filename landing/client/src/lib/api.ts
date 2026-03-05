import { getAppOrigin } from "@/lib/app-origin";

const API_BASE = getAppOrigin();

export async function postPublicOnboard(payload: {
  companyName: string;
  ownerName: string;
  email: string;
  password: string;
  industry: string;
}) {
  const res = await fetch(`${API_BASE}/api/public/onboard`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error || "No se pudo crear la cuenta");
  }
  return json as { ok: true; tenantCode: string; tenantSlug?: string; loginUrl: string };
}
