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
  if (!token) throw new Error("AUTH_TOKEN (or TOKEN) must be set");

  const stamp = `${Date.now()}`.slice(-6);
  const create = await req("POST", "/api/purchases/manual", token, {
    supplierName: `Proveedor E2E ${stamp}`,
    currency: "ARS",
    items: [{ productName: `Prod E2E ${stamp}`, productCode: `E2E-${stamp}`, unitPrice: 100, qty: 2 }],
  });
  if (create.res.status !== 201) throw new Error(`manual create expected 201 got ${create.res.status}: ${JSON.stringify(create.json)}`);

  const purchaseId = Number(create.json?.purchaseId || create.json?.purchase?.id);
  if (!purchaseId) throw new Error("manual create did not return purchaseId");

  const list = await req("GET", "/api/purchases?limit=30&offset=0", token);
  if (list.res.status !== 200) throw new Error(`list expected 200 got ${list.res.status}`);
  const ids = (list.json?.items || list.json?.data || []).map((r: any) => Number(r.id));
  if (!ids.includes(purchaseId)) throw new Error(`created purchase ${purchaseId} not found in list`);

  const detail = await req("GET", `/api/purchases/${purchaseId}`, token);
  if (detail.res.status !== 200) throw new Error(`detail expected 200 got ${detail.res.status}`);
  if (!Array.isArray(detail.json?.items) || detail.json.items.length < 1) throw new Error("detail items missing");

  console.log("purchases-e2e-check OK", { purchaseId });
}

main().catch((err) => {
  console.error("purchases-e2e-check FAIL", err?.message || err);
  process.exit(1);
});
