import { Client } from "pg";

const APP_URL = process.env.APP_URL || "http://localhost:5000";
const AUTH_TOKEN = process.env.AUTH_TOKEN || "";
const ACCOUNT_PASSWORD = process.env.ACCOUNT_PASSWORD || "";
const TENANT_ID = Number(process.env.TENANT_ID || "0");
const BRANCH_ID = Number(process.env.BRANCH_ID || "0");

if (!AUTH_TOKEN) throw new Error("AUTH_TOKEN is required");
if (!ACCOUNT_PASSWORD) throw new Error("ACCOUNT_PASSWORD is required");
if (!TENANT_ID) throw new Error("TENANT_ID is required");

const authHeaders = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${AUTH_TOKEN}`,
};

async function createDummyData() {
  if (!BRANCH_ID) return;

  const customerRes = await fetch(`${APP_URL}/api/customers`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ name: "QA Delete Tenant", phone: "+54 11 5555-1234", email: "qa.delete.tenant@example.com" }),
  });
  const customerJson = await customerRes.json().catch(() => ({}));
  if (!customerRes.ok) throw new Error(`create customer failed: ${JSON.stringify(customerJson)}`);

  const productRes = await fetch(`${APP_URL}/api/products`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      name: "Producto QA Delete Tenant",
      price: "100",
      branch_id: BRANCH_ID,
      stock_mode: "FINITE",
      stock: 3,
    }),
  });
  const productJson = await productRes.json().catch(() => ({}));
  if (!productRes.ok) throw new Error(`create product failed: ${JSON.stringify(productJson)}`);

  const productId = Number(productJson?.data?.id || productJson?.id || 0);
  if (!productId) throw new Error("create product did not return id");

  const saleRes = await fetch(`${APP_URL}/api/sales`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      branch_id: BRANCH_ID,
      payment_method: "EFECTIVO",
      items: [{ product_id: productId, quantity: 1, unit_price: 100 }],
    }),
  });
  const saleJson = await saleRes.json().catch(() => ({}));
  if (!saleRes.ok) throw new Error(`create sale failed: ${JSON.stringify(saleJson)}`);
}

async function verifyDatabaseCleanup() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log("tenant-delete-check: delete OK (skip DB verification: DATABASE_URL missing)");
    return;
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const tables = [
    "tenants",
    "users",
    "customers",
    "products",
    "sales",
    "sale_items",
    "orders",
    "order_attachments",
    "cash_sessions",
    "cash_movements",
    "audit_logs",
  ];

  for (const table of tables) {
    const exists = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema='public' AND table_name=$1
       ) AS ok`,
      [table],
    );
    if (!exists.rows[0]?.ok) continue;

    const hasTenantColumn = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name=$1 AND column_name='tenant_id'
       ) AS ok`,
      [table],
    );
    if (!hasTenantColumn.rows[0]?.ok) continue;

    const result = await client.query(`SELECT COUNT(*)::int AS c FROM ${table} WHERE tenant_id = $1`, [TENANT_ID]);
    const count = Number(result.rows[0]?.c || 0);
    if (count !== 0) {
      await client.end();
      throw new Error(`table ${table} still has ${count} rows for tenant ${TENANT_ID}`);
    }
  }

  const tenantRow = await client.query("SELECT id FROM tenants WHERE id = $1", [TENANT_ID]);
  if (tenantRow.rowCount !== 0) {
    await client.end();
    throw new Error(`tenant ${TENANT_ID} still exists`);
  }

  await client.end();
}

async function verifyLoginRevoked() {
  const meRes = await fetch(`${APP_URL}/api/me`, {
    method: "GET",
    headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
  });

  if (meRes.status !== 401) {
    const payload = await meRes.text();
    throw new Error(`expected /api/me to return 401 after delete, got ${meRes.status}: ${payload}`);
  }
}

async function run() {
  await createDummyData();

  const deleteRes = await fetch(`${APP_URL}/api/tenant`, {
    method: "DELETE",
    headers: authHeaders,
    body: JSON.stringify({ confirm: "ELIMINAR MI EMPRESA", password: ACCOUNT_PASSWORD }),
  });

  const deleteJson = await deleteRes.json().catch(() => ({}));
  if (!deleteRes.ok) {
    throw new Error(`DELETE /api/tenant failed (${deleteRes.status}): ${JSON.stringify(deleteJson)}`);
  }

  await verifyDatabaseCleanup();
  await verifyLoginRevoked();

  console.log("tenant-delete-check: OK");
}

run().catch((err) => {
  console.error("tenant-delete-check FAIL", err.message);
  process.exit(1);
});
