import { pool } from "../db";

export type CustomersSchemaInfo = {
  hasIsActive: boolean;
  hasDeletedAt: boolean;
};

let customersInfoCache: CustomersSchemaInfo | null = null;

export async function getCustomersSchemaInfo(): Promise<CustomersSchemaInfo> {
  if (customersInfoCache) return customersInfoCache;

  try {
    const result = await pool.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'customers'
      `
    );

    const cols = new Set((result.rows || []).map((r: any) => String(r.column_name || "").toLowerCase()));
    customersInfoCache = {
      hasIsActive: cols.has("is_active"),
      hasDeletedAt: cols.has("deleted_at"),
    };
    return customersInfoCache;
  } catch (err: any) {
    // 42P01 = relation does not exist (table not yet migrated)
    if (err?.code === "42P01" || /relation .* does not exist/i.test(String(err?.message || ""))) {
      console.warn("[schema-introspection] customers table not found – returning safe defaults (run migrations)");
      // Do NOT cache so the next request retries once the table exists
      return { hasIsActive: false, hasDeletedAt: false };
    }
    console.error("[schema-introspection] Failed to introspect customers schema:", {
      code: err?.code,
      message: err?.message,
    });
    // Return safe defaults rather than crashing the endpoint
    return { hasIsActive: false, hasDeletedAt: false };
  }
}

