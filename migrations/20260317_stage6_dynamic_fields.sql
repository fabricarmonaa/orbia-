-- ETAPA 6: campos dinámicos pedidos/productos + impacto dinero en caja + fix constraint inválido

ALTER TABLE order_type_presets
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_order_type_presets_default
  ON order_type_presets (tenant_id, order_type_id)
  WHERE is_default = true;

ALTER TABLE order_field_definitions
  ADD COLUMN IF NOT EXISTS tracking_label varchar(160);

ALTER TABLE order_field_values
  ADD COLUMN IF NOT EXISTS value_bool boolean,
  ADD COLUMN IF NOT EXISTS value_date date,
  ADD COLUMN IF NOT EXISTS value_json jsonb,
  ADD COLUMN IF NOT EXISTS value_money_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS value_money_direction smallint,
  ADD COLUMN IF NOT EXISTS currency char(3),
  ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS product_field_definitions (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id),
  field_key varchar(80) NOT NULL,
  label varchar(160) NOT NULL,
  field_type varchar(20) NOT NULL,
  required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_field_definitions_tenant_key
  ON product_field_definitions (tenant_id, field_key);

CREATE INDEX IF NOT EXISTS idx_product_field_definitions_tenant
  ON product_field_definitions (tenant_id, sort_order, id);

CREATE TABLE IF NOT EXISTS product_field_values (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id),
  product_id integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  field_definition_id integer NOT NULL REFERENCES product_field_definitions(id) ON DELETE CASCADE,
  value_text text,
  value_number numeric(14,4),
  value_bool boolean,
  value_date date,
  value_json jsonb,
  value_money_amount numeric(14,2),
  value_money_direction smallint,
  currency char(3),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT uq_product_field_values_product_field UNIQUE (tenant_id, product_id, field_definition_id)
);

CREATE INDEX IF NOT EXISTS idx_product_field_values_tenant_product
  ON product_field_values (tenant_id, product_id);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivered_cash_movement_id integer;

CREATE INDEX IF NOT EXISTS idx_orders_tenant_delivered_cash
  ON orders (tenant_id, delivered_cash_movement_id);
