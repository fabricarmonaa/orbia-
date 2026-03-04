ALTER TABLE tenant_config
  ADD COLUMN IF NOT EXISTS tracking_settings jsonb NOT NULL DEFAULT '{}'::jsonb;
