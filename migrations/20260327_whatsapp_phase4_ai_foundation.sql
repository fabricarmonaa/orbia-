CREATE TABLE IF NOT EXISTS tenant_whatsapp_ai_configs (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  provider varchar(30) NOT NULL DEFAULT 'openai',
  model varchar(120) NOT NULL DEFAULT 'gpt-4o-mini',
  system_prompt text,
  business_context text,
  response_style varchar(50) NOT NULL DEFAULT 'professional_friendly',
  escalation_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  max_context_messages integer NOT NULL DEFAULT 20,
  summary_enabled boolean NOT NULL DEFAULT true,
  summary_max_chars integer NOT NULL DEFAULT 1200,
  tools_enabled boolean NOT NULL DEFAULT false,
  temperature integer NOT NULL DEFAULT 20,
  max_output_tokens integer NOT NULL DEFAULT 500,
  api_key_encrypted text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_whatsapp_ai_configs_tenant ON tenant_whatsapp_ai_configs(tenant_id);

CREATE TABLE IF NOT EXISTS tenant_whatsapp_ai_memory (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  memory_type varchar(40) NOT NULL DEFAULT 'global',
  content text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_whatsapp_ai_memory_tenant_type
  ON tenant_whatsapp_ai_memory(tenant_id, memory_type);

CREATE TABLE IF NOT EXISTS whatsapp_conversation_ai_memory (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id integer NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  summary text,
  flags_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_messages_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_conversation_ai_memory_conversation
  ON whatsapp_conversation_ai_memory(conversation_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversation_ai_memory_tenant
  ON whatsapp_conversation_ai_memory(tenant_id);
