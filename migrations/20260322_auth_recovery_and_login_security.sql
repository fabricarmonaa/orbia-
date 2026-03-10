CREATE TABLE IF NOT EXISTS auth_login_attempts (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER REFERENCES tenants(id),
  tenant_code VARCHAR(60),
  user_id INTEGER REFERENCES users(id),
  email VARCHAR(255),
  ip VARCHAR(100) NOT NULL,
  fingerprint VARCHAR(128) NOT NULL,
  failed_count INTEGER NOT NULL DEFAULT 0,
  first_failed_at TIMESTAMP,
  last_failed_at TIMESTAMP,
  lock_until TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_auth_login_attempts_fingerprint
  ON auth_login_attempts(fingerprint);
CREATE INDEX IF NOT EXISTS idx_auth_login_attempts_fingerprint
  ON auth_login_attempts(fingerprint);
CREATE INDEX IF NOT EXISTS idx_auth_login_attempts_lock_until
  ON auth_login_attempts(lock_until);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER REFERENCES tenants(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  email VARCHAR(255) NOT NULL,
  token_hash VARCHAR(128) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  revoked BOOLEAN NOT NULL DEFAULT false,
  requested_ip VARCHAR(100),
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash
  ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
  ON password_reset_tokens(user_id, created_at);
