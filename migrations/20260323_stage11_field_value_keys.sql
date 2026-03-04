-- ETAPA 11.4 cierre fino
-- Canonical key persistence en field_values para idempotencia por entidad+field_key.

ALTER TABLE order_field_values ADD COLUMN IF NOT EXISTS field_key varchar(80);
ALTER TABLE sale_field_values ADD COLUMN IF NOT EXISTS field_key varchar(80);
ALTER TABLE product_field_values ADD COLUMN IF NOT EXISTS field_key varchar(80);

UPDATE order_field_values ofv
SET field_key = ofd.field_key
FROM order_field_definitions ofd
WHERE ofd.id = ofv.field_definition_id
  AND ofd.tenant_id = ofv.tenant_id
  AND (ofv.field_key IS NULL OR ofv.field_key <> ofd.field_key);

UPDATE sale_field_values sfv
SET field_key = sfd.field_key
FROM sale_field_definitions sfd
WHERE sfd.id = sfv.field_definition_id
  AND sfd.tenant_id = sfv.tenant_id
  AND (sfv.field_key IS NULL OR sfv.field_key <> sfd.field_key);

UPDATE product_field_values pfv
SET field_key = pfd.field_key
FROM product_field_definitions pfd
WHERE pfd.id = pfv.field_definition_id
  AND pfd.tenant_id = pfv.tenant_id
  AND (pfv.field_key IS NULL OR pfv.field_key <> pfd.field_key);

CREATE UNIQUE INDEX IF NOT EXISTS uq_order_field_values_tenant_order_field_key
  ON order_field_values(tenant_id, order_id, field_key)
  WHERE field_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sale_field_values_tenant_sale_field_key
  ON sale_field_values(tenant_id, sale_id, field_key)
  WHERE field_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_field_values_tenant_product_field_key
  ON product_field_values(tenant_id, product_id, field_key)
  WHERE field_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_field_values_tenant_order_field_key
  ON order_field_values(tenant_id, order_id, field_key);

CREATE INDEX IF NOT EXISTS idx_sale_field_values_tenant_sale_field_key
  ON sale_field_values(tenant_id, sale_id, field_key);

CREATE INDEX IF NOT EXISTS idx_product_field_values_tenant_product_field_key
  ON product_field_values(tenant_id, product_id, field_key);
