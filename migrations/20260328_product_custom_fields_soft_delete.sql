-- Soft-delete support for product custom field definitions
-- Archived fields: hidden from UI but values preserved
ALTER TABLE product_custom_field_definitions
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_prod_cf_def_archived
  ON product_custom_field_definitions(tenant_id, archived_at);
