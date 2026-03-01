import fs from "fs";
import path from "path";
import { pool } from "../db";

type PgErrorLike = Error & {
  code?: string;
  detail?: string;
  constraint?: string;
  table?: string;
};

type DeleteTenantResult = {
  deletedCounts: Record<string, number>;
  tenantTables: string[];
};

async function tableExists(client: any, table: string) {
  const res = await client.query(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name=$1
    ) AS ok`,
    [table],
  );
  return Boolean(res.rows[0]?.ok);
}

async function getTenantCode(client: any, tenantId: number) {
  const res = await client.query("SELECT code FROM tenants WHERE id = $1", [tenantId]);
  return String(res.rows[0]?.code || "").trim();
}

async function discoverTenantTables(client: any): Promise<string[]> {
  const res = await client.query(
    `SELECT table_name
     FROM information_schema.columns
     WHERE table_schema='public' AND column_name='tenant_id'
     GROUP BY table_name`,
  );
  return res.rows.map((r: any) => String(r.table_name));
}

async function discoverFkEdges(client: any) {
  const res = await client.query(
    `SELECT
       tc.table_name AS child_table,
       ccu.table_name AS parent_table
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND tc.table_schema = 'public'`,
  );
  return res.rows.map((r: any) => ({ child: String(r.child_table), parent: String(r.parent_table) }));
}

function buildDeleteOrder(tenantTables: string[], edges: Array<{ child: string; parent: string }>) {
  const set = new Set(tenantTables);
  const indegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const table of tenantTables) {
    indegree.set(table, 0);
    adj.set(table, []);
  }

  for (const { child, parent } of edges) {
    if (!set.has(child) || !set.has(parent)) continue;
    adj.get(child)!.push(parent);
    indegree.set(parent, (indegree.get(parent) || 0) + 1);
  }

  const queue = tenantTables.filter((t) => (indegree.get(t) || 0) === 0);
  const ordered: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    ordered.push(current);
    for (const next of adj.get(current) || []) {
      const value = (indegree.get(next) || 0) - 1;
      indegree.set(next, value);
      if (value === 0) queue.push(next);
    }
  }

  if (ordered.length !== tenantTables.length) {
    const missing = tenantTables.filter((t) => !ordered.includes(t)).sort();
    ordered.push(...missing);
  }

  return ordered;
}

async function deleteByTenantId(client: any, table: string, tenantId: number) {
  const countRes = await client.query(`SELECT COUNT(*)::int AS c FROM ${table} WHERE tenant_id = $1`, [tenantId]);
  const count = Number(countRes.rows[0]?.c || 0);
  await client.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [tenantId]);
  return count;
}

async function cleanupTenantFiles(tenantId: number, tenantCode: string, requestId?: string | null) {
  const candidates = [
    path.join(process.cwd(), "storage", "tenants", tenantCode),
    path.join(process.cwd(), "uploads", "tenants", tenantCode),
    path.join(process.cwd(), "uploads", String(tenantId)),
  ].filter(Boolean);

  for (const target of candidates) {
    try {
      fs.rmSync(target, { recursive: true, force: true });
    } catch (err: any) {
      console.warn("[TENANT DELETE FILE WARNING]", {
        requestId: requestId || null,
        tenantId,
        target,
        message: err?.message,
      });
    }
  }
}

export async function deleteTenantPermanent(tenantId: number, actorUserId: number, requestId?: string | null): Promise<DeleteTenantResult> {
  const client = await pool.connect();
  const deletedCounts: Record<string, number> = {};
  let tenantCode = "";
  try {
    await client.query("BEGIN");

    tenantCode = await getTenantCode(client, tenantId);

    if (await tableExists(client, "session")) {
      const sessionDelete = await client.query(
        "DELETE FROM session WHERE sess::text ILIKE $1",
        [`%\"tenantId\":${tenantId}%`],
      );
      deletedCounts.session = Number(sessionDelete.rowCount || 0);
    }

    const tenantTables = await discoverTenantTables(client);
    const edges = await discoverFkEdges(client);
    const orderedTenantTables = buildDeleteOrder(tenantTables, edges)
      .filter((table) => table !== "tenants")
      .filter((table) => table !== "session");

    for (const table of orderedTenantTables) {
      deletedCounts[table] = await deleteByTenantId(client, table, tenantId);
    }

    const tenantDelete = await client.query("DELETE FROM tenants WHERE id = $1", [tenantId]);
    deletedCounts.tenants = Number(tenantDelete.rowCount || 0);

    await client.query("COMMIT");

    await cleanupTenantFiles(tenantId, tenantCode, requestId);

    return { deletedCounts, tenantTables };
  } catch (error) {
    await client.query("ROLLBACK");
    const err = error as PgErrorLike;
    console.error("[TENANT DELETE ERROR]", {
      requestId: requestId || null,
      tenantId,
      actorUserId,
      message: err.message,
      code: err.code,
      detail: err.detail,
      constraint: err.constraint,
      table: err.table,
    });
    throw error;
  } finally {
    client.release();
  }
}
