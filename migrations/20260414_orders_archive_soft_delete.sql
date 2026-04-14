ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS archived_at timestamp,
  ADD COLUMN IF NOT EXISTS deleted_at timestamp;

CREATE INDEX IF NOT EXISTS idx_orders_tenant_archived_deleted
  ON orders (tenant_id, archived_at, deleted_at);
