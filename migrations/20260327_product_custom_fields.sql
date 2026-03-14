-- Product custom fields (multi-tenant)
CREATE TABLE IF NOT EXISTS product_custom_field_definitions (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  field_key VARCHAR(80) NOT NULL,
  label VARCHAR(160) NOT NULL,
  field_type VARCHAR(20) NOT NULL,
  required BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_filterable BOOLEAN NOT NULL DEFAULT FALSE,
  filter_type VARCHAR(40) DEFAULT 'EXACT',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_prod_cf_def_tenant_key UNIQUE (tenant_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_prod_cf_def_tenant ON product_custom_field_definitions(tenant_id);

CREATE TABLE IF NOT EXISTS product_custom_field_values (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  field_definition_id INTEGER NOT NULL REFERENCES product_custom_field_definitions(id) ON DELETE CASCADE,
  value_text TEXT,
  value_number NUMERIC(16,4),
  value_boolean BOOLEAN,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_prod_cf_vals_prod_def UNIQUE (product_id, field_definition_id)
);

CREATE INDEX IF NOT EXISTS idx_prod_cf_vals_tenant_prod ON product_custom_field_values(tenant_id, product_id);
