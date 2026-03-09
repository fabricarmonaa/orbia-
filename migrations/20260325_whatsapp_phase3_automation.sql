ALTER TABLE whatsapp_conversations
  ADD COLUMN IF NOT EXISTS automation_paused_until timestamp,
  ADD COLUMN IF NOT EXISTS last_automation_at timestamp,
  ADD COLUMN IF NOT EXISTS last_human_at timestamp,
  ADD COLUMN IF NOT EXISTS external_thread_id varchar(200),
  ADD COLUMN IF NOT EXISTS automation_session_id varchar(200),
  ADD COLUMN IF NOT EXISTS automation_context jsonb,
  ADD COLUMN IF NOT EXISTS last_inbound_message_id integer,
  ADD COLUMN IF NOT EXISTS last_outbound_message_id integer;

UPDATE whatsapp_conversations
SET owner_mode = 'automation'
WHERE owner_mode = 'auto';

UPDATE whatsapp_conversations
SET handoff_status = 'resolved'
WHERE handoff_status = 'completed';

CREATE TABLE IF NOT EXISTS tenant_whatsapp_automation_configs (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  provider_type varchar(50) NOT NULL DEFAULT 'n8n_webhook',
  webhook_url text,
  signing_secret_encrypted text,
  timeout_ms integer NOT NULL DEFAULT 8000,
  retry_enabled boolean NOT NULL DEFAULT true,
  retry_max_attempts integer NOT NULL DEFAULT 3,
  allowed_branch_id integer REFERENCES branches(id) ON DELETE SET NULL,
  last_test_at timestamp,
  last_test_status varchar(20),
  last_test_message text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_whatsapp_automation_configs_tenant
  ON tenant_whatsapp_automation_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_whatsapp_automation_configs_branch
  ON tenant_whatsapp_automation_configs(allowed_branch_id);
