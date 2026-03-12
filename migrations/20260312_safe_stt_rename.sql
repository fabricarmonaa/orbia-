-- Prevent destructive/interactive rename collisions around tenant_dashboard_settings.
-- This migration is intentionally idempotent and safe across mixed schema states.
DO $$
DECLARE
  source_kind "char";
  target_kind "char";
BEGIN
  SELECT c.relkind
    INTO source_kind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'tenant_dashboard_settings'
  LIMIT 1;

  SELECT c.relkind
    INTO target_kind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'tenant_dashboard_settings_legacy'
  LIMIT 1;

  -- Nothing to do if source relation does not exist.
  IF source_kind IS NULL THEN
    RETURN;
  END IF;

  -- This migration only renames a TABLE source.
  IF source_kind <> 'r' THEN
    RAISE NOTICE 'Skipping rename: tenant_dashboard_settings exists as relkind %, expected table (r).', source_kind;
    RETURN;
  END IF;

  -- Happy path: source table exists and target name is free.
  IF target_kind IS NULL THEN
    ALTER TABLE public.tenant_dashboard_settings RENAME TO tenant_dashboard_settings_legacy;
    RETURN;
  END IF;

  -- If target already exists (table/view/index/etc), migration is considered already resolved.
  RAISE NOTICE 'Skipping rename: target tenant_dashboard_settings_legacy already exists with relkind %.', target_kind;
END $$;
