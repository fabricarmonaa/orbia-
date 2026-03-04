-- ETAPA 11: moldeabilidad real

CREATE TABLE IF NOT EXISTS sale_field_definitions (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  field_key varchar(80) NOT NULL,
  label varchar(160) NOT NULL,
  field_type varchar(20) NOT NULL,
  required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  visible_in_ticket boolean NOT NULL DEFAULT true,
  visible_in_internal boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sale_field_definitions_tenant_key ON sale_field_definitions(tenant_id, field_key);
CREATE INDEX IF NOT EXISTS idx_sale_field_definitions_tenant ON sale_field_definitions(tenant_id, sort_order, id);

CREATE TABLE IF NOT EXISTS sale_field_values (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sale_id integer NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  field_definition_id integer NOT NULL REFERENCES sale_field_definitions(id) ON DELETE CASCADE,
  value_text text,
  value_number numeric(14,4),
  value_bool boolean,
  value_date date,
  value_json jsonb,
  value_money_amount numeric(14,2),
  value_money_direction integer,
  currency varchar(3),
  file_storage_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sale_field_values_sale_field ON sale_field_values(tenant_id, sale_id, field_definition_id);
CREATE INDEX IF NOT EXISTS idx_sale_field_values_tenant_sale ON sale_field_values(tenant_id, sale_id);

CREATE TABLE IF NOT EXISTS entity_visibility_settings (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type varchar(20) NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_entity_visibility_settings_tenant_entity ON entity_visibility_settings(tenant_id, entity_type);

-- saneamiento idempotente option_list_items/list_id por tenant source-of-truth
ALTER TABLE option_list_items ADD COLUMN IF NOT EXISTS tenant_id integer;
UPDATE option_list_items oli
SET tenant_id = ol.tenant_id
FROM option_lists ol
WHERE ol.id = oli.list_id
  AND (oli.tenant_id IS NULL OR oli.tenant_id <> ol.tenant_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'option_list_items_tenant_id_tenants_id_fk'
  ) THEN
    ALTER TABLE option_list_items
      ADD CONSTRAINT option_list_items_tenant_id_tenants_id_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_option_list_items_tenant ON option_list_items(tenant_id, list_id);
