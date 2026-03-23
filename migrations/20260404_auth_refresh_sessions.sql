CREATE TABLE IF NOT EXISTS auth_refresh_sessions (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash varchar(128) NOT NULL,
  device_label varchar(160),
  ip_address varchar(120),
  user_agent text,
  remember_device boolean NOT NULL DEFAULT false,
  expires_at timestamp NOT NULL,
  last_seen_at timestamp NOT NULL DEFAULT now(),
  revoked_at timestamp,
  replaced_by_session_id integer,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_refresh_sessions_user
  ON auth_refresh_sessions(user_id, revoked_at);
CREATE INDEX IF NOT EXISTS idx_auth_refresh_sessions_hash
  ON auth_refresh_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_refresh_sessions_tenant
  ON auth_refresh_sessions(tenant_id, expires_at);
