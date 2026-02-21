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
  if (!token) throw new Error("AUTH_TOKEN (or TOKEN) must be set");

  const uniqueDoc = `${Date.now()}`.slice(-10);

  const create = await req("POST", "/api/customers", token, {
    name: `Cliente E2E ${uniqueDoc}`,
    doc: uniqueDoc,
    phone: "2234000000",
  });
  if (create.res.status !== 201) throw new Error(`create expected 201 got ${create.res.status}: ${JSON.stringify(create.json)}`);
  const id = create.json?.data?.id;
  if (!id) throw new Error("create did not return customer id");

  const list = await req("GET", "/api/customers?q=&limit=20&offset=0", token);
  if (list.res.status !== 200) throw new Error(`list expected 200 got ${list.res.status}`);
  if (!Array.isArray(list.json?.data)) throw new Error("list shape invalid: data[] missing");

  const history = await req("GET", `/api/customers/${id}/history`, token);
  if (history.res.status !== 200) throw new Error(`history expected 200 got ${history.res.status}`);
  if (!Array.isArray(history.json?.sales) || !Array.isArray(history.json?.orders)) {
    throw new Error(`history shape invalid: ${JSON.stringify(history.json)}`);
  }

  const disable = await req("PATCH", `/api/customers/${id}/active`, token, { active: false });
  if (disable.res.status !== 200) throw new Error(`disable expected 200 got ${disable.res.status}`);

  const enable = await req("PATCH", `/api/customers/${id}/active`, token, { active: true });
  if (enable.res.status !== 200) throw new Error(`enable expected 200 got ${enable.res.status}`);

  console.log("customers-e2e-check OK", { id, uniqueDoc });
}

main().catch((err) => {
  console.error("customers-e2e-check FAIL", err?.message || err);
  process.exit(1);
});
