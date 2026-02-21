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
  if (!Array.isArray(json.data)) throw new Error("data must be an array");
  if (!json.meta || typeof json.meta !== "object") throw new Error("meta missing");
  if (typeof json.meta.limit !== "number") throw new Error("meta.limit must be a number");
  if (typeof json.meta.offset !== "number") throw new Error("meta.offset must be a number");
}

async function main() {
  const token = process.env.AUTH_TOKEN || process.env.TOKEN || "";
  if (!token) throw new Error("AUTH_TOKEN (or TOKEN) must be set");

  const today = new Date();
  const from = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = today.toISOString().slice(0, 10);

  const checks = [
    `/api/sales?limit=20&offset=0`,
    `/api/sales?from=${from}&to=${to}&limit=20&offset=0`,
    `/api/sales?customerQuery=juan&limit=20&offset=0`,
  ];

  for (const path of checks) {
    const { res, json } = await req(path, token);
    if (res.status !== 200) throw new Error(`${path} expected 200 got ${res.status}: ${JSON.stringify(json)}`);
    assertSalesShape(json);
  }

  console.log("sales-history-check OK", { checks: checks.length });
}

main().catch((err) => {
  console.error("sales-history-check FAIL", err?.message || err);
  process.exit(1);
});
