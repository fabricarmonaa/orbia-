const API_BASE = (import.meta.env.VITE_APP_API_URL as string | undefined)?.replace(/\/$/, "") || (import.meta.env.DEV ? "http://localhost:5000" : "https://app.orbiapanel.com");

export async function postPublicSignup(payload: {
  companyName: string;
  ownerName: string;
  email: string;
  phone?: string;
  password: string;
  industry?: string;
}) {
  const res = await fetch(`${API_BASE}/api/public/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error || "No se pudo crear la cuenta");
  }
  return json as { ok: true; tenantCode: string; email: string; nextUrl: string };
}
