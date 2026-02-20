ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tos_content text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tos_updated_at timestamp;
ALTER TABLE tenants ALTER COLUMN slug TYPE varchar(120);

UPDATE tenants
SET slug = regexp_replace(
  regexp_replace(lower(coalesce(NULLIF(slug, ''), code, 'tenant-' || id::text)), '[^a-z0-9-]+', '-', 'g'),
  '(^-+|-+$)',
  '',
  'g'
);

UPDATE tenants
SET slug = 'tenant-' || id::text
WHERE slug IS NULL OR slug = '';

WITH ranked AS (
  SELECT id, slug, row_number() OVER (PARTITION BY slug ORDER BY id) AS rn
  FROM tenants
)
UPDATE tenants t
SET slug = t.slug || '-' || t.id
FROM ranked r
WHERE t.id = r.id AND r.rn > 1;

ALTER TABLE tenants ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenants_slug ON tenants(slug);
