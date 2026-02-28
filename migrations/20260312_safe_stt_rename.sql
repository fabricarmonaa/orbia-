-- Prevent Drizzle kit from dropping tenant_dashboard_settings or renaming it interactively to stt_interactions.
-- 20260304_stt_interactions.sql already created stt_interactions.
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenant_dashboard_settings') THEN
        ALTER TABLE tenant_dashboard_settings RENAME TO tenant_dashboard_settings_legacy;
    END IF;
END $$;
