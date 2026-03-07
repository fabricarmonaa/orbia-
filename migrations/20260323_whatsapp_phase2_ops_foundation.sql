ALTER TABLE whatsapp_conversations
  ADD COLUMN IF NOT EXISTS customer_match_confidence integer,
  ADD COLUMN IF NOT EXISTS linked_manually_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_at timestamp,
  ADD COLUMN IF NOT EXISTS owner_mode varchar(20) NOT NULL DEFAULT 'human',
  ADD COLUMN IF NOT EXISTS handoff_status varchar(20) NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS automation_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS automation_paused_reason text,
  ADD COLUMN IF NOT EXISTS assigned_at timestamp,
  ADD COLUMN IF NOT EXISTS last_human_intervention_at timestamp,
  ADD COLUMN IF NOT EXISTS has_human_intervention boolean NOT NULL DEFAULT false;

ALTER TABLE whatsapp_conversations
  ALTER COLUMN status TYPE varchar(30);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'whatsapp_conversations'
      AND constraint_name = 'whatsapp_conversations_customer_id_fkey'
  ) THEN
    ALTER TABLE whatsapp_conversations
      ADD CONSTRAINT whatsapp_conversations_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS whatsapp_conversation_events (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id integer REFERENCES branches(id) ON DELETE SET NULL,
  channel_id integer REFERENCES tenant_whatsapp_channels(id) ON DELETE SET NULL,
  conversation_id integer NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  message_id integer REFERENCES whatsapp_messages(id) ON DELETE SET NULL,
  customer_id integer REFERENCES customers(id) ON DELETE SET NULL,
  actor_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  event_type varchar(80) NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversation_events_conversation
  ON whatsapp_conversation_events (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversation_events_tenant
  ON whatsapp_conversation_events (tenant_id, created_at);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversation_events_type
  ON whatsapp_conversation_events (event_type);
