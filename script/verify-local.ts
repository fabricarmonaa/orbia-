import { Client } from "pg";

async function queryOne(client: Client, sql: string) {
  const res = await client.query(sql);
  return res.rows[0];
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const appUrl = process.env.APP_URL || "http://127.0.0.1:5000";
  if (!databaseUrl) throw new Error("DATABASE_URL must be set");

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  await client.query("SELECT 1");
  console.log("verify: DB SELECT 1 OK");

  const tables = await client.query(`
    SELECT tablename FROM pg_tables
    WHERE schemaname='public' AND tablename IN ('users','tenants','plans','tenant_addons','message_templates')
    ORDER BY tablename
  `);
  console.log("verify: tables", tables.rows.map((r) => r.tablename).join(", "));

  const superadmin = await queryOne(client, "SELECT email FROM users WHERE is_super_admin=true LIMIT 1");
  if (!superadmin?.email) throw new Error("No superadmin found");
  console.log(`verify: superadmin OK (${superadmin.email})`);

  await client.end();

  const health = await fetch(`${appUrl}/health`);
  if (!health.ok) throw new Error(`/health failed with ${health.status}`);
  const body = await health.json();
  console.log("verify: /health OK", body);

  console.log("verify:local OK");
}

main().catch((err) => {
  console.error("verify:local FAIL", err?.message || err);
  process.exit(1);
});
