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
  const token = process.env.AUTH_TOKEN || "";
  if (!token) throw new Error("AUTH_TOKEN is required");
  const code = `SKU${Date.now()}`;
  const r = await req("POST", "/api/products", token, {
    name: `Producto ${code}`,
    price: 1200,
    sku: code,
    stock: 5,
    pricingMode: "MANUAL",
  });
  if (r.res.status !== 201) throw new Error(`expected 201 got ${r.res.status}: ${JSON.stringify(r.json)}`);
  console.log("products-create-check: OK", { id: r.json?.data?.id });
}

main().catch((err) => {
  console.error("products-create-check FAIL", err?.message || err);
  process.exit(1);
});
