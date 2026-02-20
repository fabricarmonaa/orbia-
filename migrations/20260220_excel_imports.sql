CREATE TABLE IF NOT EXISTS customers (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id),
  name varchar(200) NOT NULL,
  phone varchar(50),
  email varchar(255),
  doc varchar(50),
  address text,
  notes text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers (tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_doc ON customers (tenant_id, doc);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_email ON customers (tenant_id, email);

CREATE TABLE IF NOT EXISTS purchases (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id),
  branch_id integer REFERENCES branches(id),
  provider_id integer,
  provider_name varchar(200),
  purchase_date timestamp NOT NULL DEFAULT now(),
  currency varchar(10) NOT NULL DEFAULT 'ARS',
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  imported_by_user_id integer REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_purchases_tenant ON purchases (tenant_id);

CREATE TABLE IF NOT EXISTS purchase_items (
  id serial PRIMARY KEY,
  purchase_id integer NOT NULL REFERENCES purchases(id),
  tenant_id integer NOT NULL REFERENCES tenants(id),
  branch_id integer REFERENCES branches(id),
  product_id integer NOT NULL REFERENCES products(id),
  product_code_snapshot varchar(120),
  product_name_snapshot varchar(200) NOT NULL,
  quantity numeric(12,3) NOT NULL,
  unit_price numeric(12,2) NOT NULL,
  line_total numeric(12,2) NOT NULL,
  currency varchar(10) NOT NULL DEFAULT 'ARS',
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items (purchase_id);

CREATE TABLE IF NOT EXISTS import_jobs (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id),
  entity varchar(30) NOT NULL,
  file_name varchar(255),
  processed_rows integer NOT NULL DEFAULT 0,
  success_rows integer NOT NULL DEFAULT 0,
  error_rows integer NOT NULL DEFAULT 0,
  created_by_user_id integer REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_import_jobs_tenant ON import_jobs (tenant_id);
