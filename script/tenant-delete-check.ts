import { Client } from "pg";

const APP_URL = process.env.APP_URL || "http://localhost:5000";
const AUTH_TOKEN = process.env.AUTH_TOKEN || "";
const ACCOUNT_PASSWORD = process.env.ACCOUNT_PASSWORD || "";
const TENANT_ID = Number(process.env.TENANT_ID || "0");

if (!AUTH_TOKEN) throw new Error("AUTH_TOKEN is required");
if (!ACCOUNT_PASSWORD) throw new Error("ACCOUNT_PASSWORD is required");
if (!TENANT_ID) throw new Error("TENANT_ID is required");

async function run() {
  const res = await fetch(`${APP_URL}/api/tenant`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
    body: JSON.stringify({ confirm: "ELIMINAR MI EMPRESA", password: ACCOUNT_PASSWORD }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`DELETE /api/tenant failed (${res.status}): ${JSON.stringify(json)}`);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log("tenant-delete-check: delete OK (skip DB verification: DATABASE_URL missing)");
    return;
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const tables = ["tenants", "users", "customers", "products", "orders", "sales", "order_attachments"];
  for (const table of tables) {
    const result = await client.query(`SELECT COUNT(*)::int AS c FROM ${table} WHERE tenant_id = $1`, [TENANT_ID]);
    const count = Number(result.rows[0]?.c || 0);
    if (count !== 0) {
      await client.end();
      throw new Error(`table ${table} still has ${count} rows for tenant ${TENANT_ID}`);
    }
  }
  await client.end();
  console.log("tenant-delete-check: OK");
}

run().catch((err) => {
  console.error("tenant-delete-check FAIL", err.message);
  process.exit(1);
});
