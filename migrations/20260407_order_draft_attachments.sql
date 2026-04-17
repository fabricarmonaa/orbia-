CREATE TABLE IF NOT EXISTS order_draft_attachments (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  field_definition_id INTEGER NOT NULL REFERENCES order_field_definitions(id) ON DELETE CASCADE,
  draft_key VARCHAR(255) NOT NULL,
  original_name VARCHAR(260) NOT NULL,
  stored_name VARCHAR(400) NOT NULL,
  mime_type VARCHAR(127) NOT NULL,
  size_bytes INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_draft_attachments_tenant_user
  ON order_draft_attachments(tenant_id, user_id);

CREATE INDEX IF NOT EXISTS idx_order_draft_attachments_draft_key
  ON order_draft_attachments(tenant_id, user_id, draft_key);
