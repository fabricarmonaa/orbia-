ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS sale_id INTEGER REFERENCES sales(id),
  ADD COLUMN IF NOT EXISTS sale_public_token VARCHAR(120);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_sale_id ON orders(tenant_id, sale_id);
