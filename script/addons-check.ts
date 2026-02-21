async function req(method: string, path: string, token: string, body?: any) {
  const appUrl = process.env.APP_URL || "http://127.0.0.1:5000";
  const res = await fetch(`${appUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

async function main() {
  const superToken = process.env.SUPER_AUTH_TOKEN || process.env.SUPER_TOKEN || "";
  const tenantToken = process.env.AUTH_TOKEN || process.env.TOKEN || "";
  const tenantId = Number(process.env.TENANT_ID || 0);
  const productCode = process.env.PRODUCT_CODE || "001";

  if (!superToken) throw new Error("SUPER_AUTH_TOKEN (or SUPER_TOKEN) must be set");
  if (!tenantToken) throw new Error("AUTH_TOKEN (or TOKEN) must be set");
  if (!tenantId) throw new Error("TENANT_ID must be set");

  let r = await req("PUT", `/api/super/tenants/${tenantId}/addons`, superToken, { addons: { barcode_scanner: false } });
  if (r.res.status !== 200) throw new Error(`disable addon expected 200 got ${r.res.status}: ${JSON.stringify(r.json)}`);

  r = await req("GET", "/api/tenant/addons", tenantToken);
  if (r.res.status !== 200) throw new Error(`tenant addons expected 200 got ${r.res.status}`);
  if (r.json?.addons?.barcode_scanner !== false) throw new Error("barcode_scanner should be false after disable");

  r = await req("GET", `/api/products/lookup?code=${encodeURIComponent(productCode)}`, tenantToken);
  if (r.res.status !== 403) throw new Error(`lookup without addon expected 403 got ${r.res.status}: ${JSON.stringify(r.json)}`);

  r = await req("PUT", `/api/super/tenants/${tenantId}/addons`, superToken, { addons: { barcode_scanner: true } });
  if (r.res.status !== 200) throw new Error(`enable addon expected 200 got ${r.res.status}: ${JSON.stringify(r.json)}`);

  r = await req("GET", "/api/tenant/addons", tenantToken);
  if (r.res.status !== 200) throw new Error(`tenant addons expected 200 got ${r.res.status}`);
  if (r.json?.addons?.barcode_scanner !== true) throw new Error("barcode_scanner should be true after enable");

  r = await req("GET", `/api/products/lookup?code=${encodeURIComponent(productCode)}`, tenantToken);
  if (![200, 404].includes(r.res.status)) {
    throw new Error(`lookup with addon expected 200/404 got ${r.res.status}: ${JSON.stringify(r.json)}`);
  }

  console.log("addons-check OK", { tenantId, lookupStatus: r.res.status });
}

main().catch((err) => {
  console.error("addons-check FAIL", err?.message || err);
  process.exit(1);
});
