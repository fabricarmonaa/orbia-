ALTER TABLE users
  ADD COLUMN IF NOT EXISTS disabled boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_users_disabled ON users(disabled);
