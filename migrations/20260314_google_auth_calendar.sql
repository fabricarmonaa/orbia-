CREATE TABLE IF NOT EXISTS user_google_connections (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  google_user_id VARCHAR(255) NOT NULL,
  google_email VARCHAR(255) NOT NULL,
  encrypted_refresh_token TEXT,
  encrypted_access_token TEXT,
  access_token_expires_at TIMESTAMP,
  selected_calendar_id VARCHAR(255),
  scopes TEXT,
  connected_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_google_connections_user ON user_google_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_user_google_connections_tenant ON user_google_connections(tenant_id);
