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
  const token = process.env.AUTH_TOKEN || process.env.TOKEN || "";
  const tenantId = Number(process.env.TENANT_ID || 0);
  const dbUrl = process.env.DATABASE_URL || "";
  if (!dbUrl) throw new Error("DATABASE_URL must be set");
  if (!token) throw new Error("AUTH_TOKEN (or TOKEN) must be set");
  if (!tenantId) throw new Error("TENANT_ID must be set");

  const uniqueDoc = `99${Date.now().toString().slice(-8)}`;

  let r = await req("GET", "/api/customers?q=&limit=100&offset=0&includeInactive=false", token);
  if (r.res.status !== 200 || !Array.isArray(r.json?.items) || typeof r.json?.total !== "number") {
    throw new Error(`list expected 200 + {items,total} got ${r.res.status}: ${JSON.stringify(r.json)}`);
  }

  r = await req("POST", "/api/customers", token, { name: `Cliente ${uniqueDoc}`, doc: uniqueDoc, phone: "223111222" });
  if (r.res.status !== 201) throw new Error(`create expected 201 got ${r.res.status}: ${JSON.stringify(r.json)}`);
  const id = Number(r.json?.data?.id || 0);
  if (!id) throw new Error(`create missing id: ${JSON.stringify(r.json)}`);

  r = await req("GET", `/api/customers?q=${encodeURIComponent(uniqueDoc)}&limit=100&offset=0&includeInactive=false`, token);
  if (r.res.status !== 200) throw new Error(`list by doc expected 200 got ${r.res.status}`);
  if (!Array.isArray(r.json?.items) || !r.json.items.some((c: any) => Number(c.id) === id)) {
    throw new Error(`created customer not found in list: ${JSON.stringify(r.json)}`);
  }

  r = await req("POST", "/api/customers", token, { name: `Cliente DUP ${uniqueDoc}`, doc: uniqueDoc });
  if (r.res.status !== 409) throw new Error(`duplicate active expected 409 got ${r.res.status}: ${JSON.stringify(r.json)}`);

  r = await req("PATCH", `/api/customers/${id}/active`, token, { active: false });
  if (r.res.status !== 200) throw new Error(`deactivate expected 200 got ${r.res.status}: ${JSON.stringify(r.json)}`);

  r = await req("POST", "/api/customers", token, { name: `Cliente REACT ${uniqueDoc}`, doc: uniqueDoc, phone: "223999888" });
  if (r.res.status !== 200) throw new Error(`reactivation expected 200 got ${r.res.status}: ${JSON.stringify(r.json)}`);
  if (r.json?.reactivated !== true) throw new Error(`reactivation flag missing: ${JSON.stringify(r.json)}`);

  console.log("customers-api-check: OK", { tenantId, customerId: id, uniqueDoc });
}

main().catch((err) => {
  console.error("customers-api-check FAIL", err?.message || err);
  process.exit(1);
});
