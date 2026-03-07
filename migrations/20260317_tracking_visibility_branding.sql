-- Tracking público full configurable por branding

ALTER TABLE tenant_branding
  ADD COLUMN IF NOT EXISTS tracking_config_json JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE tenant_branding
SET tracking_config_json = COALESCE(tracking_config_json, '{}'::jsonb)
WHERE tracking_config_json IS NULL;
