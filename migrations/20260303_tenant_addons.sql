CREATE TABLE IF NOT EXISTS tenant_addons (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  addon_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  enabled_by_id INTEGER,
  enabled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tenant_addons
  ADD COLUMN IF NOT EXISTS addon_key TEXT,
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN,
  ADD COLUMN IF NOT EXISTS enabled_by_id INTEGER,
  ADD COLUMN IF NOT EXISTS enabled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE tenant_addons SET enabled = false WHERE enabled IS NULL;
UPDATE tenant_addons SET updated_at = now() WHERE updated_at IS NULL;

ALTER TABLE tenant_addons
  ALTER COLUMN addon_key SET NOT NULL,
  ALTER COLUMN enabled SET NOT NULL,
  ALTER COLUMN enabled SET DEFAULT false,
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_addons_key ON tenant_addons(tenant_id, addon_key);
CREATE INDEX IF NOT EXISTS idx_tenant_addons_tenant_enabled ON tenant_addons(tenant_id, enabled);
