import { strict as assert } from "assert";

async function run() {
  if (!process.env.DATABASE_URL) {
    console.log("Delete tenant checks skipped: DATABASE_URL not set");
    return;
  }

  const { pool } = await import("../server/db");
  const { deleteTenantAtomic } = await import("../server/services/tenant-account");

  const tenantCode = `chk_${Date.now()}`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const t = await client.query("insert into tenants (code,name,slug,is_active,is_blocked) values ($1,$2,$3,true,false) returning id", [tenantCode, "Check Tenant", tenantCode]);
    const tenantId = t.rows[0].id as number;
    await client.query("insert into users (tenant_id,email,password,full_name,role,is_active,is_super_admin) values ($1,$2,$3,$4,'admin',true,false)", [tenantId, `${tenantCode}@demo.com`, "$2b$10$abcdefghijklmnopqrstuv", "Admin Check"]);
    await client.query("insert into products (tenant_id,name,price,is_active) values ($1,'Prod',10,true)", [tenantId]);
    await client.query("insert into customers (tenant_id,name) values ($1,'Cliente')", [tenantId]);
    await client.query("insert into cashiers (tenant_id,name,pin_hash,active) values ($1,'Caja','hash',true)", [tenantId]);
    await client.query("insert into sales (tenant_id,sale_number,sale_datetime,currency,subtotal_amount,discount_type,discount_value,discount_amount,surcharge_type,surcharge_value,surcharge_amount,total_amount,payment_method) values ($1,'V-000001',now(),'ARS',10,'NONE',0,0,'NONE',0,0,10,'EFECTIVO')", [tenantId]);
    await client.query("insert into purchases (tenant_id,currency,total_amount) values ($1,'ARS',10)", [tenantId]);
    await client.query("insert into tenant_branding (tenant_id,display_name) values ($1,'Brand')", [tenantId]);
    await client.query("COMMIT");

    const counts = await deleteTenantAtomic(tenantId);
    assert.equal(counts.tenants, 1);
    const still = await pool.query("select count(*)::int as c from tenants where id=$1", [tenantId]);
    assert.equal(still.rows[0].c, 0);

    console.log("Delete tenant checks passed");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
