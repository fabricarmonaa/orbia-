async function req(path: string, token: string) {
  const appUrl = process.env.APP_URL || "http://127.0.0.1:5000";
  const res = await fetch(`${appUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

function assertSalesShape(json: any) {
  if (!json || typeof json !== "object") throw new Error("response is not an object");
  if (!Array.isArray(json.items)) throw new Error("items must be an array");
  if (typeof json.total !== "number") throw new Error("total must be a number");
}

async function main() {
  const token = process.env.AUTH_TOKEN || process.env.TOKEN || "";
  const tenantId = Number(process.env.TENANT_ID || 0);
  const dbUrl = process.env.DATABASE_URL || "";
  if (!dbUrl) throw new Error("DATABASE_URL must be set");
  if (!token) throw new Error("AUTH_TOKEN (or TOKEN) must be set");
  if (!tenantId) throw new Error("TENANT_ID must be set");

  const checks = [
    `/api/sales?limit=5&offset=0&sort=date_desc`,
    `/api/sales?from=2026-02-20&to=2026-02-21&limit=50&offset=0&sort=date_desc`,
  ];

  for (const path of checks) {
    const { res, json } = await req(path, token);
    if (res.status !== 200) throw new Error(`${path} expected 200 got ${res.status}: ${JSON.stringify(json)}`);
    assertSalesShape(json);
  }

  console.log("sales-history-check: OK", { tenantId, checks: checks.length });
}

main().catch((err) => {
  console.error("sales-history-check FAIL", err?.message || err);
  process.exit(1);
});
