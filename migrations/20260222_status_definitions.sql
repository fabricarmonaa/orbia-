CREATE TABLE IF NOT EXISTS status_definitions (
  id SERIAL PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id),
  entity_type varchar(20) NOT NULL,
  code varchar(40) NOT NULL,
  label varchar(60) NOT NULL,
  color varchar(20),
  sort_order integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  is_final boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  is_locked boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT uq_status_definitions_tenant_entity_code UNIQUE (tenant_id, entity_type, code)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_status_definitions_default_per_entity
  ON status_definitions(tenant_id, entity_type)
  WHERE is_default = true;

CREATE INDEX IF NOT EXISTS idx_status_definitions_tenant_entity
  ON status_definitions(tenant_id, entity_type, sort_order);

ALTER TABLE products ADD COLUMN IF NOT EXISTS status_code varchar(40);

WITH defaults AS (
  SELECT t.id AS tenant_id, d.entity_type, d.code, d.label, d.color, d.sort_order, d.is_default, d.is_final
  FROM tenants t
  CROSS JOIN (
    VALUES
      ('ORDER','PENDING','Pendiente','#6B7280',10,true,false),
      ('ORDER','IN_PROGRESS','En proceso','#3B82F6',20,false,false),
      ('ORDER','DELIVERED','Entregado','#22C55E',30,false,true),
      ('ORDER','CANCELLED','Cancelado','#EF4444',40,false,true),
      ('PRODUCT','ACTIVE','Activo','#22C55E',10,true,false),
      ('PRODUCT','INACTIVE','Inactivo','#9CA3AF',20,false,true),
      ('DELIVERY','PENDING','Pendiente','#6B7280',10,true,false),
      ('DELIVERY','ASSIGNED','Asignado','#3B82F6',20,false,false),
      ('DELIVERY','IN_TRANSIT','En tránsito','#F59E0B',30,false,false),
      ('DELIVERY','DELIVERED','Entregado','#22C55E',40,false,true),
      ('DELIVERY','CANCELLED','Cancelado','#EF4444',50,false,true)
  ) AS d(entity_type, code, label, color, sort_order, is_default, is_final)
)
INSERT INTO status_definitions (tenant_id, entity_type, code, label, color, sort_order, is_default, is_final, is_active)
SELECT tenant_id, entity_type, code, label, color, sort_order, is_default, is_final, true
FROM defaults
ON CONFLICT (tenant_id, entity_type, code) DO NOTHING;

INSERT INTO status_definitions (tenant_id, entity_type, code, label, color, sort_order, is_default, is_final, is_active)
SELECT
  os.tenant_id,
  'ORDER',
  LEFT(REGEXP_REPLACE(UPPER(COALESCE(os.name, 'ESTADO')), '[^A-Z0-9]+', '_', 'g'), 40),
  LEFT(COALESCE(os.name, 'Estado'), 60),
  os.color,
  COALESCE(os.sort_order, 999),
  false,
  COALESCE(os.is_final, false),
  true
FROM order_statuses os
ON CONFLICT (tenant_id, entity_type, code) DO NOTHING;

UPDATE products
SET status_code = CASE WHEN COALESCE(is_active, true) THEN 'ACTIVE' ELSE 'INACTIVE' END
WHERE status_code IS NULL;

INSERT INTO status_definitions (tenant_id, entity_type, code, label, color, sort_order, is_default, is_final, is_active)
SELECT DISTINCT
  p.tenant_id,
  'PRODUCT',
  LEFT(REGEXP_REPLACE(UPPER(COALESCE(p.status_code, 'ACTIVE')), '[^A-Z0-9]+', '_', 'g'), 40),
  LEFT(COALESCE(p.status_code, 'Activo'), 60),
  '#6B7280',
  999,
  false,
  false,
  true
FROM products p
WHERE p.status_code IS NOT NULL
ON CONFLICT (tenant_id, entity_type, code) DO NOTHING;
