async function req(method: string, path: string, token: string, body?: any) {
  const appUrl = process.env.APP_URL || "http://127.0.0.1:5000";
  const res = await fetch(`${appUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

async function main() {
  const token = process.env.AUTH_TOKEN || process.env.TOKEN || "";
  const tenantId = Number(process.env.TENANT_ID || 0);
  const dbUrl = process.env.DATABASE_URL || "";
  if (!dbUrl) throw new Error("DATABASE_URL must be set");
  if (!token) throw new Error("AUTH_TOKEN (or TOKEN) must be set");
  if (!tenantId) throw new Error("TENANT_ID must be set");

  const stamp = `${Date.now()}`.slice(-8);
  const supplierName = `Proveedor API ${stamp}`;

  let r = await req("GET", "/api/purchases?limit=30&offset=0", token);
  if (r.res.status !== 200) throw new Error(`list expected 200 got ${r.res.status}: ${JSON.stringify(r.json)}`);
  if (!Array.isArray(r.json?.items) || typeof r.json?.total !== "number") {
    throw new Error(`list shape expected {items,total}: ${JSON.stringify(r.json)}`);
  }

  r = await req("POST", "/api/purchases/manual", token, {
    supplierName,
    currency: "ARS",
    items: [{ productName: `Producto API ${stamp}`, productCode: `API-${stamp}`, unitPrice: 321, qty: 2 }],
  });
  if (r.res.status !== 201) throw new Error(`manual create expected 201 got ${r.res.status}: ${JSON.stringify(r.json)}`);
  const purchaseId = Number(r.json?.purchaseId || 0);
  if (!purchaseId) throw new Error(`missing purchaseId: ${JSON.stringify(r.json)}`);

  r = await req("GET", "/api/purchases?limit=30&offset=0", token);
  if (r.res.status !== 200) throw new Error(`list after create expected 200 got ${r.res.status}: ${JSON.stringify(r.json)}`);
  if (!Array.isArray(r.json?.items) || !r.json.items.some((it: any) => Number(it.id) === purchaseId && it.supplierName === supplierName)) {
    throw new Error(`new purchase ${purchaseId} not found in list: ${JSON.stringify(r.json)}`);
  }

  r = await req("GET", `/api/purchases/${purchaseId}`, token);
  if (r.res.status !== 200) throw new Error(`detail expected 200 got ${r.res.status}: ${JSON.stringify(r.json)}`);
  if (!Array.isArray(r.json?.items) || r.json.items.length < 1) {
    throw new Error(`detail items expected non-empty array: ${JSON.stringify(r.json)}`);
  }

  console.log("purchases-api-check: OK", { tenantId, purchaseId });
}

main().catch((err) => {
  console.error("purchases-api-check FAIL", err?.message || err);
  process.exit(1);
});
