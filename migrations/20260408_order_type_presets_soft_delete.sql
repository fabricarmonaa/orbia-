ALTER TABLE order_type_presets
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_order_type_presets_active
  ON order_type_presets(tenant_id, order_type_id, sort_order, id)
  WHERE deleted_at IS NULL;
