ALTER TABLE order_field_definitions
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

UPDATE order_field_definitions
SET config = COALESCE(config, '{}'::jsonb)
WHERE config IS NULL;
