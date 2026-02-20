ALTER TABLE plans ADD COLUMN IF NOT EXISTS description varchar(500);
ALTER TABLE plans ADD COLUMN IF NOT EXISTS currency varchar(10) DEFAULT 'ARS';
ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_branches integer DEFAULT 1;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS allow_cashiers boolean NOT NULL DEFAULT false;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS allow_margin_pricing boolean NOT NULL DEFAULT false;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS allow_excel_import boolean NOT NULL DEFAULT false;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS allow_custom_tos boolean NOT NULL DEFAULT false;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS created_at timestamp NOT NULL DEFAULT now();
ALTER TABLE plans ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now();
ALTER TABLE plans ALTER COLUMN price_monthly TYPE numeric(12,2);

CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id),
  plan_code varchar(50) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  starts_at timestamp NOT NULL DEFAULT now(),
  expires_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_tenant ON tenant_subscriptions(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_subscriptions_active
  ON tenant_subscriptions(tenant_id)
  WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS system_settings (
  id serial PRIMARY KEY,
  key varchar(100) NOT NULL UNIQUE,
  value text,
  updated_at timestamp NOT NULL DEFAULT now()
);
