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
  const sku = `001-${stamp}`;

  const create = await req("POST", "/api/products", token, {
    name: `Producto Stock ${stamp}`,
    sku,
    price: 100,
    stock: 0,
  });
  if (create.res.status !== 201) throw new Error(`create product expected 201 got ${create.res.status}: ${JSON.stringify(create.json)}`);
  const productId = Number(create.json?.data?.id);
  if (!productId) throw new Error("create product missing id");

  const listBefore = await req("GET", `/api/products?q=${encodeURIComponent(sku)}&page=1&pageSize=20`, token);
  if (listBefore.res.status !== 200) throw new Error(`list before expected 200 got ${listBefore.res.status}`);
  const rowBefore = (listBefore.json?.data || []).find((r: any) => Number(r.id) === productId);
  const beforeStock = Number(rowBefore?.stockTotal || 0);

  const purchase = await req("POST", "/api/purchases/manual", token, {
    supplierName: `Proveedor Stock ${stamp}`,
    currency: "ARS",
    items: [{ productName: `Producto Stock ${stamp}`, productCode: sku, unitPrice: 50, qty: 12 }],
  });
  if (purchase.res.status !== 201) throw new Error(`manual purchase expected 201 got ${purchase.res.status}: ${JSON.stringify(purchase.json)}`);

  const listAfter = await req("GET", `/api/products?q=${encodeURIComponent(sku)}&page=1&pageSize=20`, token);
  if (listAfter.res.status !== 200) throw new Error(`list after expected 200 got ${listAfter.res.status}`);
  const rowAfter = (listAfter.json?.data || []).find((r: any) => Number(r.id) === productId);
  const afterStock = Number(rowAfter?.stockTotal || 0);
  if (afterStock < beforeStock + 12) throw new Error(`stock not incremented as expected. before=${beforeStock} after=${afterStock}`);

  const patch = await req("PATCH", `/api/products/${productId}/stock`, token, { mode: "global", stock: 7 });
  if (patch.res.status !== 200) throw new Error(`patch stock expected 200 got ${patch.res.status}: ${JSON.stringify(patch.json)}`);

  const listFinal = await req("GET", `/api/products?q=${encodeURIComponent(sku)}&page=1&pageSize=20`, token);
  if (listFinal.res.status !== 200) throw new Error(`list final expected 200 got ${listFinal.res.status}`);
  const rowFinal = (listFinal.json?.data || []).find((r: any) => Number(r.id) === productId);
  const finalStock = Number(rowFinal?.stockTotal || 0);
  if (finalStock !== 7) throw new Error(`global stock set mismatch. expected=7 got=${finalStock}`);

  console.log("stock-purchase-integration-check OK", { productId, beforeStock, afterStock, finalStock });
}

main().catch((err) => {
  console.error("stock-purchase-integration-check FAIL", err?.message || err);
  process.exit(1);
});
