-- Migration: Fix plan limits (idempotent)
-- Fixes max_cashiers key being absent in limitsJson; correct ESCALA to max 10 cashiers
-- Run: docker exec orbia-postgres-1 psql -U orbia -d orbia -f /migrations/20260305_fix_plan_limits.sql

UPDATE plans
SET limits_json = jsonb_set(
  jsonb_set(
    COALESCE(limits_json::jsonb, '{}'::jsonb),
    '{max_cashiers}', '0'::jsonb
  ),
  '{cashiers_max}', '0'::jsonb
)
WHERE plan_code = 'ECONOMICO';

UPDATE plans
SET limits_json = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        COALESCE(limits_json::jsonb, '{}'::jsonb),
        '{max_cashiers}', '2'::jsonb
      ),
      '{cashiers_max}', '2'::jsonb
    ),
    '{max_branches}', '1'::jsonb
  ),
  '{branches_max}', '1'::jsonb
)
WHERE plan_code = 'PROFESIONAL';

UPDATE plans
SET limits_json = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        COALESCE(limits_json::jsonb, '{}'::jsonb),
        '{max_cashiers}', '10'::jsonb
      ),
      '{cashiers_max}', '10'::jsonb
    ),
    '{max_branches}', '5'::jsonb
  ),
  '{branches_max}', '5'::jsonb
)
WHERE plan_code = 'ESCALA';

-- Verify
SELECT plan_code, limits_json->>'max_branches' AS max_branches, limits_json->>'max_cashiers' AS max_cashiers
FROM plans
ORDER BY plan_code;
