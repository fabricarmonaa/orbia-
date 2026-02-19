CREATE TABLE IF NOT EXISTS email_campaigns (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  subject VARCHAR(200) NOT NULL,
  html TEXT NOT NULL,
  text TEXT,
  send_to_all BOOLEAN NOT NULL DEFAULT FALSE,
  requested_tenant_ids_json JSONB DEFAULT '[]'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  total_recipients INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_email_campaigns_created_by ON email_campaigns(created_by_user_id);

CREATE TABLE IF NOT EXISTS email_delivery_logs (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES email_campaigns(id),
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  to_email VARCHAR(255) NOT NULL,
  status VARCHAR(10) NOT NULL,
  error_message VARCHAR(500),
  sent_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_delivery_campaign ON email_delivery_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_delivery_tenant ON email_delivery_logs(tenant_id);

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
