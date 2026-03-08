ALTER TABLE tenant_whatsapp_automation_configs
  ADD COLUMN IF NOT EXISTS webhook_url_production text,
  ADD COLUMN IF NOT EXISTS rules_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS handoff_on_unknown boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS generic_fallback_reply text;
