ALTER TABLE products
  ADD COLUMN IF NOT EXISTS pricing_mode varchar(20) NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS cost_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS cost_currency varchar(10),
  ADD COLUMN IF NOT EXISTS margin_pct numeric(5,2);

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS chk_products_margin_fields,
  ADD CONSTRAINT chk_products_margin_fields CHECK (
    (pricing_mode = 'MANUAL') OR
    (
      pricing_mode = 'MARGIN' AND
      cost_amount IS NOT NULL AND
      margin_pct IS NOT NULL AND
      margin_pct >= 0
    )
  );

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS chk_products_margin_limit,
  ADD CONSTRAINT chk_products_margin_limit CHECK (margin_pct IS NULL OR margin_pct <= 1000);

CREATE TABLE IF NOT EXISTS exchange_rates (
  id serial PRIMARY KEY,
  tenant_id integer REFERENCES tenants(id),
  base_currency varchar(10) NOT NULL,
  target_currency varchar(10) NOT NULL,
  rate numeric(18,6) NOT NULL,
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT uq_exchange_rates_pair UNIQUE (tenant_id, base_currency, target_currency)
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_tenant ON exchange_rates (tenant_id);
