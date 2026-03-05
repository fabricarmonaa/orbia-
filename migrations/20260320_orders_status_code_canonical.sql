-- Canonical ORDER statuses on orders.status_code
ALTER TABLE orders ADD COLUMN IF NOT EXISTS status_code varchar(40);

-- Ensure each tenant has baseline ORDER statuses
INSERT INTO status_definitions (tenant_id, entity_type, code, label, color, sort_order, is_default, is_final, is_active, is_locked)
SELECT t.id, 'ORDER', s.code, s.label, s.color, s.sort_order, s.is_default, s.is_final, true, false
FROM tenants t
CROSS JOIN (
  VALUES
    ('PENDIENTE', 'Pendiente', '#f59e0b', 1, true, false),
    ('EN_PROCESO', 'En proceso', '#3b82f6', 2, false, false),
    ('LISTO', 'Listo', '#10b981', 3, false, false),
    ('ENTREGADO', 'Entregado', '#6b7280', 4, false, true)
) AS s(code, label, color, sort_order, is_default, is_final)
WHERE NOT EXISTS (
  SELECT 1
  FROM status_definitions sd
  WHERE sd.tenant_id = t.id
    AND sd.entity_type = 'ORDER'
)
ON CONFLICT DO NOTHING;

-- Ensure there is one default ORDER status per tenant
WITH first_active AS (
  SELECT DISTINCT ON (sd.tenant_id)
    sd.tenant_id,
    sd.id
  FROM status_definitions sd
  WHERE sd.entity_type = 'ORDER'
    AND COALESCE(sd.is_active, true) = true
  ORDER BY sd.tenant_id, sd.sort_order ASC, sd.id ASC
)
UPDATE status_definitions sd
SET is_default = true,
    updated_at = NOW()
FROM first_active fa
WHERE sd.id = fa.id
  AND NOT EXISTS (
    SELECT 1
    FROM status_definitions existing
    WHERE existing.tenant_id = fa.tenant_id
      AND existing.entity_type = 'ORDER'
      AND COALESCE(existing.is_active, true) = true
      AND COALESCE(existing.is_default, false) = true
  );

-- Backfill from legacy orders.status_id -> canonical status_definitions.code
UPDATE orders o
SET status_code = sd.code,
    updated_at = NOW()
FROM order_statuses os
JOIN status_definitions sd
  ON sd.tenant_id = o.tenant_id
 AND sd.entity_type = 'ORDER'
 AND sd.code = LEFT(REGEXP_REPLACE(UPPER(COALESCE(os.name, '')), '[^A-Z0-9]+', '_', 'g'), 40)
WHERE o.status_id = os.id
  AND o.tenant_id = os.tenant_id
  AND (o.status_code IS NULL OR btrim(o.status_code) = '');

-- Normalize existing status_code values
UPDATE orders
SET status_code = LEFT(REGEXP_REPLACE(UPPER(COALESCE(status_code, '')), '[^A-Z0-9]+', '_', 'g'), 40),
    updated_at = NOW()
WHERE status_code IS NOT NULL
  AND status_code <> LEFT(REGEXP_REPLACE(UPPER(COALESCE(status_code, '')), '[^A-Z0-9]+', '_', 'g'), 40);

-- Fill null / invalid status_code with tenant default ORDER status
WITH tenant_default AS (
  SELECT DISTINCT ON (sd.tenant_id)
    sd.tenant_id,
    sd.code
  FROM status_definitions sd
  WHERE sd.entity_type = 'ORDER'
    AND COALESCE(sd.is_active, true) = true
  ORDER BY sd.tenant_id,
    CASE WHEN COALESCE(sd.is_default, false) THEN 0 ELSE 1 END,
    sd.sort_order ASC,
    sd.id ASC
)
UPDATE orders o
SET status_code = td.code,
    updated_at = NOW()
FROM tenant_default td
LEFT JOIN status_definitions sd
  ON sd.tenant_id = o.tenant_id
 AND sd.entity_type = 'ORDER'
 AND sd.code = o.status_code
WHERE o.tenant_id = td.tenant_id
  AND (
    o.status_code IS NULL
    OR btrim(o.status_code) = ''
    OR sd.id IS NULL
  );

CREATE INDEX IF NOT EXISTS idx_orders_tenant_status_code_created
  ON orders(tenant_id, status_code, created_at DESC);
