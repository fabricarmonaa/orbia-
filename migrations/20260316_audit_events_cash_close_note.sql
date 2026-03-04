CREATE TABLE IF NOT EXISTS audit_events (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  branch_id INTEGER,
  actor_user_id INTEGER,
  actor_cashier_id INTEGER,
  actor_role VARCHAR(40) NOT NULL DEFAULT 'sistema',
  action VARCHAR(120) NOT NULL,
  entity_type VARCHAR(120) NOT NULL,
  entity_id VARCHAR(120),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip VARCHAR(120),
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_created_at
  ON audit_events (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_entity
  ON audit_events (tenant_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_audit_events_actor_user
  ON audit_events (tenant_id, actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_actor_cashier
  ON audit_events (tenant_id, actor_cashier_id, created_at DESC);

ALTER TABLE cash_sessions
  ADD COLUMN IF NOT EXISTS close_note TEXT;
