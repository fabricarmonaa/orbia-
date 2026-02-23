ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_customers_tenant_active_created
  ON customers(tenant_id, is_active, created_at DESC);
