CREATE TABLE IF NOT EXISTS super_admin_totp (
  id serial PRIMARY KEY,
  super_admin_id integer NOT NULL REFERENCES users(id),
  secret text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  verified_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT uq_super_admin_totp_admin UNIQUE (super_admin_id)
);
CREATE INDEX IF NOT EXISTS idx_super_admin_totp_admin ON super_admin_totp (super_admin_id);

CREATE TABLE IF NOT EXISTS super_admin_audit_logs (
  id serial PRIMARY KEY,
  super_admin_id integer REFERENCES users(id),
  action text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_super_admin_audit_admin ON super_admin_audit_logs (super_admin_id);
