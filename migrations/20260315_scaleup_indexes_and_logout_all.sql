-- Scale-up readiness: multi-tenant hot path indexes + logout-all token invalidation support

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS token_invalid_before TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_orders_tenant_created
  ON orders (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_tenant_created
  ON sales (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customers_tenant_created
  ON customers (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_tenant_active
  ON products (tenant_id, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant_created
  ON stock_movements (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_status_history_tenant_created
  ON order_status_history (tenant_id, created_at DESC);
