-- Migration: 20260305_orders_paid_amount_cash_entity
-- Objective A: Generic entity_type/entity_id pattern in cash_movements
-- Objective B: paid_amount + payment_status in orders

-- ── Objective B ─────────────────────────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS paid_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20)   NOT NULL DEFAULT 'UNPAID';

-- ── Objective A ─────────────────────────────────────────────────────────────
-- Generic entity reference (no purchase_id FK — canonical generic pattern)
ALTER TABLE cash_movements
  ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50)
    CHECK (entity_type IN ('ORDER','PURCHASE','SALE')),
  ADD COLUMN IF NOT EXISTS entity_id   INTEGER;

-- Index: lookup by entity
CREATE INDEX IF NOT EXISTS idx_cash_movements_entity
  ON cash_movements (tenant_id, entity_type, entity_id);

-- Index: lookup by branch + time (common for cashier views)
CREATE INDEX IF NOT EXISTS idx_cash_movements_branch_time
  ON cash_movements (tenant_id, branch_id, created_at DESC);
