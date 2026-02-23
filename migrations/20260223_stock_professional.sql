CREATE TABLE IF NOT EXISTS stock_levels (
  id SERIAL PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id),
  product_id integer NOT NULL REFERENCES products(id),
  branch_id integer REFERENCES branches(id),
  quantity numeric(14,3) NOT NULL DEFAULT 0,
  average_cost numeric(14,4) DEFAULT 0,
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_levels_tenant_product_branch
ON stock_levels (tenant_id, product_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_stock_levels_tenant_branch ON stock_levels (tenant_id, branch_id);

ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS movement_type varchar(30) NOT NULL DEFAULT 'ADJUSTMENT_IN',
  ADD COLUMN IF NOT EXISTS reference_id integer,
  ADD COLUMN IF NOT EXISTS unit_cost numeric(14,4),
  ADD COLUMN IF NOT EXISTS total_cost numeric(14,2),
  ADD COLUMN IF NOT EXISTS note varchar(250),
  ADD COLUMN IF NOT EXISTS created_by_user_id integer REFERENCES users(id);

ALTER TABLE stock_movements
  ALTER COLUMN quantity TYPE numeric(14,3) USING quantity::numeric;

CREATE INDEX IF NOT EXISTS idx_stock_movements_kardex ON stock_movements(tenant_id, product_id, branch_id, created_at);

CREATE TABLE IF NOT EXISTS stock_transfers (
  id SERIAL PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id),
  from_branch_id integer REFERENCES branches(id),
  to_branch_id integer REFERENCES branches(id),
  status varchar(20) NOT NULL DEFAULT 'PENDING',
  created_by integer REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now(),
  completed_at timestamp
);

CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id SERIAL PRIMARY KEY,
  transfer_id integer NOT NULL REFERENCES stock_transfers(id),
  product_id integer NOT NULL REFERENCES products(id),
  quantity numeric(14,3) NOT NULL
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock numeric(12,3) NOT NULL DEFAULT 0;

INSERT INTO stock_levels (tenant_id, product_id, branch_id, quantity, average_cost, updated_at)
SELECT p.tenant_id, p.id, NULL, COALESCE(p.stock, 0)::numeric, 0, now()
FROM products p
ON CONFLICT (tenant_id, product_id, branch_id) DO NOTHING;

INSERT INTO stock_levels (tenant_id, product_id, branch_id, quantity, average_cost, updated_at)
SELECT ps.tenant_id, ps.product_id, ps.branch_id, ps.stock::numeric, 0, now()
FROM product_stock_by_branch ps
ON CONFLICT (tenant_id, product_id, branch_id) DO NOTHING;
