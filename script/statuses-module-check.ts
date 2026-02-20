/* eslint-disable no-console */
const baseUrl = process.env.CHECK_BASE_URL || "http://127.0.0.1:5000";

async function request(path: string, init?: RequestInit) {
  const res = await fetch(`${baseUrl}${path}`, init);
  return { ok: res.ok, status: res.status, body: await res.text() };
}

async function run() {
  const checks = [
    "/api/statuses/ORDER",
    "/api/statuses/PRODUCT",
    "/api/statuses/DELIVERY",
  ];

  for (const path of checks) {
    const res = await request(path, { headers: { Authorization: `Bearer ${process.env.CHECK_TOKEN || ""}` } });
    console.log(path, res.status);
  }

  const forbidden = await request("/api/statuses/ORDER", { headers: { Authorization: `Bearer ${process.env.CHECK_CASHIER_TOKEN || ""}` } });
  console.log("cashier-status", forbidden.status);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
