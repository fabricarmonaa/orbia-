-- ETAPA 7: aprobación de cajeros + listas desplegables reutilizables

ALTER TABLE cashiers ADD COLUMN IF NOT EXISTS is_approved boolean NOT NULL DEFAULT false;
ALTER TABLE cashiers ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE cashiers ADD COLUMN IF NOT EXISTS approved_by_user_id integer;
ALTER TABLE cashiers ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cashiers_approved_by_user_id_fkey'
  ) THEN
    ALTER TABLE cashiers
      ADD CONSTRAINT cashiers_approved_by_user_id_fkey
      FOREIGN KEY (approved_by_user_id) REFERENCES users(id);
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

CREATE TABLE IF NOT EXISTS option_lists (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id),
  key varchar(80) NOT NULL,
  name varchar(120) NOT NULL,
  entity_scope varchar(30),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_option_lists_tenant_key ON option_lists(tenant_id, key);
CREATE INDEX IF NOT EXISTS idx_option_lists_tenant ON option_lists(tenant_id);

CREATE TABLE IF NOT EXISTS option_list_items (
  id serial PRIMARY KEY,
  list_id integer NOT NULL REFERENCES option_lists(id),
  value varchar(120) NOT NULL,
  label varchar(120) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_option_list_items_list_value ON option_list_items(list_id, value);
CREATE INDEX IF NOT EXISTS idx_option_list_items_list ON option_list_items(list_id);
