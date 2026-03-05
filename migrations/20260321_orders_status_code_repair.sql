-- Repair migration for canonical ORDER status_code flow.
-- Idempotent and safe to run multiple times.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS status_code varchar(40);

-- 1) Ensure ORDER definitions exist for every tenant.
INSERT INTO status_definitions (
  tenant_id,
  entity_type,
  code,
  label,
  color,
  sort_order,
  is_default,
  is_final,
  is_active,
  is_locked
)
SELECT
  t.id,
  'ORDER',
  s.code,
  s.label,
  s.color,
  s.sort_order,
  s.is_default,
  s.is_final,
  true,
  false
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

-- 2) Guarantee exactly one default active ORDER status per tenant.
WITH ranked AS (
  SELECT
    sd.id,
    sd.tenant_id,
    ROW_NUMBER() OVER (
      PARTITION BY sd.tenant_id
      ORDER BY
        CASE WHEN COALESCE(sd.is_active, true) THEN 0 ELSE 1 END,
        CASE WHEN COALESCE(sd.is_default, false) THEN 0 ELSE 1 END,
        sd.sort_order ASC,
        sd.id ASC
    ) AS rn
  FROM status_definitions sd
  WHERE sd.entity_type = 'ORDER'
), chosen AS (
  SELECT tenant_id, id AS chosen_id
  FROM ranked
  WHERE rn = 1
)
UPDATE status_definitions sd
SET is_default = (sd.id = c.chosen_id),
    updated_at = NOW()
FROM chosen c
WHERE sd.tenant_id = c.tenant_id
  AND sd.entity_type = 'ORDER'
  AND COALESCE(sd.is_default, false) IS DISTINCT FROM (sd.id = c.chosen_id);

-- 3) Normalize status_code string shape in orders.
UPDATE orders o
SET status_code = LEFT(REGEXP_REPLACE(UPPER(COALESCE(o.status_code, '')), '[^A-Z0-9]+', '_', 'g'), 40),
    updated_at = NOW()
WHERE o.status_code IS NOT NULL
  AND o.status_code <> LEFT(REGEXP_REPLACE(UPPER(COALESCE(o.status_code, '')), '[^A-Z0-9]+', '_', 'g'), 40);

-- 4) Backfill status_code from legacy status_id (tenant-scoped).
WITH legacy_map AS (
  SELECT
    os.tenant_id,
    os.id AS legacy_status_id,
    LEFT(REGEXP_REPLACE(UPPER(COALESCE(os.name, '')), '[^A-Z0-9]+', '_', 'g'), 40) AS legacy_code
  FROM order_statuses os
), valid_map AS (
  SELECT
    lm.tenant_id,
    lm.legacy_status_id,
    sd.code AS canonical_code
  FROM legacy_map lm
  JOIN status_definitions sd
    ON sd.tenant_id = lm.tenant_id
   AND sd.entity_type = 'ORDER'
   AND sd.code = lm.legacy_code
)
UPDATE orders o
SET status_code = vm.canonical_code,
    updated_at = NOW()
FROM valid_map vm
WHERE o.tenant_id = vm.tenant_id
  AND o.status_id = vm.legacy_status_id
  AND (o.status_code IS NULL OR btrim(o.status_code) = '');

-- 5) For remaining null/empty/invalid codes, set tenant ORDER default.
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
WHERE o.tenant_id = td.tenant_id
  AND (
    o.status_code IS NULL
    OR btrim(o.status_code) = ''
    OR NOT EXISTS (
      SELECT 1
      FROM status_definitions sd
      WHERE sd.tenant_id = o.tenant_id
        AND sd.entity_type = 'ORDER'
        AND sd.code = o.status_code
    )
  );

CREATE INDEX IF NOT EXISTS idx_orders_tenant_status_code_created
  ON orders(tenant_id, status_code, created_at DESC);

-- Verification queries (read-only)
SELECT COUNT(*) AS orders_with_null_or_empty_status_code
FROM orders
WHERE status_code IS NULL OR btrim(status_code) = '';

SELECT
  o.tenant_id,
  COUNT(*) AS invalid_status_code_rows
FROM orders o
LEFT JOIN status_definitions sd
  ON sd.tenant_id = o.tenant_id
 AND sd.entity_type = 'ORDER'
 AND sd.code = o.status_code
WHERE sd.id IS NULL
GROUP BY o.tenant_id
ORDER BY o.tenant_id;

SELECT
  tenant_id,
  COUNT(*) FILTER (WHERE is_default = true) AS defaults_count
FROM status_definitions
WHERE entity_type = 'ORDER'
GROUP BY tenant_id
ORDER BY tenant_id;
