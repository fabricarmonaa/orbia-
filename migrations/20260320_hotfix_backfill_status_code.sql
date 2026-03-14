-- HOTFIX: canonicalize orders.status_code (idempotent)
-- 0) Ensure at least one default ORDER status per tenant (if missing)
WITH missing_default AS (
  SELECT tenant_id
  FROM status_definitions
  WHERE entity_type = 'ORDER'
  GROUP BY tenant_id
  HAVING SUM(CASE WHEN is_default THEN 1 ELSE 0 END) = 0
),
pick_one AS (
  SELECT DISTINCT ON (sd.tenant_id) sd.id
  FROM status_definitions sd
  JOIN missing_default md ON md.tenant_id = sd.tenant_id
  WHERE sd.entity_type = 'ORDER'
  ORDER BY sd.tenant_id, COALESCE(sd.sort_order, 999999), sd.id
)
UPDATE status_definitions sd
SET is_default = true
FROM pick_one p
WHERE sd.id = p.id;

-- 1) Backfill from legacy status_id -> order_statuses.code -> status_definitions.code
UPDATE orders o
SET status_code = sd.code
FROM order_statuses os
JOIN status_definitions sd
  ON sd.tenant_id = os.tenant_id
 AND sd.entity_type = 'ORDER'
 AND upper(sd.code) = upper(os.code)
WHERE (o.status_code IS NULL OR btrim(o.status_code) = '')
  AND o.status_id IS NOT NULL
  AND os.id = o.status_id;

-- 2) Fill remaining NULL/empty with tenant default ORDER status
UPDATE orders o
SET status_code = sd.code
FROM status_definitions sd
WHERE (o.status_code IS NULL OR btrim(o.status_code) = '')
  AND sd.tenant_id = o.tenant_id
  AND sd.entity_type = 'ORDER'
  AND sd.is_default = true;

-- 3) Normalize invalid status_code to tenant default
UPDATE orders o
SET status_code = sd_def.code
FROM status_definitions sd_def
WHERE o.status_code IS NOT NULL
  AND btrim(o.status_code) <> ''
  AND sd_def.tenant_id = o.tenant_id
  AND sd_def.entity_type = 'ORDER'
  AND sd_def.is_default = true
  AND NOT EXISTS (
    SELECT 1
    FROM status_definitions sd_ok
    WHERE sd_ok.tenant_id = o.tenant_id
      AND sd_ok.entity_type = 'ORDER'
      AND sd_ok.code = o.status_code
  );

-- 4) Verification
SELECT count(*) AS orders_without_status_code
FROM orders
WHERE status_code IS NULL OR btrim(status_code)='';

SELECT count(*) AS orders_with_invalid_status_code
FROM orders o
WHERE o.status_code IS NOT NULL AND btrim(o.status_code) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM status_definitions sd
    WHERE sd.tenant_id = o.tenant_id AND sd.entity_type='ORDER' AND sd.code = o.status_code
  );
