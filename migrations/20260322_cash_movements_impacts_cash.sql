ALTER TABLE cash_movements
  ADD COLUMN IF NOT EXISTS impacts_cash BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_cash_movements_tenant_impacts_cash
  ON cash_movements (tenant_id, impacts_cash, created_at DESC);
