CREATE TABLE IF NOT EXISTS tenant_counters (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id),
  key varchar(50) NOT NULL,
  value integer NOT NULL DEFAULT 0,
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_counters_key UNIQUE (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS sales (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id),
  branch_id integer REFERENCES branches(id),
  cashier_user_id integer REFERENCES users(id),
  sale_number varchar(30) NOT NULL,
  sale_datetime timestamp NOT NULL DEFAULT now(),
  currency varchar(10) NOT NULL DEFAULT 'ARS',
  subtotal_amount numeric(12,2) NOT NULL,
  discount_type varchar(20) NOT NULL DEFAULT 'NONE',
  discount_value numeric(12,2) NOT NULL DEFAULT 0,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  surcharge_type varchar(20) NOT NULL DEFAULT 'NONE',
  surcharge_value numeric(12,2) NOT NULL DEFAULT 0,
  surcharge_amount numeric(12,2) NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL,
  payment_method varchar(30) NOT NULL,
  notes text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT uq_sales_tenant_number UNIQUE (tenant_id, sale_number)
);

CREATE INDEX IF NOT EXISTS idx_sales_tenant ON sales (tenant_id);
CREATE INDEX IF NOT EXISTS idx_sales_tenant_branch_date ON sales (tenant_id, branch_id, sale_datetime DESC);

CREATE TABLE IF NOT EXISTS sale_items (
  id serial PRIMARY KEY,
  sale_id integer NOT NULL REFERENCES sales(id),
  tenant_id integer NOT NULL REFERENCES tenants(id),
  branch_id integer REFERENCES branches(id),
  product_id integer NOT NULL REFERENCES products(id),
  product_name_snapshot varchar(200) NOT NULL,
  sku_snapshot varchar(100),
  quantity integer NOT NULL,
  unit_price numeric(12,2) NOT NULL,
  line_total numeric(12,2) NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items (sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_tenant_product ON sale_items (tenant_id, product_id);

ALTER TABLE cash_movements ADD COLUMN IF NOT EXISTS sale_id integer REFERENCES sales(id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_sale ON cash_movements (sale_id);
