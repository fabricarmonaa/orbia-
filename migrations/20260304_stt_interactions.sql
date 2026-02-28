CREATE TABLE IF NOT EXISTS stt_interactions (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  user_id INTEGER REFERENCES users(id),
  transcript TEXT NOT NULL,
  intent_confirmed VARCHAR(80) NOT NULL,
  entities_confirmed JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stt_interactions_tenant ON stt_interactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stt_interactions_tenant_user ON stt_interactions(tenant_id, user_id);
