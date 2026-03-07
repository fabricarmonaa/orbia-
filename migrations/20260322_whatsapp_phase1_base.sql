CREATE TABLE IF NOT EXISTS tenant_whatsapp_channels (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
  provider VARCHAR(20) NOT NULL DEFAULT 'meta',
  phone_number VARCHAR(40) NOT NULL,
  phone_number_id VARCHAR(120) NOT NULL,
  business_account_id VARCHAR(120),
  display_name VARCHAR(200),
  access_token_encrypted TEXT,
  app_secret_encrypted TEXT,
  webhook_verify_token_encrypted TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  metadata_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_whatsapp_channels_tenant_phone ON tenant_whatsapp_channels(tenant_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_tenant_whatsapp_channels_phone_number_id ON tenant_whatsapp_channels(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_tenant_whatsapp_channels_tenant ON tenant_whatsapp_channels(tenant_id);

CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
  channel_id INTEGER NOT NULL REFERENCES tenant_whatsapp_channels(id) ON DELETE CASCADE,
  customer_id INTEGER,
  customer_phone VARCHAR(40) NOT NULL,
  customer_name VARCHAR(200),
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  unread_count INTEGER NOT NULL DEFAULT 0,
  last_inbound_at TIMESTAMP,
  last_outbound_at TIMESTAMP,
  last_message_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_tenant_phone ON whatsapp_conversations(tenant_id, customer_phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_channel ON whatsapp_conversations(channel_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_assigned_user ON whatsapp_conversations(assigned_user_id);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id INTEGER NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  channel_id INTEGER NOT NULL REFERENCES tenant_whatsapp_channels(id) ON DELETE CASCADE,
  provider_message_id VARCHAR(160),
  direction VARCHAR(20) NOT NULL,
  sender_type VARCHAR(20) NOT NULL,
  sender_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  message_type VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
  content_text TEXT,
  media_url TEXT,
  mime_type VARCHAR(120),
  transcription_text TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'RECEIVED',
  raw_payload_json JSONB DEFAULT '{}'::jsonb,
  sent_at TIMESTAMP,
  received_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_tenant_conversation ON whatsapp_messages(tenant_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_provider_message_id ON whatsapp_messages(provider_message_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_created_at ON whatsapp_messages(created_at);

CREATE TABLE IF NOT EXISTS whatsapp_webhook_events (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
  channel_id INTEGER REFERENCES tenant_whatsapp_channels(id) ON DELETE SET NULL,
  event_type VARCHAR(50) NOT NULL,
  provider VARCHAR(20) NOT NULL DEFAULT 'meta',
  payload_json JSONB NOT NULL,
  signature_valid BOOLEAN,
  processing_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_processing_status ON whatsapp_webhook_events(processing_status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_created_at ON whatsapp_webhook_events(created_at);
