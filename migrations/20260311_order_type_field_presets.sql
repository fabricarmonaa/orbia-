-- Per-tenant order type presets and custom fields

CREATE TABLE IF NOT EXISTS order_type_definitions (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id),
  code varchar(50) NOT NULL,
  label varchar(120) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT uq_order_type_definitions_tenant_code UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_order_type_definitions_tenant
  ON order_type_definitions (tenant_id);

CREATE TABLE IF NOT EXISTS order_field_definitions (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id),
  order_type_id integer NOT NULL REFERENCES order_type_definitions(id) ON DELETE CASCADE,
  field_key varchar(80) NOT NULL,
  label varchar(160) NOT NULL,
  field_type varchar(20) NOT NULL,
  required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT uq_order_field_definitions_type_key UNIQUE (order_type_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_order_field_definitions_tenant_type
  ON order_field_definitions (tenant_id, order_type_id);

CREATE TABLE IF NOT EXISTS order_field_values (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id),
  order_id integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  field_definition_id integer NOT NULL REFERENCES order_field_definitions(id) ON DELETE CASCADE,
  value_text text,
  value_number numeric(14,4),
  file_storage_key text,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT uq_order_field_values_order_field UNIQUE (order_id, field_definition_id)
);

CREATE INDEX IF NOT EXISTS idx_order_field_values_tenant_order
  ON order_field_values (tenant_id, order_id);

-- Normalize legacy values before enforcing field_type constraint.
UPDATE order_field_definitions
SET field_type = CASE
  WHEN field_type IS NULL OR btrim(field_type) = '' THEN 'TEXT'
  WHEN upper(btrim(field_type)) IN ('BOOL', 'BOOLEAN', 'CHECK', 'CHECKBOX') THEN 'CHECKBOX'
  WHEN upper(btrim(field_type)) IN ('INT', 'INTEGER', 'DECIMAL', 'FLOAT', 'DOUBLE', 'NUMERIC', 'NUMBER') THEN 'NUMBER'
  WHEN upper(btrim(field_type)) IN ('TEXTLONG', 'LONG_TEXT', 'TEXT_LONG') THEN 'TEXT_LONG'
  WHEN upper(btrim(field_type)) IN ('DATETIME', 'DATE_TIME') THEN 'DATETIME'
  WHEN upper(btrim(field_type)) IN ('TEXT', 'TEXT_LONG', 'NUMBER', 'FILE', 'CHECKBOX', 'SELECT', 'DATE', 'TIME') THEN upper(btrim(field_type))
  ELSE 'TEXT'
END;

-- Ensure the check constraint is aligned with supported types.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_order_field_definitions_field_type'
      AND conrelid = 'order_field_definitions'::regclass
  ) THEN
    ALTER TABLE order_field_definitions
      DROP CONSTRAINT ck_order_field_definitions_field_type;
  END IF;

  ALTER TABLE order_field_definitions
    ADD CONSTRAINT ck_order_field_definitions_field_type
    CHECK (field_type IN ('TEXT', 'TEXT_LONG', 'NUMBER', 'FILE', 'CHECKBOX', 'SELECT', 'DATE', 'TIME', 'DATETIME'));
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_order_field_definitions_file_mime_config'
      AND conrelid = 'order_field_definitions'::regclass
  ) THEN
    ALTER TABLE order_field_definitions
      ADD CONSTRAINT ck_order_field_definitions_file_mime_config
      CHECK (
        field_type <> 'FILE'
        OR NOT (config ? 'allowedMime')
        OR jsonb_typeof(config->'allowedMime') = 'array'
      );
  END IF;
END $$;
