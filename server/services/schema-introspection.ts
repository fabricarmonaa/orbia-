import { pool } from "../db";

export type CustomersSchemaInfo = {
  hasIsActive: boolean;
  hasDeletedAt: boolean;
};

let customersInfoCache: CustomersSchemaInfo | null = null;

export async function getCustomersSchemaInfo(): Promise<CustomersSchemaInfo> {
  if (customersInfoCache) return customersInfoCache;

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
}
